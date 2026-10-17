---
title: 和 DeepSeek Harness 一起，把博客部署到自己的服务器
description: 用 Cloudflare + Caddy + GitHub Actions，把 Astro 博客自动部署到自己的 Ubuntu 服务器。记录完整流程、踩过的坑，以及 AI 在其中的真实作用。
pubDate: 2026-10-17
collection: 折腾日志
collectionDescription: 服务器、部署与各种工具折腾记录
tags:
  - 部署
  - Caddy
  - Cloudflare
  - GitHub Actions
  - DeepSeek Harness
---

博客搭起来容易，但"写完文章、推一下代码，网站就自动更新"这件事，中间还有不少活要干：域名解析、服务器配置、HTTPS 证书、构建流水线、部署权限……

这篇文章记录我把一个 Astro 博客部署到自己 Ubuntu 服务器的完整过程。整个过程是**和 DeepSeek Harness 一起完成的**——它负责查资料、写配置、读报错、改代码，我负责提供服务器、下判断、以及在云控制台点按钮。

## 为什么不用现成托管

一开始我也想过 GitHub Pages、Cloudflare Pages 这类方案：免费、零运维，对纯静态博客来说完全够用。

但我本来就有一台云服务器，上面跑着一些自建服务。把博客也放进去，好处是：

- 域名、CDN、证书、部署全链路都经手一遍，出了问题知道去哪里查；
- 不依赖某个平台的构建额度或政策；
- 以后想加访问统计、评论、图片处理之类的东西，服务器上都能自己折腾。

代价也明确：多了一台需要维护的机器，安全配置、证书续期、备份都要自己操心。**如果你只是想安静写字，付费托管更省事**；这篇文章更适合"想顺便学点运维"的人。

## 最终架构

```
本地写 Markdown
      │ git push
      ▼
GitHub Actions
  npm ci → astro check → astro build → 上传 dist 制品
      │ rsync over SSH（用部署密钥）
      ▼
Ubuntu 24.04 服务器
  /home/shiwu/blog ← Caddy（静态托管 + 自动 HTTPS）
      ▲
      │ A 记录 / 可选代理
Cloudflare（DNS + CDN + 边缘证书）
```

拆开看就四件事：

1. **Cloudflare** 管域名解析，顺便做 CDN；
2. **Caddy** 做静态文件服务器，自动申请和续期 HTTPS 证书；
3. **GitHub Actions** 负责构建，把产物同步到服务器；
4. **一个部署密钥**让 Actions 能以低权限登录服务器。

## 第一步：域名解析

在 Cloudflare 的 DNS 里加一条 A 记录，指向服务器公网 IP：

| 类型 | 名称 | 内容 | 代理状态 |
| --- | --- | --- | --- |
| A | blog | `<服务器公网 IP>` | 先 DNS only，之后可开 Proxied |

**代理状态建议先灰云（DNS only）**。原因是 Caddy 拿证书要靠 ACME 校验，Cloudflare 代理会转发校验请求，但如果你开了"Always Use HTTPS"之类的重定向规则，校验可能被提前中断。等证书签发成功，再切橙云并把 SSL/TLS 模式设为 **Full (strict)**，这套流程最稳。

## 第二步：服务器准备

服务器是 Ubuntu 24.04，root 登录默认关闭，用一个有 sudo 权限的普通账号操作。部署目录放在 `/home/shiwu/blog`，不用 root 目录，也不用 `/var/www`。

```bash
mkdir -p /home/shiwu/blog
chmod 755 /home/shiwu/blog
```

这里有个容易忽略的细节：站点目录在 `/home` 下时，Caddy 的运行用户（`caddy`）需要能**穿过**家目录才能读到里面的文件。如果家目录权限是 `drwxr-x---`，Caddy 会返回 403。解决方法是给家目录加上 `o+x`（只允许进入，不允许列目录）：

```bash
chmod o+x /home/shiwu
```

## 第三步：Caddy 配置

服务器上的 Caddy 用 `conf.d` 分片管理站点：主 Caddyfile 只负责引入，具体站点配置放在单独文件里。

```caddyfile
# /etc/caddy/Caddyfile
import /etc/caddy/conf.d/*
```

```caddyfile
# /etc/caddy/conf.d/blog
blog.shiwu.dev {
	root * /home/shiwu/blog
	encode zstd gzip
	file_server

	@immutable path /_astro/*
	header @immutable Cache-Control "public, max-age=31536000, immutable"

	@html path / *.html
	header @html Cache-Control "public, max-age=0, must-revalidate"

	header {
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}

	handle_errors {
		rewrite * /404.html
		file_server
	}
}
```

几个设计考虑：

- `/_astro/*` 下的资源带内容 hash，可以放心长缓存；HTML 则每次回源校验，保证发布后立即生效。
- **404 页面必须写 `handle_errors`**。Caddy 的 `file_server` 不会像 nginx 那样自动寻找 `404.html`，不加这段的话自定义 404 永远不生效——这是一个我实际踩到的坑。
- 关掉 `Server` 响应头，少暴露一点信息。

## 第四步：部署密钥与 GitHub Actions

Actions 需要 SSH 登录服务器，所以生成一对专用的 ed25519 密钥：

```bash
ssh-keygen -t ed25519 -C "github-actions-blog" -f ~/.ssh/blog_deploy -N ""
```

把公钥写进服务器的 `authorized_keys`，并加上 `restrict` 限制（禁止端口转发、X11 转发等，只保留命令执行，rsync 需要）：

```
restrict ssh-ed25519 AAAA... github-actions-blog
```

私钥、服务器地址、端口、部署目录这些配置进 GitHub 仓库的 Secrets，工作流核心就三步：

```yaml
- name: Sync dist to server
  run: |
    PORT="${SSH_PORT:-22}"
    TARGET="${DEPLOY_PATH%/}/"
    rsync -az --delete --chmod=D755,F644 \
      -e "ssh -p ${PORT} -o BatchMode=yes -o ConnectTimeout=20" \
      ./dist/ "${SSH_USER}@${SSH_HOST}:${TARGET}"
```

`--delete` 保证服务器上的文件和构建产物完全一致：删掉的文章、过期的资源都会被清理。

## 踩坑记录

这部分可能比流程本身更有用。

### 1. `scp`/`ssh` 明明装了却提示找不到

Windows 自带 OpenSSH，但在某些终端里 PATH 没生效。用完整路径即可：

```powershell
& "$env:WINDIR\System32\OpenSSH\scp.exe" -r .\deploy .\blog_deploy.pub user@<服务器IP>:~/
```

### 2. `Host key verification failed`

工作流第一次跑，`exit code 255`，日志里写着 `No ED25519 host key is known for ... and you have requested strict checking`。

原因是 `SSH_KNOWN_HOSTS` 这个 Secret 里主机密钥不完整或带了 Windows 的 CRLF 换行，导致 OpenSSH 匹配不上。修复方式是**在写入 known_hosts 前去掉 `\r`**，并用 `ssh-keyscan` 补全缺失的密钥类型：

```bash
printf '%s\n' "${SSH_KNOWN_HOSTS}" | tr -d '\r' > ~/.ssh/known_hosts
ssh-keyscan -p "$PORT" "$SSH_HOST" 2>/dev/null | grep -v '^#' >> ~/.ssh/known_hosts
sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts
```

更稳妥的做法是把服务器主机密钥的 SHA256 指纹也存成 Secret，在连接前做一次固定校验。

### 3. 自定义 404 不生效

Caddy 没有自动使用 `404.html` 的行为，必须显式配置 `handle_errors`（见上面的 Caddyfile）。

### 4. Cloudflare 邮箱混淆 + 无刷新换页

页面里的邮箱显示成了 `[email protected]`，刷新后又正常。原因是 Cloudflare 的「邮箱地址混淆」会把邮箱替换成加密占位符，靠它注入的脚本解码；而博客用了 Astro 的 ClientRouter，换页是前端完成的，Cloudflare 的脚本不会重新执行。

两种处理：关掉 Cloudflare 的邮箱混淆（推荐，反正邮箱本来就是公开的），或者在自己的脚本里加一段兜底解码，在每次 `astro:page-load` 后把占位符还原。

### 5. 移动端的贡献图被裁切

首页那张 GitHub 贡献图在手机上显示不全。根本原因是它按固定像素排了 54 列，窄屏放不下只能横向滚动，看起来就像被切掉。

最后的方案是：桌面显示完整一年，手机显示最近半年，并用 CSS 容器查询按容器宽度动态计算格子大小，保证两套布局都刚好完整显示。

## AI 在这件事里到底做了什么

标题里特意提了 DeepSeek Harness，是因为它的作用不只是"帮我写几行配置"。

具体分工大概是：

- **它做的**：写 Caddyfile 和工作流、设计部署脚本、根据报错日志定位问题（比如从 `exit code 255` 和一行 `No ED25519 host key` 判断出 known_hosts 的问题）、把"移动端显示不全"拆成容器查询方案并实现、检查线上页面返回的响应头和 HTML。
- **我做的**：准备服务器和域名、在 Cloudflare 控制台点设置、在 GitHub 填 Secrets、执行需要 sudo 的命令、判断哪些方案适合自己。

一个很实际的体会是：**AI 最擅长的不是从零生成大段代码，而是在配置和错误日志的夹缝里快速定位问题**。但前提是你要提供准确的上下文——完整的报错、截图、版本号、你做过什么操作。含糊地描述"部署失败了"，得到的也只能是含糊的建议。

另外，AI 也有明确的边界：它不能替你在云控制台点按钮，也不能替你保管私钥。所有涉及凭据的操作，仍然需要自己完成，并且尽量不要把私钥、密码之类的东西直接贴进对话里。

## 现在的工作流

日常发布已经简化成一句话：

```bash
git add .
git commit -m "新文章"
git push
```

GitHub Actions 自动构建、部署，十来秒后线上就更新了。需要排查问题的时候，服务器上看 Caddy 日志，GitHub 上看 Actions 日志，基本够用。

## 给同样想自建博客的人

如果看完你也想折腾，几条建议：

1. **先把最小链路跑通**：域名解析 → 服务器上一个静态页 → 访问成功，再往上加自动化。
2. **证书先灰云签发**，成功后再开 Cloudflare 代理和 Full (strict)。
3. **部署密钥最小权限**：能用独立部署账号就别用有 sudo 的账号。
4. **别怕踩坑**，每一次 502、证书失败、权限错误，最后都会变成你对这套系统的一点理解。

这套东西不复杂，但确实需要耐心。而把它跑通的那一刻，还是挺爽的。
