#!/usr/bin/env bash
# 从多库工作区加载吉隆坡 SSH 入口。调用前要先设好 ROOT。
# 不读取 ~/.ssh/yyds_aliyun。四项 MY_PROD_* 缺一就停。

load_my_prod() {
  local root="$1"
  local lib="${MY_PROD_SSH_LIB:-}"
  if [[ -z "$lib" && -f "$root/../infra/deploy/lib/my-prod-ssh.sh" ]]; then
    lib="$(cd "$root/../infra/deploy/lib" && pwd)/my-prod-ssh.sh"
  fi
  if [[ -z "$lib" || ! -f "$lib" ]]; then
    printf '找不到 infra/deploy/lib/my-prod-ssh.sh。把 infra 放在 rishi 旁边，或设置 MY_PROD_SSH_LIB。\n' >&2
    return 1
  fi
  # shellcheck source=/dev/null
  source "$lib"
  my_prod_prepare
}
