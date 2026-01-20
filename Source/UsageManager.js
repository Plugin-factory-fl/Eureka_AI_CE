/**
 * Usage Manager Module
 * Handles usage tracking, status cards, and button state management
 */

(function() {
  'use strict';

  class UsageManager {
    constructor(options = {}) {
      this.getProButton = options.getProButton;
      this.getProTexts = ['Get Pro', 'Get unlimited usage'];
      this.getProTextIndex = 0;
      this.getProInterval = null;
      
      // Cache for API responses to reduce calls
      this.cache = {
        usage: null,
        profile: null,
        cacheTime: 0,
        cacheTTL: 30000 // 30 seconds cache
      };
      
      // Throttle updateStatusCards to prevent too many calls
      this.updatePending = false;
      this.lastUpdateTime = 0;
      this.updateThrottle = 2000; // Minimum 2 seconds between updates
      
      this.init();
    }

    init() {
      // Initialize Get Pro button text rotation
      if (this.getProButton) {
        this.getProButton.textContent = this.getProTexts[0];
        this.startGetProTextRotation();
      }
    }

    startGetProTextRotation() {
      if (this.getProInterval || !this.getProButton) return;
      this.getProInterval = setInterval(() => {
        if (this.getProButton) {
          this.getProTextIndex = (this.getProTextIndex + 1) % this.getProTexts.length;
          this.getProButton.textContent = this.getProTexts[this.getProTextIndex];
        }
      }, 3500);
    }

    updateUsesCounter(usage, subscriptionStatus) {
      // Old footer section removed - functionality moved to header usage card
      // This method kept for backward compatibility but does nothing
      // All usage display is now handled by updateHeaderUsageCard()
    }

    updateHeaderUsageCard(usage, subscriptionStatus) {
      try {
        const headerCard = document.getElementById('header-usage-card');
        const usesRemaining = document.getElementById('header-uses-remaining');
        const upgradeBtn = document.getElementById('header-upgrade-btn');
        
        if (!headerCard || !usesRemaining) return;

        // Hide for premium users
        if (subscriptionStatus === 'premium') {
          headerCard.style.display = 'none';
          return;
        }

        // Show for freemium users
        if (!usage) {
          headerCard.style.display = 'none';
          return;
        }

        const remaining = Math.max(0, (usage.enhancementsLimit || 0) - (usage.enhancementsUsed || 0));
        usesRemaining.textContent = `${remaining} uses remaining`;
        headerCard.style.display = 'flex';

        // Wire up upgrade button
        if (upgradeBtn && !upgradeBtn.hasAttribute('data-handler-attached')) {
          upgradeBtn.setAttribute('data-handler-attached', 'true');
          upgradeBtn.addEventListener('click', async () => {
            if (window.infoDialogsManager && window.infoDialogsManager.handleUpgrade) {
              await window.infoDialogsManager.handleUpgrade();
            }
          });
        }
      } catch (e) {
        console.warn('[Eureka AI] Failed to update header usage card:', e);
      }
    }

    async updateStatusCards(forceRefresh = false) {
      // Throttle updates to prevent too many API calls
      const now = Date.now();
      if (!forceRefresh && this.updatePending) {
        return; // Already updating
      }
      if (!forceRefresh && (now - this.lastUpdateTime) < this.updateThrottle) {
        // Schedule update after throttle period
        setTimeout(() => this.updateStatusCards(forceRefresh), this.updateThrottle - (now - this.lastUpdateTime));
        return;
      }
      
      this.updatePending = true;
      this.lastUpdateTime = now;
      
      const enhancementsCountEl = document.getElementById('account-enhancements-count');
      const enhancementsLimitEl = document.getElementById('account-enhancements-limit');
      const userStatusEl = document.getElementById('account-user-status');
      const userPlanEl = document.getElementById('account-user-plan');
      
      try {
        const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';
        let usage = null;
        let subscriptionStatus = 'freemium';
        
        const stored = await chrome.storage.local.get(['sumvid_auth_token']);
        const token = stored.sumvid_auth_token;
        
        // Use cache if available and not forcing refresh
        const cacheAge = now - this.cache.cacheTime;
        if (!forceRefresh && this.cache.usage && this.cache.profile && cacheAge < this.cache.cacheTTL) {
          usage = this.cache.usage;
          subscriptionStatus = this.cache.profile.subscription_status || 'freemium';
          
          if (userStatusEl) {
            userStatusEl.textContent = this.cache.profile.displayName || 'User';
          }
          if (userPlanEl) {
            userPlanEl.textContent = subscriptionStatus === 'premium' ? 'PRO' : 'Freemium';
          }
        } else if (token) {
          try {
            // Fetch usage data
            const usageResponse = await fetch(`${BACKEND_URL}/api/user/usage`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            
            if (usageResponse.ok) {
              const data = await usageResponse.json();
              usage = {
                enhancementsUsed: data.enhancementsUsed || 0,
                enhancementsLimit: data.enhancementsLimit || 10
              };
              subscriptionStatus = data.subscriptionStatus || 'freemium';
              this.cache.usage = usage;
            } else if (usageResponse.status === 429) {
              console.warn('[Eureka AI] Rate limited on usage API, using cache');
              if (this.cache.usage) {
                usage = this.cache.usage;
              }
            }
            
            // Fetch profile to get subscription status and user info
            const profileResponse = await fetch(`${BACKEND_URL}/api/user/profile`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            
            if (profileResponse.ok) {
              const profileData = await profileResponse.json();
              const userProfile = profileData.user || profileData;
              subscriptionStatus = userProfile.subscription_status || subscriptionStatus;
              
              // Update user status and plan
              const displayName = (userProfile.name && userProfile.name.trim()) 
                ? userProfile.name 
                : (userProfile.email || 'User');
              
              this.cache.profile = {
                subscription_status: subscriptionStatus,
                displayName: displayName
              };
              
              if (userStatusEl) {
                userStatusEl.textContent = displayName;
              }
              if (userPlanEl) {
                userPlanEl.textContent = subscriptionStatus === 'premium' ? 'PRO' : 'Freemium';
              }
            } else if (profileResponse.status === 429) {
              console.warn('[Eureka AI] Rate limited on profile API, using cache');
              if (this.cache.profile) {
                subscriptionStatus = this.cache.profile.subscription_status || 'freemium';
                if (userStatusEl) {
                  userStatusEl.textContent = this.cache.profile.displayName || 'User';
                }
                if (userPlanEl) {
                  userPlanEl.textContent = subscriptionStatus === 'premium' ? 'PRO' : 'Freemium';
                }
              }
            }
            
            // Update cache timestamp
            this.cache.cacheTime = now;
          } catch (error) {
            console.warn('[Eureka AI] Failed to get usage from backend:', error);
            // Use cache if available
            if (this.cache.usage) {
              usage = this.cache.usage;
            }
            if (this.cache.profile) {
              subscriptionStatus = this.cache.profile.subscription_status || 'freemium';
            }
          }
        }
        
        // If no token or fetch failed, use defaults
        if (!usage) {
          usage = {
            enhancementsUsed: 0,
            enhancementsLimit: 10
          };
        }
        
        if (enhancementsCountEl) enhancementsCountEl.textContent = usage.enhancementsUsed;
        if (enhancementsLimitEl) enhancementsLimitEl.textContent = usage.enhancementsLimit;
        
        // Update user status and plan (profile already fetched above if token exists)
        if (!token) {
          if (userStatusEl) {
            userStatusEl.textContent = 'Not Logged In';
          }
          if (userPlanEl) {
            userPlanEl.textContent = 'Freemium';
          }
        }
        
        // Update uses counter (hides old footer)
        this.updateUsesCounter(usage, subscriptionStatus);
        
        // Update header usage card (shows in header for freemium)
        this.updateHeaderUsageCard(usage, subscriptionStatus);
        
        // Update UI for premium users
        if (window.premiumManager) {
          await window.premiumManager.updateUIForPremium();
        }
        
        // Update button states
        this.updateButtonStates(usage.enhancementsUsed >= usage.enhancementsLimit);
      } catch (error) {
        console.error('Error updating status cards:', error);
        const enhancementsCountEl = document.getElementById('account-enhancements-count');
        const enhancementsLimitEl = document.getElementById('account-enhancements-limit');
        if (enhancementsCountEl) enhancementsCountEl.textContent = '0';
        if (enhancementsLimitEl) enhancementsLimitEl.textContent = '10';
      } finally {
        this.updatePending = false;
      }
    }

    updateButtonStates(limitReached) {
      const summarizeButton = document.getElementById('summarize-button');
      const makeTestButton = document.getElementById('make-test-button');
      
      if (summarizeButton) {
        summarizeButton.disabled = limitReached;
        if (limitReached) {
          summarizeButton.title = 'Daily limit reached. Reset tomorrow.';
        }
      }
      if (makeTestButton) {
        makeTestButton.disabled = limitReached;
        if (limitReached) {
          makeTestButton.title = 'Daily limit reached. Reset tomorrow.';
        }
      }
    }

    async checkUsageLimit() {
      try {
        const BACKEND_URL = 'https://sumvid-learn-backend.onrender.com';
        const stored = await chrome.storage.local.get(['sumvid_auth_token']);
        const token = stored.sumvid_auth_token;
        
        if (token) {
          const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const usage = await response.json();
            return usage.enhancementsUsed >= usage.enhancementsLimit;
          }
        }
      } catch (error) {
        console.warn('[Eureka AI] Failed to check usage limit from backend:', error);
      }
      
      // Fallback to local storage
      if (window.UsageTracker) {
        return await window.UsageTracker.isLimitReached();
      }
      
      return false; // Allow usage on error
    }
  }

  // Export to global scope
  window.UsageManager = UsageManager;
})();
