# 十五的博客

> 十五的个人博客，记录技术、阅读与生活。

基于 [Astro](https://astro.build/) 静态构建，主题使用开源的 [LogFlow Theme](https://github.com/kevynf/logflow-theme)（MIT 协议），并做了个人化配置。

## 本地运行

要求 Node.js `>= 22.12.0`。

```bash
npm install
npm run dev      # 本地预览：http://localhost:4321
npm run build    # 构建静态站点到 dist/
npm run preview  # 预览构建结果
npm run check    # Astro/TypeScript 类型检查
```

启动 `npm run dev` 后，可以另开终端跑一次站点自检，确认页面与个人化内容都正常：

```bash
node scripts/check-site.mjs
```

> 关于 `scripts/net-use-shim.cjs`：Vite 在 Windows 上会执行 `net use` 探测网络驱动器。在限制子进程的沙箱环境（例如本项目最初的开发环境）里，这个探测会抛错并导致构建失败，所以 npm 脚本通过预加载该 shim 给它一个安全兜底。该 shim 只拦截 `net use` 这一条命令，在普通开发机和部署环境里没有副作用；如果你想恢复成纯 `astro` 命令，直接修改 `package.json` 里的 scripts 即可。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `src/consts.ts` | 站点信息、导航、社交链接、首页文案、搜索/评论开关 |
| `src/content/blog/` | 文章（`.md` / `.mdx`），文件名即 URL slug |
| `src/content/about/index.md` | 关于页正文 |
| `src/config/friend-links.ts` | 友链数据 |
| `src/styles/global.css` | 颜色、字号、间距、圆角等设计令牌（Tailwind v4 `@theme`） |
| `src/pages/` | 首页、文章、归档、专题/标签、友链、关于、RSS、搜索索引 |
| `public/` | 头像、favicon、静态资源 |
| `scripts/` | 本地构建辅助脚本 |

## 修改站点信息

大部分个人化配置集中在 `src/consts.ts`：

| 配置 | 说明 |
| --- | --- |
| `SITE_TITLE` / `SITE_DESCRIPTION` | 站点标题与默认 SEO 描述 |
| `SITE_URL` | 生产站点地址（部署后改成真实域名） |
| `COPYRIGHT_NAME` | 页脚版权署名 |
| `PAGE_COPY` | 各页面标题与描述 |
| `NAV_LINKS` | 顶部导航 |
| `SOCIAL_LINKS` | 页脚社交链接（GitHub、邮箱等） |
| `HOME` | 首页头像、简介、格言、文章数量 |
| `GH_CONTRIBUTE` | GitHub 活跃度区块 |
| `COMMENTS` | giscus 评论配置 |
| `SEARCH` | 全站搜索开关与最大结果数 |

## 写文章

文章放在 `src/content/blog/`，支持 Markdown 和 MDX，文件名就是 URL，例如 `hello-world.md` 对应 `/blog/hello-world/`。

最简 Frontmatter：

```yaml
---
title: 文章标题
description: 一句话摘要
pubDate: 2026-10-17
---
```

可选字段：`updatedDate`、`tags`（数组）、`collection` / `collectionDescription`（专题）、`heroImage`（本地图片）、`enableComments`。

## 视觉定制

设计令牌集中在 `src/styles/global.css` 顶部的 `@theme` 与 `.dark` 中，改一处即可全站生效：

- **配色**：`--color-accent` / `--color-link` / `--color-page` / `--color-surface` / `--color-heading` 等。当前为「石墨灰」单色主题——浅色是浅灰纸面 + 石墨强调，暗色是石墨黑 + 亮灰强调；标签、链接、按钮、代码框外沿和背景动画都会跟随主色。
- **字体**：`--font-sans`（界面与标题）、`--font-serif`（正文，当前为思源宋体 → 宋体回退）、`--font-mono`（代码）。正文的衬线效果只作用于 `Prose` 内容区，界面保持无衬线。
- **排版**：`--text-reading`（正文字号与行高，当前 1rem / 1.9）、`--container-page`（阅读区宽度，当前 48rem）、`--radius-box`（卡片圆角）。
- **背景动画**：`src/components/TextSnowCanvas.astro` 的文字雪——零依赖 2D canvas，远景/近景双层景深，汉字缓缓飘落；颜色读取 `--ink-rgb` 并随明暗主题切换，系统开启「减少动态效果」时只做静态渲染。画质优先：不限制 DPR、逐帧渲染。想调整密度和速度，可改组件里的 `POOL`（字库）、数量与 `speed` 区间。

改完保存即可，`npm run dev` 会热更新。

## 可选功能

- **GitHub 活跃度**：首页默认显示，免 token 即可工作（走公开统计接口）。如果想用 GitHub 官方 GraphQL 数据，复制 `.env.example` 为 `.env` 并填入只读的 `GITHUB_TOKEN`；在 `src/consts.ts` 把 `GH_CONTRIBUTE.enabled` 设为 `false` 可关闭该区块。
- **giscus 评论**：在 GitHub 仓库开启 Discussions，然后把 `src/consts.ts` 中 `COMMENTS` 的 `repo`、`repoId`、`categoryId` 填好并把 `enabled` 设为 `true`。
- **友链**：在 `src/config/friend-links.ts` 中按 `FriendLink` 接口添加；没有友链时页面会显示空状态提示。
- **搜索**：构建时生成静态索引，仅包含文章标题、摘要和标签；按 `Ctrl/⌘ + K` 或 `/` 打开。

## 部署

正式站点：**https://blog.shiwu.dev**（自有 Ubuntu 服务器 + Caddy + Cloudflare）。

```
git push main
   → GitHub Actions 构建（.github/workflows/deploy.yml）
   → rsync dist/ 到服务器 /var/www/blog
   → Caddy 托管静态文件 + 自动 HTTPS
   → Cloudflare CDN / DNS
```

- 工作流：push 到 `main` 自动构建并部署；PR 只做构建检查；也支持 Actions 页面手动触发。
- 服务器、Caddy、Cloudflare 和 GitHub Secrets 的完整配置步骤见 [deploy/README.md](./deploy/README.md)。
- 本地手动部署（应急）：`npm run build` 后
  `rsync -az --delete -e "ssh -p 22" ./dist/ deploy@<服务器IP>:/var/www/blog/`

`npm run build` 输出在 `dist/`，也可以部署到 Cloudflare Pages、Vercel、Netlify 等静态托管；若部署到子路径，用 `SITE_URL=... BASE_PATH=/<repo>` 构建。`sitemap`、`canonical` 与 RSS 会使用 `SITE_URL`。

## 主题与许可

- 主题来源：[LogFlow Theme](https://github.com/kevynf/logflow-theme)，MIT 协议，原始许可见 [LICENSE](./LICENSE)。
- 本站的个人配置、文章与图片内容版权归作者所有，未经许可请勿直接转载。
