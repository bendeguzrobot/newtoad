#!/usr/bin/env bash
set -euo pipefail

DOMAIN="newtoad.c.tmpx.space"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}"

echo "==> Writing nginx config for ${DOMAIN}"
sudo tee "${NGINX_CONF}" > /dev/null << 'NGINXEOF'
server {
    server_name newtoad.c.tmpx.space;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    listen 80;
}
NGINXEOF

echo "==> Enabling site"
if [ ! -L "${NGINX_LINK}" ]; then
    sudo ln -s "${NGINX_CONF}" "${NGINX_LINK}"
else
    echo "    (symlink already exists, skipping)"
fi

echo "==> Testing nginx config"
sudo nginx -t

echo "==> Reloading nginx"
sudo systemctl reload nginx

echo "==> Obtaining SSL certificate"
sudo certbot --nginx -d "${DOMAIN}"

echo ""
echo "Done! https://${DOMAIN} is live."
echo "Make sure 'just start' is running in the newtoad directory."
