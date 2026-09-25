#!/usr/bin/env bash
# Builds the app on this Mac and ships it to the server, then restarts the service.
#
#   ./deploy/deploy.sh ubuntu@1.2.3.4            # uses your default SSH key
#   SSH_KEY=~/.ssh/oracle.key ./deploy/deploy.sh ubuntu@1.2.3.4
set -euo pipefail

TARGET="${1:?usage: deploy.sh <user>@<host>}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[[ -n "${SSH_KEY:-}" ]] && SSH_OPTS+=(-i "$SSH_KEY")

cd "$(dirname "$0")/.."

echo "==> Building"
export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"
npx ng build >/dev/null

echo "==> Uploading to $TARGET"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" --rsync-path="sudo rsync" \
  dist/when/browser/ "$TARGET:/opt/when/dist/when/browser/"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" --rsync-path="sudo rsync" \
  --exclude data server/ "$TARGET:/opt/when/server/"
rsync -az -e "ssh ${SSH_OPTS[*]}" --rsync-path="sudo rsync" \
  package.json package-lock.json .npmrc "$TARGET:/opt/when/"

echo "==> Installing server dependencies and restarting"
ssh "${SSH_OPTS[@]}" "$TARGET" 'sudo bash -c "cd /opt/when && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null && chown -R when:when /opt/when && systemctl restart when && sleep 1 && systemctl is-active when"'

echo "Done."
