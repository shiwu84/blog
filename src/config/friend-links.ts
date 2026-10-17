export interface FriendLink {
  name: string;
  link?: string;
  url?: string;
  avatar?: string;
  desc?: string;
  description?: string;
}

export const FRIEND_LINKS: FriendLink[] = [
  {
    name: "Cocos 中文社区",
    url: "https://forum.cocos.org/",
    desc: "Cocos 引擎的中文开发者社区，查问题、看同行在做什么。",
  },
  {
    name: "阮一峰的网络日志",
    url: "https://www.ruanyifeng.com/blog/index.html",
    desc: "阮一峰的博客，科技爱好者周刊和技术随笔。",
  },
];
