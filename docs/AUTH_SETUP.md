# ZCare — Password Reset & Google Sign-in: Setup

The code is in place. **Two things must be configured in the Supabase Dashboard** (and Google Cloud) before they work against the real project. No secrets go in source code or `.env`; the Google client secret lives only in Supabase.

Replace `<project-ref>` with your project's reference (the subdomain of `VITE_SUPABASE_URL`), and `https://your-domain` with the production URL.

## 1. Supabase URL configuration (both features)

Dashboard → **Authentication → URL Configuration**

| Setting | Value |
|---|---|
| Site URL | `https://your-domain` (production). For local-only testing: `http://localhost:5173` |
| Redirect URLs | `http://localhost:5173/reset-password`<br>`http://localhost:5173/auth/callback`<br>`https://your-domain/reset-password`<br>`https://your-domain/auth/callback`<br>(add `http://localhost:4173/...` too if you test with `npm run preview`) |

If a URL is **not** in this list, Supabase silently sends the user to the Site URL instead. ZCare still catches a reset link that lands on `/` and shows the reset form. Even so, add the exact URLs.

## 2. Password reset

- The app calls `resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`; no extra setting is needed beyond the Redirect URLs above.
- Email template (Authentication → **Email Templates → Reset Password**): the default template using `{{ .ConfirmationURL }}` works. Don't hard-code a URL in the template.
- Link lifetime: Authentication → **Providers → Email → Email OTP Expiration** (default 3600 s). Expired links show "This password reset link has expired" with a button to request a new one.
- Default emails are rate-limited (a few per hour) on the built-in SMTP. Configure custom SMTP (Authentication → SMTP Settings) for production.

## 3. Google OAuth

### a) Google Cloud Console
1. https://console.cloud.google.com → create or select a project.
2. **APIs & Services → OAuth consent screen**: User type *External*; app name "ZCare"; support email; authorised domain = your production domain (and `supabase.co`). Scopes: `openid`, `email`, `profile` (defaults). While in *Testing*, add your test Google accounts as test users.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
   - **Authorised JavaScript origins:** `http://localhost:5173`, `https://your-domain`
   - **Authorised redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`. This is **Supabase's** callback, not ZCare's `/auth/callback`.
4. Copy the **Client ID** and **Client secret**.

### b) Supabase
Dashboard → **Authentication → Providers → Google** → Enable → paste the Client ID and Client secret → Save. The callback URL shown there must match step 3 above.

### c) Flow
`Continue with Google` → Google → `https://<project-ref>.supabase.co/auth/v1/callback` → `https://your-domain/auth/callback` (ZCare) → **existing profile:** dashboard; **new user:** the existing `/profile` onboarding (name pre-filled from Google; saved only when the user submits).

Account linking: if someone already has an email/password account with the same verified Gmail address, Supabase links the Google identity to the **same user** (same UUID), so their profile and records are kept.

## 4. Verify after configuring

1. Forgot password → real inbox → click link → "Set a new password" (not the dashboard) → submit → sign in with the new password; the old one must fail.
2. Click the same link again → "invalid or already used".
3. Continue with Google (new Google account) → profile onboarding → dashboard. Sign out, sign in with Google again → straight to dashboard, no second profile (enforced by `UNIQUE(user_id)` on `profiles`).
