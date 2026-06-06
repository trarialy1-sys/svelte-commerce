# Clerk setup (Chunk 0.2)

Environment variables required by the auth layer (set in `web/.env` locally and
in Vercel → Settings → Environment Variables for Production + Preview):

| Key | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` | **Public** — must NOT be wrapped in quotes; inlined at build time |
| `CLERK_SECRET_KEY` | `sk_test_…` | Secret |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` | leading slash |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` | leading slash |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/` | |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/` | |
| `PLATFORM_ADMIN_USER_IDS` | `user_abc,user_def` | comma-separated Clerk user IDs |

Notes:
- `NEXT_PUBLIC_*` are frozen into the build; **changing them requires a new
  deployment** (a rebuild), not just an env edit.
- Values must be raw strings with **no surrounding quotes**. The app also
  sanitizes the Clerk keys at runtime (`src/lib/clerk-env.ts`) as a safeguard.
