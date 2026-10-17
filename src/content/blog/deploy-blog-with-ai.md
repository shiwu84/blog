---
title: 和 DeepSeek Harness 一起，把博客部署到自己的服务器
description: 本来只想把博客丢到服务器上，结果和 AI 折腾了一下午：Cloudflare、Caddy、GitHub Actions，还有一堆踩不完的坑。
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

十月十七号下午，我第不知道多少次点开 GitHub Actions 的失败日志，屏幕上就一行字：

```
Process completed with exit code 255.
```

博客本身早就在本地跑起来了。页面、文字雪、暗色模式，都调到自己满意了。唯独“部署”这一步卡着，而且我已经记不清这是今天第几次失败了。

这篇文章就是那半天的记录。过程不算顺利，不过最后跑通了——现在写完文章 push 一下，十来秒后网站上就能看到。

## 我本来差点就用 Pages 了

一开始想得很简单：静态博客，扔 GitHub Pages 或者 Cloudflare Pages 上不就行了，免费、不用管服务器。

后来还是改了主意。原因有两个：一是我本来就有台云服务器，上面跑着几个自建服务；二是我确实想把这套东西完整走一遍，不然以后哪里出问题都不知道该从哪查。

说白了，一半是需求，一半是想折腾。

代价也很实在：证书、权限、备份、安全，全都变成自己的事。如果你只是想安安静静写点东西，别学我。

## 最后长这样

```mermaid
flowchart TD
    A["本地写 Markdown"] -->|git push| B["GitHub Actions"]
    B --> C["npm ci / astro check / astro build"]
    C --> D["上传 dist 制品"]
    D -->|rsync over SSH| E["Ubuntu 24.04 服务器"]
    E --> F["/home/shiwu/blog"]
    F --> G["Caddy：静态托管 + 自动 HTTPS"]
    G --> H["Cloudflare：DNS + CDN"]
```

拆开看其实就四件事：Cloudflare 负责域名解析，Caddy 负责 HTTPS 和静态文件，GitHub Actions 负责构建，一把 SSH 密钥负责把两边接起来。

## 域名：先别急着开橙色云

在 Cloudflare 加一条 A 记录，指向服务器公网 IP。这个没什么好说的。

关键是代理状态。我一开始顺手就开了橙云（Proxied），结果 Caddy 申请证书的时候一直失败。后来把代理切回灰云（DNS only），证书几分钟就签下来了，再切回橙云、SSL/TLS 模式改成 **Full (strict)**，一切正常。

这个顺序是 AI 提醒我的。它当时说“你先把灰云跑通再考虑代理”，我照做了。事后想想确实是这个道理，只是我一开始太想一步到位。

## 服务器：一个 403 换来的 o+x

部署目录放在 `/home/shiwu/blog`。不用 root 目录，也不用 `/var/www`，就放在自己用户下面。

然后 Caddy 返回了 403。

排查了一会儿才明白：站点在 `/home` 下面，Caddy 的运行用户需要能**穿过**家目录才能读到里面的文件。家目录默认是 `drwxr-x---`，Caddy 进不去。

```bash
chmod o+x /home/shiwu
```

只允许进入，不允许列目录。改完之后 403 就没了。

这种问题就属于“不知道的话能卡半天，知道了就是一行命令”。

## Caddy：conf.d 和那个不生效的 404

服务器上的 Caddy 用 conf.d 分片管理站点，主 Caddyfile 只负责引入：

```caddyfile
# /etc/caddy/Caddyfile
import /etc/caddy/conf.d/*
```

站点配置单独放在 `/etc/caddy/conf.d/blog`。缓存策略、安全头这些是常规操作，真正让我踩坑的是 404。

我把 `404.html` 放进了站点根目录，访问一个不存在的地址，返回的却是一片空白。查文档才发现，Caddy 的 `file_server` 不会像 nginx 那样自动寻找 404 页面，必须显式配置：

```caddyfile
handle_errors {
    rewrite * /404.html
    file_server
}
```

加完这段，自定义 404 才生效。

## GitHub Actions：那个 255

这是整晚最折腾的部分。

流程本身不复杂：GitHub Actions 构建完之后，用 rsync 通过 SSH 把 `dist/` 同步到服务器。需要生成一对专用密钥，公钥放到服务器 `authorized_keys`，私钥和服务器地址放进仓库 Secrets。

第一次失败，是因为 Secret 还没填完，`Setup SSH agent` 直接报错。这个好办。

第二次失败，就是开头那个 `exit 255` 了。我一开始怀疑是密钥格式问题，把 `authorized_keys` 翻来覆去检查了两遍，还重新生成了一次密钥。折腾半天，问题根本不在那。

AI 让我把 `Test SSH connection` 这一步的完整日志拉出来。日志最后一行是：

```
No ED25519 host key is known for ... and you have requested strict checking.
```

原来是我填的 `SSH_KNOWN_HOSTS` 里少了一行 ED25519 主机密钥，而且从 Windows 复制过来时还带了 CRLF 换行，OpenSSH 根本匹配不上。

最后的修法是写入前先去掉 `\r`，再用 `ssh-keyscan` 补全缺的密钥类型：

```bash
printf '%s\n' "${SSH_KNOWN_HOSTS}" | tr -d '\r' > ~/.ssh/known_hosts
ssh-keyscan -p "$PORT" "$SSH_HOST" 2>/dev/null | grep -v '^#' >> ~/.ssh/known_hosts
sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts
```

这件事给我一个教训：**看到 255，先去读日志最后一行，别急着怀疑自己**。

## 顺手修的几个小问题

- `scp` 明明装了却提示找不到，最后用完整路径解决的：`C:\WINDOWS\System32\OpenSSH\scp.exe`。
- 关于页的邮箱显示成 `[email protected]`，刷新一下又正常。是 Cloudflare 的邮箱混淆和 Astro 的无刷新换页打架，后来加了个解码兜底。
- 手机上看首页的贡献图被裁掉一截。最后改成桌面显示一年、手机显示半年，格子按容器宽度自适应。

都是小问题，但每一个都能单独耗掉半小时。

## AI 帮了什么，没帮什么

标题里提了 DeepSeek Harness，是因为它在这件事里确实不只是“帮我写几行配置”。

**它做得好的是读日志和写配置。** 比如 255 那次，我还在怀疑密钥，它已经从上一条报错里挑出 known_hosts 的问题了。Caddyfile 和工作流也是它先起草，我再按自己的情况改。

**它也会带错方向。** 中间它建议我直接开橙云，我照做，证书失败，又切回灰云。后来想想，它一开始就说过“先灰云”，是我自己没听。

**有些事它替不了我。** 在 Cloudflare 面板点按钮、在服务器上跑 sudo、把私钥粘进 GitHub Secrets——这些都得自己来。

一个比较真实的感受：跟 AI 一起干活，像和一个记性很好、但不了解你现场环境的同事合作。你描述得越具体，它给的判断越准。只说一句“部署失败了”，得到的也只能是泛泛的建议。

## 现在的工作流

日常发布已经退化成一个动作：

```bash
git add .
git commit -m "新文章"
git push
```

```mermaid
sequenceDiagram
    actor Me as 我
    participant GH as GitHub Actions
    participant Server as Ubuntu 服务器
    participant CF as Cloudflare
    Me->>GH: git push
    GH->>GH: npm ci / astro check / astro build
    GH->>Server: rsync dist/（SSH）
    Server-->>CF: 源站内容更新
    CF-->>Me: 访问 https://blog.shiwu.dev
```

看着 Actions 变绿、刷新后文章出现在网站上，确实挺爽的。前面那些 403、255 和空白页，好像也值了。

## 如果重来一次

- 先灰云，证书签好再开橙云。
- 给部署单独建一个账号，别用自己有 sudo 的。
- 遇到报错先读完整日志，最后一行往往就是答案。
- 别在晚上折腾，报错会被放大。

大概就这些。
