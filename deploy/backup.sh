#!/usr/bin/env bash
# Downloads a copy of all Whens from the live server to this Mac.
# Usage: ADMIN_TOKEN=... deploy/backup.sh [url]
set -euo pipefail
URL="${1:-https://when-production-a440.up.railway.app}"
: "${ADMIN_TOKEN:?set ADMIN_TOKEN to the value configured in Railway}"
DIR="$HOME/when-backups"
mkdir -p "$DIR"
OUT="$DIR/when-$(date +%F).json"
curl -fsS -H "x-admin-token: $ADMIN_TOKEN" "$URL/api/admin/export" -o "$OUT"
echo "saved $OUT ($(wc -c < "$OUT") bytes)"
