# OAuth Integration Overview

This document captures the current Shopify OAuth implementation. NetSuite OAuth is not yet wired but the structure is ready to extend the edge functions.

## Edge Function Endpoints

- `supabase/functions/oauth-start/index.ts` - validates the authenticated Supabase user, persists a state token in the `connections` table, and returns the Shopify authorization URL.
- `supabase/functions/oauth-callback/index.ts` - verifies the Shopify callback (including HMAC validation), exchanges the authorization code for a token, encrypts it with `ENCRYPTION_KEY`, and updates the connection record.

The shared helpers live in `supabase/functions/_shared/` for CORS handling, Supabase admin access, and AES-GCM token encryption.

## Required Environment Variables

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Base URL of your Supabase instance (e.g. `https://xyzcompany.supabase.co`). |
| `SUPABASE_SERVICE_KEY` | Service-role key with permissions to manage auth and `connections`. |
| `SHOPIFY_APP_KEY` / `SHOPIFY_APP_SECRET` | Credentials for the Shopify custom app. |
| `SHOPIFY_APP_SCOPES` | Comma-separated scopes requested during OAuth. Default is `read_products,write_products`. |
| `OAUTH_FUNCTION_BASE_URL` | Optional override for the public edge functions base URL. Defaults to `${SUPABASE_URL}/functions/v1`. |
| `OAUTH_SUCCESS_REDIRECT` / `OAUTH_FAILURE_REDIRECT` | Client URLs used after the callback completes. Defaults point to the Vite dev server. |
| `OAUTH_ALLOWED_ORIGIN` | Comma-separated allow list for the `Origin` header hitting the edge functions. |
| `APP_BASE_URL` | Base URL for building relative redirects (`http://localhost:5173` in dev). |
| `ENCRYPTION_KEY` | Base64-encoded 256-bit key used for AES-GCM encryption of stored OAuth tokens. |

### Frontend `.env.local`

```
VITE_SUPABASE_URL=<project-url>
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_FUNCTIONS_BASE_URL=http://localhost:54321/functions/v1
```

## Frontend Workflow

The `Connections` tab inside `frontend/src/App.tsx`:

1. Prompts anonymous visitors to sign in or register via Supabase email/password auth.
2. Lists existing entries from the `connections` table so users can see statuses.
3. Launches the Shopify OAuth flow by POSTing to `/oauth-start` with the user's JWT.
4. Displays a banner when redirected back with `status`/`message` query parameters.

Make sure the Supabase Auth redirect list allows the URLs configured above.

## Next Steps

- Extend `oauth-start` and `oauth-callback` to support the NetSuite OAuth 1.0a flow.
- Add background jobs to refresh Shopify tokens when `expires_in` is present.
- Harden token storage with rotation/auditing once production secrets are available.