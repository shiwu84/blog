#!/usr/bin/env bash
# 一次性初始化 Ubuntu 24.04 服务器（以有 sudo 权限的账号执行，例如 shiwu）。
#
# 模式一：独立 deploy 用户 + /var/www/blog + 独立 Caddyfile
#   sudo DEPLOY_PUBKEY="$(cat ~/.ssh/blog_deploy.pub)" CADDYFILE_SRC=./Caddyfile bash setup-server.sh
#
# 模式二：全部放在 shiwu 用户下 + 独立 Caddyfile
#   sudo WEB_ROOT=/home/shiwu/blog DEPLOY_USER=shiwu \
#     DEPLOY_PUBKEY="$(cat ~/blog_deploy.pub)" CADDYFILE_SRC=./Caddyfile bash setup-server.sh
#
# 模式三：使用 /etc/caddy/conf.d 分片（推荐给「主 Caddyfile + conf.d」的服务器）
#   sudo SKIP_CADDY=1 WEB_ROOT=/home/shiwu/blog DEPLOY_USER=shiwu \
#     DEPLOY_PUBKEY="$(cat ~/blog_deploy.pub)" \
#     CADDY_SITE_CONF=/etc/caddy/conf.d/blog SITE_CONF_SRC=./site.conf \
#     bash setup-server.sh
#
# 可选环境变量：
#   DOMAIN          默认 blog.shiwu.dev
#   WEB_ROOT        站点根目录，默认 /var/www/blog
#   DEPLOY_USER     GitHub Actions 登录用户，默认 deploy（不存在会自动创建）
#   DEPLOY_PUBKEY   GitHub Actions 部署公钥
#   CADDYFILE_SRC   整份 Caddyfile 路径（模式一/二）
#   CADDY_SITE_CONF 站点分片路径，如 /etc/caddy/conf.d/blog（模式三）
#   SITE_CONF_SRC   站点分片源文件，默认 ./site.conf
#   SKIP_CADDY=1    跳过 Caddy 安装
set -euo pipefail

DOMAIN="${DOMAIN:-blog.shiwu.dev}"
WEB_ROOT="${WEB_ROOT:-/var/www/blog}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
SKIP_CADDY="${SKIP_CADDY:-0}"

log() { printf '\n==> %s\n' "$*"; }
need_root() { [ "$(id -u)" -eq 0 ] || { echo "请使用 sudo 运行"; exit 1; }; }
backup_file() {
  if [ -f "$1" ]; then
    local backup="$1.bak.$(date +%Y%m%d%H%M%S)"
    cp "$1" "${backup}"
    echo "已备份 $1 -> ${backup}"
  fi
}

need_root

log "部署用户：${DEPLOY_USER}"
if id "${DEPLOY_USER}" >/dev/null 2>&1; then
  echo "用户已存在，跳过创建"
else
  useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
fi
DEPLOY_HOME="$(getent passwd "${DEPLOY_USER}" | cut -d: -f6)"
if [ -z "${DEPLOY_HOME}" ]; then
  echo "无法确定 ${DEPLOY_USER} 的家目录"
  exit 1
fi

log "准备站点目录 ${WEB_ROOT}"
mkdir -p "${WEB_ROOT}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${WEB_ROOT}"
chmod 755 "${WEB_ROOT}"

# 站点目录位于 /home 下时，需要允许 Caddy 用户穿过家目录读取文件。
case "${WEB_ROOT}" in
  /home/*)
    PARENT_HOME="$(dirname "${WEB_ROOT}")"
    chmod o+x "${PARENT_HOME}"
    echo "已给 ${PARENT_HOME} 增加 o+x（仅允许进入，不允许列目录）"
    ;;
esac

if [ -n "${DEPLOY_PUBKEY:-}" ]; then
  log "写入部署公钥到 ${DEPLOY_USER}（${DEPLOY_HOME}）"
  AUTHORIZED_KEYS="${DEPLOY_HOME}/.ssh/authorized_keys"
  install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${DEPLOY_HOME}/.ssh"
  touch "${AUTHORIZED_KEYS}"
  if grep -qF -- "${DEPLOY_PUBKEY}" "${AUTHORIZED_KEYS}"; then
    echo "公钥已存在，跳过追加"
  else
    printf 'restrict %s\n' "${DEPLOY_PUBKEY}" >> "${AUTHORIZED_KEYS}"
    echo "公钥已追加"
  fi
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${AUTHORIZED_KEYS}"
  chmod 600 "${AUTHORIZED_KEYS}"
else
  echo "未提供 DEPLOY_PUBKEY，稍后请手动把公钥写入 ${DEPLOY_HOME}/.ssh/authorized_keys"
fi

if [ "${SKIP_CADDY}" = "1" ]; then
  log "跳过 Caddy 安装（SKIP_CADDY=1）"
  if command -v caddy >/dev/null 2>&1; then
    echo "已检测到：$(caddy version 2>/dev/null | head -n 1)"
  else
    echo "警告：没有找到 caddy 命令，请确认 Caddy 已正确安装。"
  fi
else
  log "安装 Caddy"
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# ---- Caddy 配置：整份 Caddyfile 或 conf.d 分片 ----
if [ -n "${CADDY_SITE_CONF:-}" ]; then
  SITE_SRC="${SITE_CONF_SRC:-./site.conf}"
  if [ ! -f "${SITE_SRC}" ]; then
    echo "找不到站点分片源文件：${SITE_SRC}"
    exit 1
  fi
  log "安装站点分片到 ${CADDY_SITE_CONF}（根目录 -> ${WEB_ROOT}）"
  mkdir -p "$(dirname "${CADDY_SITE_CONF}")"
  backup_file "${CADDY_SITE_CONF}"
  cp "${SITE_SRC}" "${CADDY_SITE_CONF}"
  sed -i "s|/var/www/blog|${WEB_ROOT}|g" "${CADDY_SITE_CONF}"

  MAIN_CADDYFILE="/etc/caddy/Caddyfile"
  if [ -f "${MAIN_CADDYFILE}" ]; then
    if grep -Eq '^[[:space:]]*import[[:space:]]+.*conf\.d' "${MAIN_CADDYFILE}"; then
      echo "主 Caddyfile 已有 conf.d 的 import"
    else
      backup_file "${MAIN_CADDYFILE}"
      printf '\n# blog 站点分片\nimport /etc/caddy/conf.d/*\n' >> "${MAIN_CADDYFILE}"
      echo "已在主 Caddyfile 追加：import /etc/caddy/conf.d/*"
    fi
  else
    echo "警告：${MAIN_CADDYFILE} 不存在，请确认 Caddy 主配置文件位置"
  fi

  if command -v caddy >/dev/null 2>&1; then
    caddy validate --config "${MAIN_CADDYFILE}" || echo "Caddyfile 校验未通过，请检查上面的输出"
  fi
else
  if [ -n "${CADDYFILE_SRC:-}" ] && [ -f "${CADDYFILE_SRC}" ]; then
    log "安装整份 Caddyfile（站点根目录 -> ${WEB_ROOT}）"
    mkdir -p /etc/caddy
    backup_file /etc/caddy/Caddyfile
    cp "${CADDYFILE_SRC}" /etc/caddy/Caddyfile
    sed -i "s|/var/www/blog|${WEB_ROOT}|g" /etc/caddy/Caddyfile
    if command -v caddy >/dev/null 2>&1; then
      caddy fmt --overwrite /etc/caddy/Caddyfile || true
      caddy validate --config /etc/caddy/Caddyfile || echo "Caddyfile 校验未通过，请检查上面的输出"
    fi
  fi
fi

log "配置防火墙（若 ufw 已启用）"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active'; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw status
fi

log "启用并重载 Caddy 服务"
CADDY_SERVICE=""
for candidate in caddy snap.caddy.caddy; do
  if systemctl cat "${candidate}" >/dev/null 2>&1; then
    CADDY_SERVICE="${candidate}"
    break
  fi
done

if [ -z "${CADDY_SERVICE}" ]; then
  echo "警告：没有找到 Caddy 的 systemd 服务，请手动启动/重载 Caddy。"
else
  echo "使用服务：${CADDY_SERVICE}"
  systemctl enable "${CADDY_SERVICE}" || true
  systemctl reload "${CADDY_SERVICE}" || systemctl restart "${CADDY_SERVICE}"
fi

cat <<EOF

完成。后续检查：
  1. DNS：Cloudflare 中添加 A 记录 ${DOMAIN} -> 服务器公网 IP
  2. 证书：curl -I https://${DOMAIN}（首次访问 Caddy 会自动签发证书）
  3. GitHub Secrets：
       SSH_USER   = ${DEPLOY_USER}
       DEPLOY_PATH = ${WEB_ROOT}
  4. 登录测试：ssh -i <你的私钥> ${DEPLOY_USER}@<服务器公网IP>
  5. Caddy 状态：systemctl status ${CADDY_SERVICE:-caddy} --no-pager
EOF
