/**
 * Checkout Routes
 * Handles Stripe Checkout session creation for subscriptions
 */

import express from 'express';
import { stripe } from '../config/stripe.js';
import { query } from '../config/database.js';
import { verifyToken } from '../config/auth.js';

const router = express.Router();

const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const BACKEND_URL = process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
// Stripe requires valid HTTPS URLs, so we use the backend URL for redirects
// The extension will poll or check the session status after redirect
const FRONTEND_URL = process.env.FRONTEND_URL || BACKEND_URL;

/**
 * POST /api/checkout/create-session
 * Create a Stripe Checkout session for subscription
 * 
 * Optional authentication - if user is logged in, link to their account
 */
router.post('/create-session', async (req, res) => {
  try {
    if (!STRIPE_PRICE_ID) {
      return res.status(500).json({ error: 'Stripe price ID not configured' });
    }

    // Try to get user from auth token (optional)
    let userId = null;
    let userEmail = null;
    let stripeCustomerId = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = verifyToken(token);
        userId = decoded.userId;

        // Get user info from database
        const userResult = await query(
          'SELECT id, email, stripe_customer_id FROM users WHERE id = $1',
          [userId]
        );

        if (userResult.rows.length > 0) {
          userEmail = userResult.rows[0].email;
          stripeCustomerId = userResult.rows[0].stripe_customer_id;
        }
      } catch (error) {
        // Token invalid or expired - continue without auth
        console.log('[Checkout] No valid auth token, proceeding as guest');
      }
    }

    // Create or retrieve Stripe customer
    let customer;
    if (stripeCustomerId) {
      // User already has a Stripe customer ID
      try {
        customer = await stripe.customers.retrieve(stripeCustomerId);
      } catch (error) {
        console.log('[Checkout] Customer not found in Stripe, creating new one');
        stripeCustomerId = null;
      }
    }

    if (!stripeCustomerId) {
      // Create new Stripe customer
      const customerData = {
        email: userEmail || undefined, // Will be collected in checkout if not provided
        metadata: userId ? { user_id: userId.toString() } : {}
      };

      customer = await stripe.customers.create(customerData);

      // If user is authenticated, save the customer ID
      if (userId) {
        await query(
          'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
          [customer.id, userId]
        );
        console.log(`[Checkout] Linked Stripe customer ${customer.id} to user ${userId}`);
      }
    }

    // Create checkout session
    // Note: For Chrome extensions, we use the backend URL for redirects
    // The extension will handle checking the subscription status via webhooks or polling
    const successUrl = `${BACKEND_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${BACKEND_URL}/checkout-cancelled`;
    
    console.log('[Checkout] Using URLs:', { successUrl, cancelUrl, BACKEND_URL });
    
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: 'en',
      metadata: {
        user_id: userId ? userId.toString() : '',
      },
      subscription_data: {
        metadata: {
          user_id: userId ? userId.toString() : '',
        },
      },
      allow_promotion_codes: true,
    });

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('[Checkout] Error creating session:', error);
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      message: error.message 
    });
  }
});

/**
 * GET /api/checkout/session-status
 * Get checkout session status (for verifying after redirect)
 */
router.get('/session-status', async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    res.json({
      status: session.status,
      customer: session.customer,
      subscription: session.subscription,
      payment_status: session.payment_status,
    });
  } catch (error) {
    console.error('[Checkout] Error retrieving session:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve session status',
      message: error.message 
    });
  }
});

export default router;
