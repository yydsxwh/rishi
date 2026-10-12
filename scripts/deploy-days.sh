#!/usr/bin/env bash
# Publish the static days build. Set DEPLOY_REMOTE_DIR.
# SSH target comes from MY_PROD_* via infra/deploy/lib/my-prod-ssh.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=load-my-prod.sh
source "$ROOT/scripts/load-my-prod.sh"
load_my_prod "$ROOT"
DEST="${DEPLOY_REMOTE_DIR:?set DEPLOY_REMOTE_DIR}"

cd "$ROOT"
npx vite build --base=/products/days/
# dist 里若混进 APK，整目录上传会盖掉线上正式包。
find "$ROOT/dist" -name '*.apk' -delete
my_prod_ssh "$MY_PROD_SSH_TARGET" "mkdir -p '$DEST'"
# 网页部署不碰官网 APK。正式包只能来自 android-native 的 release 产物，
# 由 scripts/deploy-android-native-release.sh 校验后原子替换。
my_prod_scp -r "$ROOT/dist/." "$MY_PROD_SSH_TARGET:$DEST/"
echo "Skipped APK upload. Official package is android-native release only."

echo "Published $MY_PROD_SSH_TARGET:$DEST"

if [[ "${DEPLOY_SKIP_BFF:-}" != "1" ]]; then
  echo "Also deploying BFF (set DEPLOY_SKIP_BFF=1 to skip)"
  bash "$ROOT/scripts/deploy-days-bff.sh"
fi
