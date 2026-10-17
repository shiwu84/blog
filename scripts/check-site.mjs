// 站点自检脚本：启动本地预览后运行 `node scripts/check-site.mjs [baseUrl]`
// 检查关键页面是否可访问，以及内容是否正确渲染。
const baseUrl = (process.argv[2] ?? "http://127.0.0.1:4321").replace(/\/$/, "");

const POST_SLUG = "deploy-blog-with-ai";
const POST_TITLE = "和 DeepSeek Harness 一起，把博客部署到自己的服务器";

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
check("首页文案已个人化", home.includes("计算机学习者"));
check("首页显示第一篇文章", home.includes(POST_TITLE));
check("页脚 GitHub 链接", home.includes("https://github.com/shiwu84"));
check("页脚邮箱链接", home.includes("mailto:x7y7z84@gmail.com"));
check("页脚版权署名", home.includes("©") && home.includes("十五"));
check("GitHub 活跃度图已显示", home.includes("GitHub 活跃度") && home.includes("次贡献"));
check("桌面/移动两套贡献图", home.includes("--cal-weeks: 54") && home.includes("--cal-weeks: 27"));

const blog = await get("/blog/");
check("文章列表显示第一篇文章", blog.includes(POST_TITLE));
check("专题「折腾日志」已生成", blog.includes("折腾日志"));
check("标签已生成", blog.includes("部署") && blog.includes("Caddy"));

const post = await get(`/blog/${POST_SLUG}/`);
check("文章详情页可访问", post.includes(POST_TITLE) && post.includes("DeepSeek Harness"));
check("文章包含代码块", post.includes("<pre"));

const about = await get("/about/");
check("关于页已个人化", about.includes("我是十五") && about.includes("Rust") && about.includes("github.com/shiwu84"));

const friends = await get("/friends/");
check("友链页有空状态提示", friends.includes("还没有添加友链"));

const tags = await get("/blog/tags/");
check("标签页包含「部署」", tags.includes("部署"));

const years = await get("/blog/years/");
check("归档页包含 2026", years.includes("2026"));

const rss = await get("/rss.xml");
check("RSS 使用正式站点地址", rss.includes("https://blog.shiwu.dev/"));
check("RSS 包含第一篇文章", rss.includes(POST_TITLE));

const searchIndex = JSON.parse(await get("/search-index.json"));
check(
	"搜索索引包含第一篇文章",
	Array.isArray(searchIndex) && searchIndex.length === 1 && searchIndex[0]?.id === POST_SLUG,
	`实际 ${searchIndex.length} 条`,
);

let failed = 0;
for (const item of checks) {
	if (!item.ok) failed += 1;
	console.log(`${item.ok ? "✓" : "✗"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}
console.log(`\n${checks.length - failed}/${checks.length} 项通过`);
if (failed > 0) process.exitCode = 1;
