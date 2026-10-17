# 十五的博客

> 记录计算机、AI 与日常折腾的个人博客。

线上站点：**https://blog.shiwu.dev**

基于 [Astro](https://astro.build/) 静态构建，主题使用开源的 [LogFlow Theme](https://github.com/kevynf/logflow-theme)（MIT 协议），并做了个人化改造：石墨灰单色主题、文字雪背景、适配手机的 GitHub 活跃度图、Mermaid 图表、明暗主题切换。

## 快速开始

要求 Node.js `>= 22.12.0`（推荐 24）。

```bash
npm ci            # 安装依赖
npm run dev       # 本地开发：http://localhost:4321
```

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器，支持热更新 |
| `npm run build` | 构建静态站点到 `dist/` |
| `npm run preview` | 预览构建结果 |
| `npm run check` | Astro + TypeScript 类型检查 |
| `node scripts/check-site.mjs` | 本地站点自检（需先启动 `npm run dev`，默认检查 `127.0.0.1:4321`） |
| `node scripts/verify-live.mjs` | 线上验收（默认检查 `https://blog.shiwu.dev`） |

> **Windows 沙箱兼容**：Vite 在 Windows 上会调用 `net use` 探测网络驱动器，在限制子进程的沙箱里会抛错导致构建失败。npm 脚本通过预加载 `scripts/net-use-shim.cjs` 给这条命令做了兜底；普通开发机和部署环境不受影响，想恢复纯 `astro` 命令直接改 `package.json` 即可。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `src/consts.ts` | 站点信息、导航、社交链接、首页文案、搜索/评论/活跃度开关 |
| `src/content/blog/` | 文章源文件，文件名即 URL slug |
| `src/content/about/index.md` | 关于页正文 |
| `src/config/friend-links.ts` | 友链数据 |
| `src/styles/global.css` | 设计令牌（Tailwind v4 `@theme`）与文章排版样式 |
| `src/components/` | 页头、文字雪、GitHub 活跃度、Mermaid 渲染等组件 |
| `src/pages/` | 首页、文章、归档、专题/标签、友链、关于、RSS、搜索索引 |
| `public/` | 头像、favicon、文章配图 |
| `scripts/` | 站点自检脚本与 net-use shim |
| `deploy/` | 服务器部署脚本、Caddy 与 Cloudflare 配置 |
| `.github/workflows/deploy.yml` | GitHub Actions 自动构建与部署 |

## 个性化配置

### 站点信息

个人化配置集中在 `src/consts.ts`：

| 配置 | 说明 |
| --- | --- |
| `SITE_TITLE` / `SITE_DESCRIPTION` | 站点标题与默认 SEO 描述 |
| `SITE_URL` | 生产站点地址，sitemap、canonical 与 RSS 都使用它 |
| `COPYRIGHT_NAME` | 页脚版权署名 |
| `PAGE_COPY` | 各页面的标题与描述 |
| `NAV_LINKS` | 顶部导航 |
| `SOCIAL_LINKS` | 页脚社交链接（GitHub、邮箱等） |
| `HOME` | 首页头像、简介、格言、文章数量 |
| `GH_CONTRIBUTE` | GitHub 活跃度区块 |
| `COMMENTS` | giscus 评论配置 |
| `SEARCH` | 全站搜索开关与最大结果数 |

### 视觉

设计令牌集中在 `src/styles/global.css` 顶部的 `@theme` 与 `.dark`，改一处即可全站生效：

- **配色**：`--color-accent` / `--color-link` / `--color-page` / `--color-surface` / `--color-heading` 等。当前是「石墨灰」单色主题——浅色为浅灰纸面 + 石墨强调，暗色为石墨黑 + 亮灰强调。
- **字体**：`--font-sans`（界面与标题）、`--font-serif`（正文，思源宋体 → 宋体回退）、`--font-mono`（代码）。衬线正文只作用于 `Prose` 内容区。
- **排版**：`--text-reading`（正文字号与行高）、`--container-page`（阅读区宽度）、`--radius-box`（卡片圆角）。
- **文字雪**：`src/components/TextSnowCanvas.astro`，零依赖 2D canvas，远/近双层景深，颜色读取 `--ink-rgb` 并跟随明暗主题；系统开启「减少动态效果」时只做静态渲染。想调密度和速度，改组件里的 `POOL`（字库）、数量与 `speed` 区间。
- **头像与 favicon**：`public/avatar.svg`、`public/favicon.svg`。

### 文章配图

图片放在 `public/images/` 下，正文里用 `<figure>` + `<figcaption>`，样式（圆角、边框、居中图注）已内置：

```markdown
<figure>
  <img src="/images/deploy/timeline.svg" alt="流程示意图" />
  <figcaption>图 1：那天下午的流程</figcaption>
</figure>
```

## 写文章

文章放在 `src/content/blog/`，支持 Markdown 和 MDX，文件名就是 URL。例如 `deploy-blog-with-ai.md` 对应 `/blog/deploy-blog-with-ai/`。

最简 Frontmatter：

```yaml
---
title: 文章标题
description: 一句话摘要
pubDate: 2026-10-17
---
```

可选字段：`updatedDate`、`tags`（数组）、`collection` / `collectionDescription`（专题）、`heroImage`（本地图片）、`enableComments`。

### 专题与标签约定

- **专题（collection）** 建议固定几类：`Rust`、`Linux`、`AI`、`游戏开发`、`折腾日志`
- **标签（tags）** 写更细的关键词，例如：`所有权`、`借用`、`Caddy`、`Cloudflare`、`Cocos Creator`
- 一篇一主题，标题尽量说清楚「读者能获得什么」
- 没有文章时，首页、文章、标签、归档页会自动显示空状态

### Mermaid 图表

在文章里直接用 ` ```mermaid ` 代码块，支持流程图、时序图等：

````markdown
```mermaid
flowchart TD
    A[本地写 Markdown] -->|jj git push| B[GitHub Actions]
    B --> C[部署到服务器]
```
````

渲染在浏览器端按需进行：**只有包含 mermaid 代码块的文章才会加载 Mermaid**，图表配色跟随明暗主题；语法错误或加载失败会回退成原始代码块。

### 写作风格

站内文章希望读起来像人在讲自己的经历，而不是技术文档。语气、结构、配图习惯和「让 AI 帮忙改写」的 Prompt 模板见 [WRITING.md](./WRITING.md)。

## 可选功能

- **GitHub 活跃度**：首页默认显示，免 token 即可工作（走公开统计接口）。想用 GitHub 官方 GraphQL 数据，复制 `.env.example` 为 `.env` 并填入只读的 `GITHUB_TOKEN`；把 `src/consts.ts` 里的 `GH_CONTRIBUTE.enabled` 设为 `false` 可关闭该区块。手机端显示最近半年，桌面端显示完整一年。
- **giscus 评论**：在 GitHub 仓库开启 Discussions，然后把 `src/consts.ts` 中 `COMMENTS` 的 `repo`、`repoId`、`categoryId` 填好，并把 `enabled` 设为 `true`。
- **友链**：在 `src/config/friend-links.ts` 中按 `FriendLink` 接口添加；没有友链时页面会显示空状态提示。
- **搜索**：构建时生成静态索引（只含标题、摘要和标签），按 `Ctrl/⌘ + K` 或 `/` 打开。

## 部署

正式站点在自有 Ubuntu 服务器上，由 Caddy 托管静态文件并自动申请 HTTPS，Cloudflare 负责 DNS 和 CDN。日常发布流程：

```bash
jj describe -m "新文章"   # 描述当前改动
jj new                    # 开始下一个 change
jj git push --bookmark main
```

推送后由 GitHub Actions 自动完成构建和部署：

```
jj git push → GitHub Actions（npm ci / astro check / astro build）
            → rsync dist/ 到服务器站点目录（/home/shiwu/blog）
            → Caddy 托管 + 自动 HTTPS
            → Cloudflare CDN / DNS
```

- **版本控制**：本站使用 [Jujutsu](https://jj-vcs.github.io/jj/)（jj）而不是 git。工作副本本身就是一个 commit，日常不需要 `git add`；改动推到 GitHub 后同样会触发 Actions。行尾统一为 LF，由 `.editorconfig` 保证。
- **工作流**：push 到 `main` 自动构建并部署；PR 只做构建检查；也支持在 Actions 页面手动触发。
- **服务器配置**：Caddy、Cloudflare、GitHub Secrets 的完整步骤见 [deploy/README.md](./deploy/README.md)。
- **应急手动部署**：`npm run build` 后

  ```bash
  rsync -az --delete -e "ssh -p 22" ./dist/ deploy@<服务器IP>:/home/shiwu/blog/
  ```

`npm run build` 输出在 `dist/`，也可以部署到 Cloudflare Pages、Vercel、Netlify 等静态托管；如果部署在子路径下，用 `SITE_URL=... BASE_PATH=/<repo>` 构建。

## 主题与许可

- 主题来源：[LogFlow Theme](https://github.com/kevynf/logflow-theme)，MIT 协议，原始许可见 [LICENSE](./LICENSE)。
- 本站的个人配置、文章与图片内容版权归作者所有，未经许可请勿直接转载。
