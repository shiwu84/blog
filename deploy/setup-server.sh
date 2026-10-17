#!/usr/bin/env bash
# 一次性初始化 Ubuntu 24.04 服务器（以有 sudo 权限的账号执行）。
#
# 用法：
#   sudo DEPLOY_PUBKEY="$(cat ~/.ssh/blog_deploy.pub)" bash setup-server.sh
#
# 可选环境变量：
#   DOMAIN    默认 blog.shiwu.dev
#   WEB_ROOT  默认 /var/www/blog
#   DEPLOY_PUBKEY   GitHub Actions 部署公钥（推荐传入，会自动写入 deploy 用户）
#   CADDYFILE_SRC  本地 Caddyfile 路径；传入则自动安装到 /etc/caddy/Caddyfile
set -euo pipefail

DOMAIN="${DOMAIN:-blog.shiwu.dev}"
WEB_ROOT="${WEB_ROOT:-/var/www/blog}"
DEPLOY_USER="deploy"

log() { printf '\n==> %s\n' "$*"; }
need_root() { [ "$(id -u)" -eq 0 ] || { echo "请使用 sudo 运行"; exit 1; }; }

need_root

log "创建部署用户 ${DEPLOY_USER}"
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
else
  echo "用户已存在，跳过"
fi

log "准备站点目录 ${WEB_ROOT}"
mkdir -p "${WEB_ROOT}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${WEB_ROOT}"
chmod 755 "${WEB_ROOT}"

if [ -n "${DEPLOY_PUBKEY:-}" ]; then
  log "写入 GitHub Actions 公钥到 ${DEPLOY_USER} 的 authorized_keys"
  install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
  printf 'restrict %s\n' "${DEPLOY_PUBKEY}" >> "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
else
  echo "未提供 DEPLOY_PUBKEY，稍后请手动把公钥写入 /home/${DEPLOY_USER}/.ssh/authorized_keys"
fi

log "安装 Caddy"
apt-get update
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

if [ -n "${CADDYFILE_SRC:-}" ] && [ -f "${CADDYFILE_SRC}" ]; then
  log "安装 Caddyfile"
  cp "${CADDYFILE_SRC}" /etc/caddy/Caddyfile
  caddy fmt --overwrite /etc/caddy/Caddyfile || true
fi

log "配置防火墙（若 ufw 已启用）"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active'; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw status
fi

log "启用并重载 Caddy"
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

cat <<EOF

完成。后续检查：
  1. DNS：Cloudflare 中添加 A 记录 ${DOMAIN} -> 服务器公网 IP
  2. 证书：curl -I https://${DOMAIN}（首次访问 Caddy 会自动签发证书）
  3. 部署用户：确认 GitHub Actions 的 SSH 密钥能登录 ${DEPLOY_USER}@服务器
  4. 站点目录：${WEB_ROOT}
EOF
