// 站点基础信息：用于 Header、SEO、RSS、sitemap 与页脚。
export const SITE_TITLE = "十五的博客";
export const SITE_DESCRIPTION = "记录游戏开发、AI、Linux 与网络安全的学习笔记和日常折腾。";
// 站点地址；部署后请保持与真实访问地址一致。
// 也可用环境变量 SITE_URL 在构建时覆盖（GitHub Actions 中已设置）。
export const SITE_URL = "https://blog.shiwu.dev";
export const COPYRIGHT_NAME = "十五";

// 静态页面标题与概述：同时用于页面标题区域和 SEO description。
export const PAGE_COPY = {
  blog: {
    title: "文章",
    description: "按时间浏览全部文章。",
    descriptionItalic: false,
  },
  collections: {
    title: "专题",
    description: "按系列阅读相关文章。",
    descriptionItalic: false,
  },
  tags: {
    title: "标签",
    description: "按主题浏览全部文章。",
    descriptionItalic: false,
  },
  years: {
    title: "文章归档",
    description: "按发布时间浏览全部文章。",
    descriptionItalic: false,
  },
  friends: {
    title: "友链",
    description: "收藏一些值得长期拜访的个人站点。",
    descriptionItalic: false,
  },
  about: {
    title: "关于",
    description: "关于十五，以及这个博客的写作方向。",
    descriptionItalic: false,
  },
} as const;

// Header 导航入口。
export const NAV_LINKS = [
  { href: "/", label: "首页" },
  { href: "/blog", label: "文章" },
  { href: "/friends", label: "友链" },
  { href: "/about", label: "关于" },
] as const;

// 页脚社交链接；icon 对应 SocialIcon 内置图标键名。
export const SOCIAL_LINKS = [
  {
    label: "GitHub",
    href: "https://github.com/shiwu84",
    icon: "social/github",
  },
  {
    label: "邮箱",
    href: "mailto:x7y7z84@gmail.com",
    icon: "social/email",
  },
] as const;

// 首页个人信息与内容数量。
export const HOME = {
  avatar: {
    src: "/avatar.svg",
    alt: "十五的头像",
  },
  motto: "把知识织成网，慢慢记录。",
  description: "目前做 Cocos Creator 游戏开发，关注 AI、Linux、Rust 与网络安全。这里整理笔记，也记录一些日常折腾。",
  recentPostsLimit: 6,
} as const;

// 首页 GitHub 贡献图；默认使用免 token 的公开统计接口，配置 GITHUB_TOKEN 后改用官方 GraphQL。
export const GH_CONTRIBUTE = {
  enabled: true,
  title: "GitHub 活跃度",
  description: "最近一年的开源贡献记录",
  descriptionMobile: "最近半年的开源贡献记录",
  username: "shiwu84",
  profileUrl: "https://github.com/shiwu84",
  errorMessage: "GitHub 贡献图暂时不可用。",
} as const;

// 静态全文搜索；关闭后 Header 不渲染搜索入口。
export const SEARCH = {
  enabled: true,
  maxResults: 8,
} as const;

// 友链数据维护在独立文件中。
export { FRIEND_LINKS } from "./config/friend-links";

// 评论系统配置，当前提供方为 giscus。
export const COMMENTS = {
  enabled: false,
  provider: "giscus",
  repo: "owner/repository",
  repoId: "",
  category: "Announcements",
  categoryId: "",
  mapping: "pathname",
  themeLight: "light_protanopia",
  themeDark: "transparent_dark",
  lang: "zh-CN",
} as const;
