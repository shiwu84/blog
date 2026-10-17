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
  /var/www/blog  ←  Caddy（静态托管 + 自动 HTTPS）
      ▲
      │ A 记录 / 可选代理
Cloudflare（DNS + CDN + 边缘证书）
```

需要准备：

| 项目 | 本指南默认值 |
| --- | --- |
| GitHub 仓库 | `shiwu84/blog` |
| 服务器 | Ubuntu 24.04，SSH 端口 22 |
| 部署用户 | `deploy`（只能写站点目录） |
| 站点目录 | `/var/www/blog` |
| 域名 | `blog.shiwu.dev` |

---

## 1. 本地生成部署专用 SSH 密钥

在**你自己的电脑**上执行（不要用日常登录服务器的主密钥，也不要在服务器上生成）：

```bash
ssh-keygen -t ed25519 -C "github-actions-blog" -f ~/.ssh/blog_deploy
```

会得到两个文件：

- `~/.ssh/blog_deploy`：私钥，稍后填进 GitHub Secrets
- `~/.ssh/blog_deploy.pub`：公钥，放到服务器 `deploy` 用户

先确认能用它登录服务器（公钥配好后）：

```bash
ssh -i ~/.ssh/blog_deploy deploy@<服务器公网IP>
```

## 2. 服务器初始化（一次性）

把本目录的 `deploy/` 上传到服务器（或直接在服务器上创建文件），然后执行：

```bash
# 在服务器上
sudo DEPLOY_PUBKEY="$(cat ~/.ssh/blog_deploy.pub)" bash setup-server.sh
```

脚本会：创建 `deploy` 用户 → 建好 `/var/www/blog` → 安装 Caddy → 写入部署公钥 → 配置防火墙 → 启用 Caddy。

> 不想用脚本也可以手动做这几步，核心是：`deploy` 用户对 `/var/www/blog` 有写权限、Caddy 已安装、部署公钥在 `/home/deploy/.ssh/authorized_keys` 里（建议加 `restrict` 前缀）。

## 3. 配置 Caddy

把 [Caddyfile](./Caddyfile) 复制到服务器并重载：

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

配置要点（已写在 Caddyfile 里）：静态托管 `/var/www/blog`、gzip/zstd 压缩、`/_astro/*` 长缓存、HTML 不缓存、基础安全响应头。首次访问站点时 Caddy 会自动申请 HTTPS 证书。

常用排查命令：

```bash
sudo systemctl status caddy
sudo journalctl -u caddy -f
```

## 4. Cloudflare 设置

1. **DNS → Records → Add record**
   - Type：`A`
   - Name：`blog`
   - IPv4 address：服务器公网 IP
   - Proxy status：**先选 DNS only（灰云）**，让 Caddy 先成功签发证书
2. 浏览器访问 `http://blog.shiwu.dev` 确认能打开；再访问 `https://blog.shiwu.dev` 确认证书正常。
3. 证书签发成功后，可以按需把代理切成 **Proxied（橙云）**：
   - SSL/TLS → Overview → 加密模式选 **Full (strict)**（Caddy 用的是公信证书，可以直接严格校验）
   - Edge Certificates → 可开启 **Always Use HTTPS**
   - 如果切橙云后 Caddy 重新签发证书失败，见文末 FAQ

> SSH 不走 Cloudflare 代理，GitHub Actions 使用服务器公网 IP 连接，因此服务器安全组/防火墙要放行 22（或你的自定义 SSH 端口）、80、443。

## 5. 配置 GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions → New repository secret**，添加：

| Secret | 值 |
| --- | --- |
| `SSH_HOST` | 服务器公网 IP（不要填 `blog.shiwu.dev`，SSH 不走 CDN） |
| `SSH_USER` | `deploy` |
| `SSH_PORT` | `22`（非 22 则填自定义端口） |
| `SSH_PRIVATE_KEY` | `~/.ssh/blog_deploy` 的**完整内容**（包含 `BEGIN` / `END` 行） |
| `SSH_KNOWN_HOSTS` | 本机执行 `ssh-keyscan -p 22 <服务器公网IP>` 的完整输出 |
| `DEPLOY_PATH` | `/var/www/blog` |

`SSH_KNOWN_HOSTS` 用来固定服务器指纹，防止中间人攻击，示例：

```bash
ssh-keyscan -p 22 203.0.113.10 > known_hosts.txt
# 把 known_hosts.txt 的全部内容粘贴到 SSH_KNOWN_HOSTS
```

## 6. 创建仓库并推送

在 GitHub 上新建**空仓库** `shiwu84/blog`（不要勾选 README / .gitignore / license），然后在本项目目录：

```bash
git remote add origin https://github.com/shiwu84/blog.git
git push -u origin main
```

推送后进入仓库 **Actions** 页：

- `Build` 会在 `npm ci` → `npm run check` → `npm run build` 后上传 `dist` 制品
- `Deploy to server` 会用 rsync 把 `dist/` 同步到 `/var/www/blog`（`--delete` 会清理已删除的旧文件）
- 也可以手动触发：Actions → Deploy blog → Run workflow

## 7. 验证

```bash
curl -I https://blog.shiwu.dev/
# 应返回 HTTP/2 200，且带 cache-control / x-content-type-options 等响应头
```

本地手动部署（应急用，不依赖 Actions）：

```bash
npm run build
rsync -az --delete -e "ssh -p 22" ./dist/ deploy@<服务器公网IP>:/var/www/blog/
```

日常发布流程就一句：**改完文章 `git push`**，剩下的全自动。

---

## FAQ / 排错

**Q：Caddy 证书签发失败（`challenge failed` / `timeout`）**
A：常见原因：80/443 未放行、域名没解析到服务器、Cloudflare 代理 + `Always Use HTTPS` 在 ACME 校验前就重定向。处理顺序：临时切灰云或关闭 Always Use HTTPS → 等 Caddy 签发成功 → 再开橙云；或在 Cloudflare 签发 Origin 证书，Caddy 用 `tls /etc/caddy/origin.pem /etc/caddy/origin.key` 指定证书。

**Q：Cloudflare 返回 521 / 522**
A：Caddy 没运行（`systemctl status caddy`）或服务器 443 被防火墙拦截。Cloudflare 代理模式下源站仍需开放 443。

**Q：Actions 报 `Permission denied (publickey)`**
A：`SSH_USER`/`SSH_HOST`/`SSH_PORT` 是否正确；`deploy` 用户的 `authorized_keys` 权限应为 600、`.ssh` 为 700；私钥与公钥是否配对。

**Q：Actions 报 `Host key verification failed`**
A：`SSH_KNOWN_HOSTS` 和实际 IP/端口不一致（用了域名或换过 IP/端口），重新 `ssh-keyscan` 生成。

**Q：rsync 报 `Permission denied` 写目录失败**
A：`/var/www/blog` 属主不是 `deploy`：`sudo chown -R deploy:deploy /var/www/blog`。

**Q：发布后页面样式丢失 / 404**
A：`BASE_PATH` 必须为 `/`（根域名部署）；确认 Actions 里 `dist/` 同步成功。

**Q：更新了但页面还是旧的**
A：Cloudflare 缓存。HTML 在 Caddy 里已设 `must-revalidate`，若仍异常可在 Cloudflare 控制台 Purge Everything。

**Q：想给交互加安全策略（CSP）**
A：Caddyfile 里追加 `Content-Security-Policy` 响应头即可；注意 Astro 内联脚本需要 `'unsafe-inline'`，调整后先本地验证。
