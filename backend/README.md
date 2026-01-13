# Eureka AI Backend Server

Backend server for the Eureka AI Chrome extension, handling authentication, API key management, and payment verification.

## Features

- ✅ User authentication (register/login)
- ✅ Secure API key storage (OpenAI)
- ✅ Database for user management
- ✅ JWT token-based authentication
- ✅ Stripe integration for premium subscriptions
- ✅ Daily usage tracking and limits
- ✅ Video summarization API
- ✅ Quiz generation API
- ✅ Q&A chat API

## Setup Instructions

### 1. Local Development Setup

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Set Up Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in:
   - `DATABASE_URL` - Your local PostgreSQL connection string
   - `JWT_SECRET` - A random secret string for JWT signing
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `STRIPE_SECRET_KEY` - Your Stripe secret key (optional for local dev)
   - `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook signing secret (optional for local dev)
   - `STRIPE_PRICE_ID` - Your Stripe price ID for subscriptions (optional for local dev)
   - `ALLOWED_ORIGINS` - CORS allowed origins

3. **Set Up Local PostgreSQL Database**
   - Install PostgreSQL locally
   - Create a database:
     ```sql
     CREATE DATABASE sumvid_learn_dev;
     ```
   - Update `DATABASE_URL` in `.env`:
     ```
     DATABASE_URL=postgresql://username:password@localhost:5432/sumvid_learn_dev
     ```

4. **Run Database Migrations**
   ```bash
   npm run migrate
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

### 2. Render Deployment Setup

#### Step 1: Create PostgreSQL Database on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "PostgreSQL"
3. Configure:
   - Name: `sumvid-learn-db`
   - Database: `sumvid_learn`
   - User: `sumvid_learn_user`
   - Region: Choose closest to your users
4. Note the **Internal Database URL** (you'll need this)

#### Step 2: Create Web Service on Render

1. In Render Dashboard, click "New +" → "Web Service"
2. Connect your GitHub repository (or use manual deploy)
3. Configure the service:
   - **Name**: `sumvid-learn-backend`
   - **Root Directory**: `backend` (if your backend is in a subdirectory)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Starter (or higher for production)

#### Step 3: Set Environment Variables

In your Web Service settings, go to **"Environment"** tab and add:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Environment mode |
| `DATABASE_URL` | `[Internal Database URL]` | From PostgreSQL service |
| `JWT_SECRET` | `[Random string]` | Generate with: `openssl rand -base64 32` |
| `OPENAI_API_KEY` | `sk-proj-...` | Your OpenAI API key (required) |
| `STRIPE_SECRET_KEY` | `sk_live_...` or `sk_test_...` | Your Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Webhook signing secret (from Stripe webhook endpoint) |
| `STRIPE_PRICE_ID` | `price_...` | Your Stripe subscription price ID |
| `FRONTEND_URL` | `chrome-extension://` | For checkout redirects |
| `ALLOWED_ORIGINS` | `chrome-extension://*` | CORS allowed origins |

#### Step 4: Deploy

1. Render will automatically deploy when you push to your repository
2. Or click "Manual Deploy" → "Deploy latest commit"
3. Wait for deployment to complete
4. Note your service URL (e.g., `https://sumvid-learn-backend.onrender.com`)

#### Step 5: Run Database Migrations

After first deployment, run migrations:

1. Go to your Web Service → "Shell"
2. Run:
   ```bash
   npm run migrate
   ```

Or use Render's scheduled jobs feature to run migrations automatically.

#### Step 6: Set Up Stripe Webhook

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-backend-url.onrender.com/api/webhooks/stripe`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` environment variable

### 3. Update Chrome Extension

Update your extension's `background.js` to use the backend API:

1. Add your Render backend URL to the extension
2. Update API calls to use the backend instead of direct OpenAI calls
3. Implement authentication flow

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/verify` - Verify token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/change-password` - Change password (requires auth)

### API

- `POST /api/summarize` - Generate video summary (requires auth)
- `POST /api/quiz` - Generate quiz questions (requires auth)
- `POST /api/qa` - Answer questions about video (requires auth)

### User

- `GET /api/user/profile` - Get user profile (requires auth)
- `GET /api/user/usage` - Get usage stats (requires auth)

### Checkout

- `POST /api/checkout/create-session` - Create Stripe checkout session
- `GET /api/checkout/session-status` - Get checkout session status

### Webhooks

- `POST /api/webhooks/stripe` - Handle Stripe webhook events

## Database Schema

### users

- `id` - Primary key
- `email` - Unique email address
- `password_hash` - Bcrypt hashed password
- `name` - User's name (optional)
- `enhancements_used` - Current daily usage count
- `enhancements_limit` - Daily limit (10 for freemium, 999999 for premium)
- `subscription_status` - 'freemium' or 'premium'
- `stripe_customer_id` - Stripe customer ID (optional)
- `stripe_subscription_id` - Stripe subscription ID (optional)
- `password_reset_token` - Password reset token (optional)
- `password_reset_expires` - Password reset expiration (optional)
- `last_reset_date` - Last date usage was reset
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp

## Environment Variables

See `.env.example` for all required environment variables.

## License

ISC
