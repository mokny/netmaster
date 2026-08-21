# Reverse proxy in front of NetMaster (HTTPS / passkeys)

NetMaster itself only speaks HTTP. TLS/HTTPS is terminated by an upstream
reverse proxy (e.g. Caddy, nginx, NGINX Proxy Manager, Traefik). For
passkeys/WebAuthn to work, the proxy must **forward the request correctly**
– in particular, pass through the `Host` header unchanged and use
`X-Forwarded-Proto` to signal that the browser is connecting over `https`.

## Why this matters

During passkey registration/login, WebAuthn checks whether the origin
reported by the browser (`https://netmaster.example.com`) matches the
origin expected by the server. NetMaster derives the expected origin from
the `Host` header and the scheme (`src/lib/webauthn.ts`):

1. The scheme primarily comes from `X-Forwarded-Proto` (set by the proxy).
2. If that header is missing, the `COOKIE_SECURE` env variable is used
   instead (`COOKIE_SECURE=true` → `https`, otherwise `http`).

If `X-Forwarded-Proto` is missing and `COOKIE_SECURE` isn't set, NetMaster
expects `http://...` even though the browser is connecting via
`https://...` →

```
Unexpected registration response origin "https://netmaster.example.com",
expected "http://netmaster.example.com"
```

**Fix:** configure the proxy to send `X-Forwarded-Proto: https`
(recommended, see below) **and/or** set `COOKIE_SECURE=true` in
NetMaster's `.env`/`docker-compose.yml`.

---

## Option A: Manual nginx configuration

Example `server` block for nginx (e.g. `/etc/nginx/sites-available/netmaster`):

```nginx
server {
    listen 443 ssl http2;
    server_name netmaster.example.com;

    ssl_certificate     /etc/letsencrypt/live/netmaster.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/netmaster.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;

        # IMPORTANT for WebAuthn/passkeys:
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP         $remote_addr;

        # WebSocket support (used by NetMaster)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 80;
    server_name netmaster.example.com;
    return 301 https://$host$request_uri;
}
```

Then test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

With `X-Forwarded-Proto` set, `COOKIE_SECURE=true` in NetMaster's `.env` is
no longer strictly required, but doesn't hurt as a fallback.

---

## Option B: NGINX Proxy Manager (UI)

1. **Proxy Hosts → Add Proxy Host**
2. **Details** tab:
   - *Domain Names*: `netmaster.example.com`
   - *Scheme*: `http`
   - *Forward Hostname / IP*: the NetMaster container's IP/hostname (e.g.
     `netmaster` on the Docker network, or the server's IP)
   - *Forward Port*: `3000` (or whichever port NetMaster exposes)
   - **Websockets Support**: enable
3. **SSL** tab:
   - *SSL Certificate*: choose an existing certificate or "Request a new
     SSL Certificate" (Let's Encrypt)
   - **Force SSL**: enable
   - **HTTP/2 Support**: enable
4. **Advanced** tab: NGINX Proxy Manager already sets `X-Forwarded-Proto`
   and `Host` correctly by default once SSL is enabled. If passkeys still
   show the origin error, add this to the *Advanced* field:

   ```nginx
   proxy_set_header Host              $host;
   proxy_set_header X-Forwarded-Proto $scheme;
   proxy_set_header X-Real-IP         $remote_addr;
   ```

5. Save.

---

## Also: NetMaster configuration

Regardless of the proxy, once the service is only reachable over HTTPS,
NetMaster's `.env` (or `docker-compose.yml`) should have:

```env
COOKIE_SECURE=true
```

This ensures session cookies are issued with the `Secure` flag, and that
WebAuthn accepts the correct origin even if the proxy fails to send
`X-Forwarded-Proto` for some reason.

> The `install.sh` installer sets `COOKIE_SECURE=true` automatically when
> the built-in Caddy reverse proxy with a domain is chosen during setup.
> With an externally run proxy (nginx, NGINX Proxy Manager, Traefik, etc.)
> this variable must be set manually in the `.env` file.

## Checklist for passkey errors

- [ ] Access is actually happening over `https://` (not `http://`)
- [ ] The proxy passes through the `Host` header unchanged (no domain rewriting)
- [ ] The proxy sends `X-Forwarded-Proto: https`
- [ ] `COOKIE_SECURE=true` is set in NetMaster's `.env` (fallback)
- [ ] The container/service was restarted after the env change
