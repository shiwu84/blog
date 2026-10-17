# 部署指南：GitHub Actions → Ubuntu 服务器 → Caddy → Cloudflare

目标：`https://blog.shiwu.dev`

```
本地写文章 / 改代码
      │ git push
      ▼
GitHub Actions（ubuntu-latest）
  npm ci → astro check → astro build → 上传 dist 制品
      │ rsync over SSH
      ▼
Ubuntu 24.04 服务器
  站点目录 ← Caddy（静态托管 + 自动 HTTPS）
      ▲
      │ A 记录 / 可选代理
Cloudflare（DNS + CDN + 边缘证书）
```

支持两种落地方案，按需选择：

| | 方案 A（默认，推荐） | 方案 B（全部在 shiwu 用户下） |
| --- | --- | --- |
| 登录用户 | `deploy`（脚本自动创建） | `shiwu`（你的 sudo 账号） |
| 站点目录 | `/var/www/blog` | `/home/shiwu/blog` |
| GitHub Secrets | `SSH_USER=deploy`，`DEPLOY_PATH=/var/www/blog` | `SSH_USER=shiwu`，`DEPLOY_PATH=/home/shiwu/blog` |
| 权限风险 | 低：CI 只能写站点目录 | 较高：CI 密钥拥有 shiwu 的权限（含 sudo） |

> 服务器初始化、上传文件都用 `shiwu@服务器IP` 登录，不要用 root（Ubuntu 24.04 默认也禁用 root 登录）。

---

## 1. 本地生成部署专用 SSH 密钥

在**你自己的电脑**上执行（Windows 自带 OpenSSH，或在 Git Bash 里执行）：

```powershell
ssh-keygen -t ed25519 -C "github-actions-blog" -f "$env:USERPROFILE\.ssh\blog_deploy" -N ""
```

得到：

- 私钥：`~/.ssh/blog_deploy` → 填 GitHub Secrets 的 `SSH_PRIVATE_KEY`
- 公钥：`~/.ssh/blog_deploy.pub` → 上传到服务器

## 2. 上传文件并初始化服务器

```powershell
cd C:\Users\shiwu\Desktop\Blog
# 使用完整路径，避免终端 PATH 里没有 scp
& "$env:WINDIR\System32\OpenSSH\scp.exe" -r .\deploy "$env:USERPROFILE\.ssh\blog_deploy.pub" shiwu@<服务器IP>:~/
```

然后登录服务器执行初始化（按你选的方案二选一）：

```powershell
ssh shiwu@<服务器IP>
```

```bash
cd ~/deploy

# 方案 A：独立 deploy 用户 + /var/www/blog
sudo DEPLOY_PUBKEY="$(cat ~/blog_deploy.pub)" \
  CADDYFILE_SRC=./Caddyfile bash setup-server.sh

# 方案 B：全部在 shiwu 用户下（你正在用的方案）
sudo WEB_ROOT=/home/shiwu/blog DEPLOY_USER=shiwu \
  DEPLOY_PUBKEY="$(cat ~/blog_deploy.pub)" \
  CADDYFILE_SRC=./Caddyfile bash setup-server.sh
```

脚本会：创建/确认用户 → 建站点目录 → 安装 Caddy → 写入部署公钥 → 替换 Caddyfile 的 root 路径 → 配置防火墙 → 启用 Caddy。

> 站点目录在 `/home/xxx` 下时，脚本会给家目录加 `o+x`（只允许进入、不允许列目录），否则 Caddy 无法读取静态文件。

验证：

```bash
systemctl status caddy --no-pager
curl -I https://blog.shiwu.dev      # Caddy 自动签发证书后返回 200/404
ssh -i ~/.ssh/blog_deploy <部署用户>@<服务器IP>   # 本地测试部署用户能否登录
```

## 3. Cloudflare 设置

1. DNS → Records → Add record：`A`、`blog`、服务器公网 IP，Proxy 先选 **DNS only（灰云）**。
2. 等 `nslookup blog.shiwu.dev` 返回服务器 IP 后，再让 Caddy 去签发证书。
3. 证书正常后可切 **Proxied（橙云）**：SSL/TLS → Overview → **Full (strict)**，Edge Certificates 可开 Always Use HTTPS。
4. 服务器安全组/防火墙放行 22（或自定义 SSH 端口）、80、443。

## 4. 配置 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions：

| Secret | 方案 A | 方案 B |
| --- | --- | --- |
| `SSH_HOST` | 服务器公网 IP | 服务器公网 IP |
| `SSH_USER` | `deploy` | `shiwu` |
| `SSH_PORT` | `22` | `22` |
| `SSH_PRIVATE_KEY` | `~/.ssh/blog_deploy` 完整内容 | 同左 |
| `SSH_KNOWN_HOSTS` | `ssh-keyscan -p 22 <服务器IP>` 的完整输出 | 同左 |
| `DEPLOY_PATH` | `/var/www/blog` | `/home/shiwu/blog` |

Windows 上生成 `SSH_KNOWN_HOSTS`：

```powershell
& "$env:WINDIR\System32\OpenSSH\ssh-keyscan.exe" -p 22 <服务器IP>
# 把输出整段粘贴到 SSH_KNOWN_HOSTS
```

## 5. 创建仓库并推送

在 GitHub 新建**空仓库** `shiwu84/blog`（不要勾 README / .gitignore / license），再：

```powershell
cd C:\Users\shiwu\Desktop\Blog
git push -u origin main
```

推送后 Actions 会自动跑：`Build` → `Deploy to server`。也可以手动触发：Actions → Deploy blog → Run workflow。

## 6. 验证

```powershell
curl -I https://blog.shiwu.dev/
```

本地手动部署（应急，不依赖 Actions）：

```bash
npm run build
rsync -az --delete -e "ssh -p 22" ./dist/ deploy@<服务器IP>:/var/www/blog/
# 方案 B 换成：./dist/ shiwu@<服务器IP>:/home/shiwu/blog/
```

日常发布：**改文章 → `git push` → 自动上线**。

---

## FAQ / 排错

**Q：`scp` / `ssh` 命令找不到**
A：Windows 自带 OpenSSH，可用完整路径 `C:\WINDOWS\System32\OpenSSH\scp.exe`；或在「设置 → 应用 → 可选功能」中安装 OpenSSH 客户端，或改用 Git Bash。

**Q：Caddy 证书签发失败（challenge failed / timeout）**
A：检查 DNS 是否已生效、80/443 是否放行；Cloudflare 橙云 + Always Use HTTPS 可能拦截 ACME，先临时切灰云或关闭 Always Use HTTPS，签发成功后再开。

**Q：Cloudflare 返回 521 / 522**
A：Caddy 没运行（`systemctl status caddy`）或 443 被拦截；橙云模式下源站仍需开放 443。

**Q：Actions 报 `Permission denied (publickey)`**
A：检查 `SSH_USER` / `SSH_HOST` / `SSH_PORT`；部署用户的 `.ssh` 权限应为 700、`authorized_keys` 为 600；私钥与公钥是否配对。

**Q：Actions 报 `Host key verification failed`**
A：`SSH_KNOWN_HOSTS` 与实际 IP/端口不一致，重新 `ssh-keyscan` 生成。

**Q：rsync 写入失败 / 权限不足**
A：确认 `DEPLOY_PATH` 属主是 `SSH_USER`。方案 B 用 `sudo chown -R shiwu:shiwu /home/shiwu/blog`；方案 A 用 `sudo chown -R deploy:deploy /var/www/blog`。

**Q：Caddy 返回 403 / 站点空白（方案 B）**
A：Caddy 用户（`caddy`）需要能穿过 `/home/shiwu`：`sudo chmod o+x /home/shiwu`；站点目录权限 `chmod 755 /home/shiwu/blog`。脚本已自动处理。

**Q：部署到 `/home/shiwu/blog` 后 Caddyfile 里还是旧路径**
A：用脚本初始化会自动替换；手动安装 Caddyfile 时记得把 `root * /var/www/blog` 改成 `/home/shiwu/blog`。

**Q：发布后页面样式丢失 / 404**
A：`BASE_PATH` 必须为 `/`（根域名部署）；确认 Actions 里 `dist/` 同步到了正确目录。

**Q：更新了但页面还是旧的**
A：Cloudflare 缓存。可在控制台 Purge Everything；Caddy 已对 HTML 设 `must-revalidate`。
