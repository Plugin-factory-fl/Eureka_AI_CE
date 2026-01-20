/**
 * SumVid Learn Backend Server
 * Handles authentication, API key management, and payment verification
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { pool } from './config/database.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import userRoutes from './routes/user.js';
import webhookRoutes from './routes/webhooks.js';
import checkoutRoutes from './routes/checkout.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Trust proxy (required for Render and other reverse proxies)
app.set('trust proxy', true);

// Security middleware
app.use(helmet());

// Static files (for checkout success page, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// CORS configuration
const allowedOriginsRaw = process.env.ALLOWED_ORIGINS || '*';
const allowedOrigins = allowedOriginsRaw.split(',').map(origin => {
  const trimmed = origin.trim();
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed;
  }
});
console.log('[CORS] Allowed origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // If '*' is in allowed origins, allow all
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    // Normalize the incoming origin (remove path if present)
    let normalizedOrigin = origin;
    try {
      const url = new URL(origin);
      normalizedOrigin = `${url.protocol}//${url.host}`;
    } catch {
      // If it's not a URL, use as-is
    }
    
    // Check if origin matches (exact match or wildcard pattern)
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed === normalizedOrigin) return true;
      // Support wildcard patterns like 'chrome-extension://*'
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(normalizedOrigin) || regex.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      return callback(null, true);
    }
    
    // Log rejected origin for debugging
    console.log('[CORS] Rejected origin:', origin, '(normalized:', normalizedOrigin + ')');
    console.log('[CORS] Allowed origins:', allowedOrigins);
    callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe webhook route needs raw body for signature verification
// Must be BEFORE other body parsers
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// Body parsing middleware for all other routes
// Increase limit to handle large image data (base64 encoded images can be several MB)
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/checkout', checkoutRoutes);

// Stripe redirect pages
app.get('/checkout-success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout-success.html'));
});

app.get('/checkout-cancelled', (req, res) => {
  res.status(200).send('Checkout cancelled. You can close this tab.');
});
app.use('/api', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`SumVid Learn backend server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});
