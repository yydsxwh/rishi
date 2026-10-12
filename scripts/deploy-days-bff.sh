#!/usr/bin/env bash
# Publish 日事 BFF (kemiao-days-sync) and nginx exact /api/days/* locations.
# SSH target comes from MY_PROD_*. Never commit that key or any env secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=load-my-prod.sh
source "$ROOT/scripts/load-my-prod.sh"
load_my_prod "$ROOT"
REMOTE_DIR="${DEPLOY_BFF_DIR:?set DEPLOY_BFF_DIR}"

cd "$ROOT"
npm run build:server
my_prod_scp \
  "$ROOT/server/dist/index.mjs" "$MY_PROD_SSH_TARGET:/tmp/kemiao-days-sync.mjs"
my_prod_scp \
  "$ROOT/server/dist/index.cjs" "$MY_PROD_SSH_TARGET:/tmp/kemiao-days-sync.cjs"
my_prod_scp \
  "$ROOT/server/days-sync/nginx-days-sync.conf" "$MY_PROD_SSH_TARGET:/tmp/nginx-days-sync.conf"

my_prod_ssh "$MY_PROD_SSH_TARGET" "set -e
  sudo mkdir -p '$REMOTE_DIR'
  if [[ -f '$REMOTE_DIR/index.mjs' ]]; then sudo cp -a '$REMOTE_DIR/index.mjs' '$REMOTE_DIR/index.mjs.bak'; fi
  if [[ -f '$REMOTE_DIR/index.cjs' ]]; then sudo cp -a '$REMOTE_DIR/index.cjs' '$REMOTE_DIR/index.cjs.bak'; fi
  sudo mv /tmp/kemiao-days-sync.mjs '$REMOTE_DIR/index.mjs'
  sudo mv /tmp/kemiao-days-sync.cjs '$REMOTE_DIR/index.cjs'
  sudo mkdir -p /etc/nginx/snippets
  sudo mv /tmp/nginx-days-sync.conf /etc/nginx/snippets/kemiao-days-sync.conf
  if ! sudo nginx -t; then
    echo 'nginx -t failed; not reloading nginx' >&2
    exit 1
  fi
  sudo systemctl reload nginx
  if systemctl list-unit-files | grep -q kemiao-days-sync; then
    sudo systemctl restart kemiao-days-sync
    sleep 1
    if ! curl -fsS -m 5 http://127.0.0.1:3120/api/days/health >/dev/null; then
      echo 'BFF health failed; restoring previous build' >&2
      if [[ -f '$REMOTE_DIR/index.mjs.bak' ]]; then sudo cp -a '$REMOTE_DIR/index.mjs.bak' '$REMOTE_DIR/index.mjs'; fi
      if [[ -f '$REMOTE_DIR/index.cjs.bak' ]]; then sudo cp -a '$REMOTE_DIR/index.cjs.bak' '$REMOTE_DIR/index.cjs'; else sudo rm -f '$REMOTE_DIR/index.cjs'; fi
      sudo systemctl restart kemiao-days-sync
      exit 1
    fi
    sudo systemctl --no-pager --full status kemiao-days-sync | head -20
  else
    echo 'BLOCKED: systemd unit kemiao-days-sync 不存在，静态包已不涉及 BFF'
  fi
"

echo "Published BFF $MY_PROD_SSH_TARGET:$REMOTE_DIR/index.mjs"
if [[ -n "${RISHI_PUBLIC_ORIGIN:-}" ]]; then
  echo "Health: curl -sS ${RISHI_PUBLIC_ORIGIN%/}/api/days/health"
fi
