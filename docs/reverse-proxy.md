# Reverse-Proxy vor NetMaster (HTTPS / Passkeys)

NetMaster selbst spricht nur HTTP. TLS/HTTPS wird von einem vorgeschalteten
Reverse-Proxy terminiert (z. B. Caddy, nginx, NGINX Proxy Manager, Traefik).
Damit Passkeys/WebAuthn funktionieren, muss der Proxy die Anfrage **korrekt
weiterleiten** – insbesondere den `Host`-Header unverändert durchreichen und
per `X-Forwarded-Proto` mitteilen, dass der Browser über `https` zugreift.

## Warum das wichtig ist

WebAuthn prüft bei der Passkey-Registrierung/Anmeldung, ob die vom Browser
gemeldete Origin (`https://netmaster.example.com`) mit der vom Server
erwarteten Origin übereinstimmt. NetMaster leitet die erwartete Origin aus
dem `Host`-Header und dem Schema ab (`src/lib/webauthn.ts`):

1. Schema kommt primär aus `X-Forwarded-Proto` (vom Proxy gesetzt).
2. Fehlt dieser Header, wird ersatzweise die Env-Variable `COOKIE_SECURE`
   verwendet (`COOKIE_SECURE=true` → `https`, sonst `http`).

Fehlt `X-Forwarded-Proto` und ist `COOKIE_SECURE` nicht gesetzt, erwartet
NetMaster `http://...`, obwohl der Browser über `https://...` zugreift →

```
Unexpected registration response origin "https://netmaster.example.com",
expected "http://netmaster.example.com"
```

**Fix:** Proxy so konfigurieren, dass er `X-Forwarded-Proto: https` sendet
(empfohlen, siehe unten) **und/oder** `COOKIE_SECURE=true` in der
`.env`/`docker-compose.yml` von NetMaster setzen.

---

## Variante A: Manuelle nginx-Konfiguration

Beispiel `server`-Block für nginx (z. B. `/etc/nginx/sites-available/netmaster`):

```nginx
server {
    listen 443 ssl http2;
    server_name netmaster.example.com;

    ssl_certificate     /etc/letsencrypt/live/netmaster.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/netmaster.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;

        # WICHTIG für WebAuthn/Passkeys:
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP         $remote_addr;

        # WebSocket-Support (falls von NetMaster genutzt)
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

Danach testen und neu laden:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Mit gesetztem `X-Forwarded-Proto` ist `COOKIE_SECURE=true` in NetMasters
`.env` nicht mehr zwingend nötig, schadet aber nicht als Fallback.

---

## Variante B: NGINX Proxy Manager (UI)

1. **Proxy Hosts → Add Proxy Host**
2. **Details**-Tab:
   - *Domain Names*: `netmaster.example.com`
   - *Scheme*: `http`
   - *Forward Hostname / IP*: IP/Hostname des NetMaster-Containers (z. B.
     `netmaster` im Docker-Netzwerk oder die Server-IP)
   - *Forward Port*: `3000` (bzw. der von NetMaster exponierte Port)
   - **Websockets Support**: aktivieren
3. **SSL**-Tab:
   - *SSL Certificate*: bestehendes Zertifikat wählen oder "Request a new
     SSL Certificate" (Let's Encrypt)
   - **Force SSL**: aktivieren
   - **HTTP/2 Support**: aktivieren
4. **Advanced**-Tab: NGINX Proxy Manager setzt `X-Forwarded-Proto` und
   `Host` bei aktiviertem SSL bereits standardmäßig korrekt. Falls Passkeys
   trotzdem den Origin-Fehler zeigen, im *Advanced*-Feld ergänzen:

   ```nginx
   proxy_set_header Host              $host;
   proxy_set_header X-Forwarded-Proto $scheme;
   proxy_set_header X-Real-IP         $remote_addr;
   ```

5. Speichern.

---

## Zusätzlich: NetMaster-Konfiguration

Unabhängig vom Proxy sollte in NetMasters `.env` (bzw. `docker-compose.yml`)
gesetzt sein, sobald der Dienst nur noch über HTTPS erreichbar ist:

```env
COOKIE_SECURE=true
```

Das sorgt dafür, dass Session-Cookies mit dem `Secure`-Flag ausgestellt
werden und WebAuthn auch dann die richtige Origin annimmt, wenn der Proxy
aus irgendeinem Grund kein `X-Forwarded-Proto` sendet.

> Der `install.sh`-Installer setzt `COOKIE_SECURE=true` automatisch, wenn
> beim Setup der integrierte Caddy-Reverse-Proxy mit Domain gewählt wird.
> Bei einem extern betriebenen Proxy (nginx, NGINX Proxy Manager, Traefik
> o. Ä.) muss diese Variable manuell in der `.env`-Datei gesetzt werden.

## Checkliste bei Passkey-Fehlern

- [ ] Zugriff erfolgt tatsächlich über `https://` (nicht `http://`)
- [ ] Proxy sendet `Host`-Header unverändert (keine Domain-Umschreibung)
- [ ] Proxy sendet `X-Forwarded-Proto: https`
- [ ] `COOKIE_SECURE=true` in NetMasters `.env` gesetzt (Fallback)
- [ ] Container/Dienst nach Env-Änderung neu gestartet
