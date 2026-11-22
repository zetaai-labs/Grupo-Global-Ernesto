# Cloudflare setup

Status: code is ready but has **not been tested against a live Cloudflare account**.

## Application settings

| Variable | Value |
|---|---|
| `CLOUDFLARE_ENABLED` | `true` |
| `CLOUDFLARE_TRUSTED_PROXIES` | Comma-separated current ranges from <https://www.cloudflare.com/ips/> |
| `CLOUDFLARE_ORIGIN_SECRET` | Long random value, also set in the Transform Rule below |

The app believes `CF-Connecting-IP` only when the connection comes from a listed range. If a
reverse proxy (nginx) sits in front of Node, the app sees nginx as the peer: either list nginx
in `CLOUDFLARE_TRUSTED_PROXIES` and make nginx accept traffic only from Cloudflare ranges, or
let Cloudflare connect to Node directly. Review the ranges periodically.

## Cloudflare dashboard

1. **DNS:** proxy (orange cloud) `app.grupoglobalplataformabilateral.com.es` and the public site.
2. **SSL/TLS:** mode **Full (strict)** with a Cloudflare Origin Certificate on the server.
3. **Edge certificates:** Minimum TLS **1.3**, Always Use HTTPS on, Automatic HTTPS Rewrites on.
4. **HSTS:** enable only after HTTPS works everywhere. Start with `max-age=300`, then raise to
   `31536000`. Add `includeSubDomains` and preload only when every subdomain is HTTPS. If the
   application also sends HSTS, keep the two values identical.
5. **Transform Rule (request header):** set static header `X-Origin-Secret` to the secret.
6. **Firewall on the VPS:** allow ports 80/443 only from Cloudflare ranges.
7. **WebSockets:** enable, as chat, notifications and video signaling require them.

## WAF rules

| Rule | Action |
|---|---|
| Cloudflare Managed Ruleset and OWASP Core Ruleset | Block (start in Log for a few days) |
| `POST /api/auth/login`, `/api/auth/mfa/verify`, `/api/auth/password-reset/*` | Rate limit per IP: 10/min, then Managed Challenge |
| `/api/public/onboarding*`, `/api/public/received-files*` | Rate limit per IP: 30/min |
| `/api/vault*` from outside approved countries (if the client defines them) | Managed Challenge |
| Known bad bots / threat score | Managed Challenge |

**Skip Managed Challenge and bot checks for** `/api/webhooks/*`: machine callers cannot solve
challenges, and these routes are protected by signature verification.

## Verification checklist

- Direct request to the origin IP returns 403 or is blocked by the firewall.
- Audit log shows real client IPs, not Cloudflare IPs.
- A spoofed `CF-Connecting-IP` sent straight to the origin is ignored.
- Login rate limiting counts per real client.
- Chat and video connect through Cloudflare.
