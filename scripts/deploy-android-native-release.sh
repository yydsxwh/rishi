#!/usr/bin/env bash
# 只发布 android-native 的正式 release APK。先上传临时文件，校验后再原子替换。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="${1:-$ROOT/android-native/app/build/outputs/apk/release/app-release.apk}"
KEY="${DEPLOY_SSH_KEY_FILE:-$HOME/.ssh/yyds_aliyun}"
HOST="${DEPLOY_SSH_HOST:-${DEPLOY_HOST:-}}"
if [[ -z "$HOST" ]]; then
  echo "缺少 DEPLOY_SSH_HOST 或 DEPLOY_HOST，例如 admin@your-server" >&2
  exit 1
fi
DEST="${DEPLOY_REMOTE_DIR:-/var/www/yyds-course-platform/public/products/days}"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/tmp/android-sdk}}"
AAPT="$SDK/build-tools/35.0.0/aapt"
APKSIGNER="$SDK/build-tools/35.0.0/apksigner"
ZIPALIGN="$SDK/build-tools/35.0.0/zipalign"

if [[ "$(basename "$APK")" != "app-release.apk" || "$APK" != *"/android-native/app/build/outputs/apk/release/"* ]]; then
  echo "拒绝上传：正式包必须是 android-native/app/build/outputs/apk/release/app-release.apk" >&2
  exit 1
fi
if [[ ! -f "$APK" || ! -f "$KEY" ]]; then
  echo "缺少 APK 或部署密钥文件。" >&2
  exit 1
fi

badging="$("$AAPT" dump badging "$APK")"
python3 - "$badging" << 'PY'
import sys
text = sys.argv[1]
pkg = [line for line in text.splitlines() if line.startswith("package:")][0]
label = [line for line in text.splitlines() if line.startswith("application-label:")][0]
if "name='com.yydsxwh.kemiao.days'" not in pkg or ".debug" in pkg:
    raise SystemExit("包名不是正式 applicationId")
code = int(pkg.split("versionCode='")[1].split("'")[0])
if code < 10:
    raise SystemExit(f"versionCode {code} 没有超过已下线的 9")
if label != "application-label:'颗秒日事'":
    raise SystemExit("启动器名称不是颗秒日事")
print(pkg)
print(label)
PY

"$APKSIGNER" verify --verbose --print-certs "$APK" > /tmp/kemiao-apk-certs.txt
if ! grep -q "Verified using v2 scheme (APK Signature Scheme v2): true" /tmp/kemiao-apk-certs.txt; then
  echo "APK v2 签名校验失败" >&2
  exit 1
fi
if grep -q "CN=Android Debug" /tmp/kemiao-apk-certs.txt; then
  echo "拒绝上传 debug 证书签名的 APK" >&2
  exit 1
fi
"$ZIPALIGN" -c -v 4 "$APK" >/tmp/kemiao-zipalign.txt
local_sha="$(sha256sum "$APK" | awk '{print $1}')"
local_size="$(wc -c < "$APK" | tr -d ' ')"
echo "local_sha256=$local_sha"
echo "local_bytes=$local_size"

remote_tmp="$DEST/kemiao-days.apk.uploading"
remote_final="$DEST/kemiao-days.apk"
scp -i "$KEY" -o IdentitiesOnly=yes "$APK" "$HOST:$remote_tmp"
remote_sha="$(ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "sha256sum '$remote_tmp' | awk '{print \$1}' && wc -c < '$remote_tmp'")"
remote_hash="$(echo "$remote_sha" | head -1 | tr -d ' ')"
remote_size="$(echo "$remote_sha" | tail -1 | tr -d ' ')"
if [[ "$remote_hash" != "$local_sha" || "$remote_size" != "$local_size" ]]; then
  ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "rm -f '$remote_tmp'"
  echo "服务器上的临时文件和本地 APK 不一致，已删除临时文件，正式包未替换。" >&2
  exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
version_name="$(echo "$badging" | sed -n "s/.*versionName='\([^']*\)'.*/\1/p" | head -1)"
version_code="$(echo "$badging" | sed -n "s/.*versionCode='\([^']*\)'.*/\1/p" | head -1)"
cert_sha="$(grep 'certificate SHA-256 digest:' /tmp/kemiao-apk-certs.txt | head -1 | awk '{print $NF}')"
python3 - "$local_sha" "$local_size" "$version_name" "$version_code" "$stamp" "$cert_sha" << 'PY' > /tmp/kemiao-days-release.json
import json, sys
sha, size, version, code, stamp, cert = sys.argv[1:]
filename = f"kemiao-days-{version}.apk"
json.dump({
  "versionName": version,
  "versionCode": int(code),
  "size": int(size),
  "sha256": sha,
  "publishedAt": stamp,
  "certSha256": cert,
  "packageName": "com.yydsxwh.kemiao.days",
  "source": "android-native",
  "file": filename,
}, sys.stdout, ensure_ascii=False)
print()
PY
scp -i "$KEY" -o IdentitiesOnly=yes /tmp/kemiao-days-release.json "$HOST:$DEST/kemiao-days-release.json.uploading"
versioned="$DEST/kemiao-days-${version_name}.apk"
ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST" "set -e
  if [[ -f '$remote_final' ]]; then cp -a '$remote_final' '$remote_final.previous'; fi
  if [[ -f '$versioned' ]]; then
    existing=\$(sha256sum '$versioned' | awk '{print \$1}')
    if [[ \"\$existing\" != '$local_sha' ]]; then
      echo '版本化文件已存在且内容不同，拒绝覆盖' >&2
      exit 1
    fi
  else
    cp -a '$remote_tmp' '$versioned'
  fi
  chmod 644 '$versioned'
  mv -f '$DEST/kemiao-days-release.json.uploading' '$DEST/kemiao-days-release.json'
  mv -f '$remote_tmp' '$remote_final'
  chmod 644 '$remote_final' '$DEST/kemiao-days-release.json'
  sha256sum '$remote_final' '$versioned'
"
echo "published_sha256=$local_sha"
