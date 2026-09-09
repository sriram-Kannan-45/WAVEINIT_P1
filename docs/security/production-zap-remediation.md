# Production ZAP remediation

The 9 September 2026 scan of `https://www.waveinitlms.online` showed the
production frontend still serving the old static policy. The deployed response
allowed inline scripts, `eval`, and external Google/CDN resources; it also did
not provide HSTS and rewrote `robots.txt` to the SPA document.

## Deployment settings

Set this Vercel environment variable for **Production**, **Preview**, and
**Development** before deploying the frontend:

| Variable | Value |
| --- | --- |
| `INTERNAL_RENDER_SECRET` | A unique 32-byte random secret, for example the output of `openssl rand -hex 32` |

The Vercel routing middleware uses the secret only to protect its internal
HTML fetch. Do not add it to `VITE_*` variables or expose it to the browser.

Set these Azure App Service variables for the API:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://www.waveinitlms.online` |
| `ALLOWED_ORIGINS` | Additional exact approved browser origins, comma-separated; omit when there are none |
| `TRUST_PROXY_HOPS` | `1` unless the App Service is behind more verified proxy hops |

No wildcard domain, LAN address, or `*` value should be supplied to the CORS
variables in production.

## What the deployment changes

- Each HTML response gets a fresh CSP nonce and is not shared from CDN cache.
- Static assets remain immutable-cacheable, carry a fixed same-origin CORS
  header, and cannot be used cross-origin.
- All document and asset responses receive HSTS and browser security headers.
- `robots.txt` is a real text file, so it is no longer rewritten to HTML.
- The API accepts CORS requests only from exact configured origins and trusts a
  bounded reverse-proxy chain.

## Verify after deployment

Run these checks against the production domain before rerunning ZAP:

```powershell
curl.exe -I https://www.waveinitlms.online/
curl.exe -I https://www.waveinitlms.online/robots.txt
curl.exe -I https://www.waveinitlms.online/assets/<a-current-asset-name>.js
```

The page response must contain `Strict-Transport-Security` and a CSP with a
`script-src 'nonce-…' 'strict-dynamic'` value. It must not contain
`unsafe-eval` or `script-src ... unsafe-inline`. The robots response must have
`content-type: text/plain`, not `text/html`.
