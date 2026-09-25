#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 22.04/24.04 VM (Oracle Cloud "Always Free" works).
# Installs Node 22, Caddy (automatic HTTPS), a systemd service for When, and opens ports 80/443.
#
#   sudo bash setup-server.sh <hostname>
#
# <hostname> is the public name people will use, e.g. when.duckdns.org or 1.2.3.4.sslip.io.
set -euo pipefail

HOSTNAME_FOR_TLS="${1:?usage: setup-server.sh <hostname>}"
APP_DIR=/opt/when
DATA_DIR=/var/lib/when

echo "==> System packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https rsync

echo "==> Node.js 22"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> Caddy"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudflare.com/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null \
    || curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> App user and directories"
id -u when >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin when
mkdir -p "$APP_DIR" "$DATA_DIR"
chown -R when:when "$APP_DIR" "$DATA_DIR"

echo "==> systemd service"
cat > /etc/systemd/system/when.service <<UNIT
[Unit]
Description=When – group meetup planner
After=network.target

[Service]
Type=simple
User=when
Group=when
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=API_PORT=3000
Environment=DATA_FILE=$DATA_DIR/events.json
ExecStart=/usr/bin/node $APP_DIR/server/index.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable when

echo "==> Caddy reverse proxy with automatic HTTPS for $HOSTNAME_FOR_TLS"
cat > /etc/caddy/Caddyfile <<CADDY
$HOSTNAME_FOR_TLS {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
CADDY
systemctl enable caddy
systemctl restart caddy

echo "==> Firewall (Oracle images ship with iptables rules that block 80/443)"
if command -v iptables >/dev/null; then
  iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
fi
if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 80/tcp; ufw allow 443/tcp
fi

echo
echo "Server is ready. Deploy the app from your Mac with:  ./deploy/deploy.sh <user>@<ip>"
echo "Remember to also allow TCP 80 and 443 in the Oracle VCN security list (ingress rules)."
