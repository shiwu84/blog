// 站点自检脚本：启动本地预览后运行 `node scripts/check-site.mjs [baseUrl]`
// 检查关键页面是否可访问，以及个人化内容是否正确渲染。
const baseUrl = (process.argv[2] ?? "http://127.0.0.1:4321").replace(/\/$/, "");

const checks = [];
function check(name, ok, detail = "") {
	checks.push({ name, ok, detail });
}

async function get(path) {
	const response = await fetch(baseUrl + path);
	if (!response.ok) throw new Error(`${path} 返回 ${response.status}`);
	return response.text();
}

const home = await get("/");
check("首页 200 且标题为「十五的博客」", home.includes("<title>十五的博客</title>"));
check("首页使用个人头像 /avatar.svg", home.includes("/avatar.svg"));
check("文字雪背景动画已渲染", home.includes('id="text-snow-canvas"'));
check("首页文案已个人化", home.includes("这里是十五的个人博客"));
check("首页格言已更新", home.includes("保持好奇，认真记录"));
check("首页显示欢迎文章", home.includes("你好，世界"));
check("页脚 GitHub 链接", home.includes("https://github.com/shiwu84"));
check("页脚邮箱链接", home.includes("mailto:x7y7z84@gmail.com"));
check("页脚版权署名", home.includes("©") && home.includes("十五"));
check("GitHub 活跃度图已显示", home.includes("GitHub 活跃度") && home.includes("次贡献"));

const blog = await get("/blog/");
check("文章页显示欢迎文章", blog.includes("你好，世界"));
check("文章页包含标签「随笔」「博客」", blog.includes("随笔") && blog.includes("博客"));
const demo = ["LogFlow Theme：", "Frontmatter 使用实践", "Giscus 配置", "MDX 渲染", "自定义组件", "consts 配置"];
check("示例文章已清理", demo.every((title) => !blog.includes(title)));

const post = await get("/blog/hello-world/");
check("欢迎文章详情页可访问", post.includes("你好，世界") && post.includes("为什么开始写博客"));
check("文章页代码块正常高亮", post.includes("<pre") && post.includes("install"));

const about = await get("/about/");
check("关于页已个人化", about.includes("我是十五") && about.includes("github.com/shiwu84"));

const friends = await get("/friends/");
check("友链页有空状态提示", friends.includes("还没有添加友链"));

const rss = await get("/rss.xml");
check("RSS 使用正式站点地址", rss.includes("https://blog.shiwu.dev/"));
check("RSS 包含欢迎文章", rss.includes("你好，世界"));

const searchIndex = JSON.parse(await get("/search-index.json"));
check(
	"搜索索引仅含欢迎文章",
	searchIndex.length === 1 && searchIndex[0]?.id === "hello-world",
	`实际 ${searchIndex.length} 条`,
);

const sitemap = await get("/blog/tags/");
check("标签页可访问", sitemap.includes("随笔") && sitemap.includes("博客"));

const years = await get("/blog/years/");
check("归档页可访问", years.includes("2026"));

let failed = 0;
for (const item of checks) {
	if (!item.ok) failed += 1;
	console.log(`${item.ok ? "✓" : "✗"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}
console.log(`\n${checks.length - failed}/${checks.length} 项通过`);
if (failed > 0) process.exitCode = 1;
