# FTTH Tool - Supabase SaaS Setup Guide

Complete guide for setting up a production-ready multi-tenant SaaS system with Supabase.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Supabase Project Setup](#supabase-project-setup)
3. [Database Setup](#database-setup)
4. [Authentication Configuration](#authentication-configuration)
5. [Next.js Integration](#nextjs-integration)
6. [Security Configuration](#security-configuration)
7. [Storage Setup](#storage-setup)
8. [Production Deployment](#production-deployment)

---

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- Existing Next.js project (App Router)

### Install Dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D supabase  # CLI (optional but recommended)
```

---

## Supabase Project Setup

### 1. Create Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click "New Project"
3. Choose organization and name (e.g., "ftth-tool-prod")
4. Set database password (save this!)
5. Choose region closest to your users
6. Wait for provisioning (~2 minutes)

### 2. Get API Keys

1. Go to Project Settings → API
2. Copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

### 3. Configure Environment

```bash
cp .env.local.example .env.local
```

Fill in your values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Database Setup

### 1. Run Schema Migration

1. Go to Supabase Dashboard → SQL Editor
2. Create a "New query"
3. Copy contents from `01-schema.sql`
4. Run the query

Expected output:
```
Success. No rows returned
```

### 2. Run RLS Policies

1. Create another new query
2. Copy contents from `02-rls-policies.sql`
3. Run the query

This sets up:
- Row Level Security
- User isolation policies
- Automatic profile creation
- Audit logging triggers

### 3. Verify Tables

Go to Table Editor and confirm these tables exist:
- ✅ profiles
- ✅ processing_jobs
- ✅ subscriptions
- ✅ usage_logs
- ✅ api_keys
- ✅ audit_logs
- ✅ system_config

---

## Authentication Configuration

### 1. Enable Google OAuth

1. Go to Authentication → Providers
2. Find "Google" and enable it
3. Get credentials from [Google Cloud Console](https://console.cloud.google.com/):
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`
   - Copy Client ID and Secret
4. Paste into Supabase Google provider settings
5. Save

### 2. Configure Email (Optional)

For email/password auth:

1. Go to Authentication → Email Templates
2. Customize templates if needed
3. Configure SMTP (recommended for production):
   - Go to Project Settings → Auth
   - Use SendGrid/AWS SES/Resend

### 3. Set Site URL

1. Go to Authentication → URL Configuration
2. Add your production URL:
   - Site URL: `https://yourdomain.com`
   - Redirect URLs: `https://yourdomain.com/auth/callback`

---

## Next.js Integration

### 1. Copy Files

Copy these files to your Next.js project:

```
supabase/nextjs/ → your-project-root/
├── lib/supabase/client.ts
├── lib/supabase/server.ts
├── lib/services/job.service.ts
├── lib/services/profile.service.ts
├── components/auth/auth-provider.tsx
├── middleware.ts  → project root
├── app/auth/callback/route.ts
└── types/supabase.ts
```

### 2. Update Root Layout

Add AuthProvider to `app/layout.tsx`:

```tsx
import { AuthProvider } from '@/components/auth/auth-provider'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
```

### 3. Test Authentication

Create test page `app/test-auth/page.tsx`:

```tsx
'use client'

import { useAuth } from '@/components/auth/auth-provider'

export default function TestAuth() {
  const { user, signInWithOAuth, signOut } = useAuth()

  return (
    <div>
      {user ? (
        <div>
          <p>Logged in as: {user.email}</p>
          <button onClick={signOut}>Sign Out</button>
        </div>
      ) : (
        <button onClick={() => signInWithOAuth('google')}>
          Sign in with Google
        </button>
      )}
    </div>
  )
}
```

---

## Security Configuration

### 1. Enable RLS Enforcement

All tables already have RLS enabled via migration. Verify:

1. Go to Table Editor
2. Click each table → "Policies"
3. Confirm "Enable RLS" is checked

### 2. Review Policies

Each table should have policies:
- ✅ Users can read own data
- ✅ Users can modify own data
- ✅ Service role can manage all data

### 3. Security Headers

Middleware already adds security headers. Verify in browser DevTools:
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Content-Security-Policy (configured)

### 4. CORS Configuration

Go to API Settings → Configure CORS:
```
Allowed origins: https://yourdomain.com, http://localhost:3000
```

---

## Storage Setup

### 1. Create Buckets

Create two storage buckets:

1. Go to Storage → New Bucket
2. Create `uploads` bucket:
   - Public: NO
   - File size limit: 50MB
3. Create `outputs` bucket:
   - Public: NO
   - File size limit: 100MB

### 2. Set Bucket Policies

Run in SQL Editor:

```sql
-- Uploads bucket policies
CREATE POLICY "Users can upload files to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Outputs bucket policies
CREATE POLICY "Users can read own output files"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'outputs' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
```

### 3. Upload Path Convention

Files stored with user isolation:
```
uploads/{user_id}/{job_id}/{filename}
outputs/{user_id}/{job_id}/{filename}
```

---

## Production Deployment

### 1. Environment Variables

Add to Vercel/Cloudflare Pages:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

### 2. Update Supabase Config

1. Go to Authentication → URL Configuration
2. Update Site URL to production
3. Add production redirect URLs

### 3. Database Backups

1. Go to Database → Backups
2. Enable Point-in-Time Recovery (recommended)
3. Schedule regular backups

### 4. Connection Pooling (Optional)

For high traffic:

1. Go to Database → Connection Pooling
2. Enable PgBouncer
3. Update connection string if using direct connections

### 5. Rate Limiting

Go to Database → Rate Limiting:
- Auth: 10 requests / IP / minute
- API: 100 requests / IP / minute (adjust as needed)

---

## Testing Checklist

### Authentication
- [ ] Sign up with email
- [ ] Sign in with email
- [ ] Sign in with Google
- [ ] Sign out
- [ ] Profile auto-created on signup
- [ ] Session persists across refresh

### Authorization
- [ ] Can't access /dashboard without login
- [ ] Middleware redirects to /login
- [ ] After login, redirects back to original page

### Data Isolation
- [ ] User A can't see User B's jobs
- [ ] User A can't modify User B's profile

### Quota System
- [ ] Quota decrements on new job
- [ ] Quota blocks when exceeded
- [ ] Quota resets monthly

---

## Troubleshooting

### Issue: Profile not created on signup
**Solution:** Check that `handle_new_user` trigger exists and is attached to auth.users

### Issue: RLS blocking everything
**Solution:** Ensure policies use `auth.uid() = user_id` correctly

### Issue: OAuth redirect fails
**Solution:** Check redirect URL matches exactly in Supabase config

### Issue: Can't access jobs
**Solution:** Verify JWT secret matches; check RLS policies

---

## Next Steps

1. **Add Workers**: Implement background job processing
2. **Integrate Storage**: Connect file uploads to Supabase Storage
3. **Add Payments**: Integrate Stripe/Midtrans for subscriptions
4. **Analytics**: Connect to PostHog/Amplitude
5. **Monitoring**: Set up Sentry for error tracking

See:
- `docs/ARCHITECTURE.md` - System design details
- `docs/API.md` - API reference
- `docs/DEPLOYMENT.md` - Production deployment guide
