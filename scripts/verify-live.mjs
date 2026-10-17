// 线上验收脚本：node scripts/verify-live.mjs [baseUrl]
const baseUrl = (process.argv[2] ?? "https://blog.shiwu.dev").replace(/\/$/, "");

const results = [];
function check(name, ok, detail = "") {
	results.push({ name, ok, detail });
}

async function get(path) {
	const response = await fetch(baseUrl + path, { redirect: "manual" });
	const text = await response.text();
	return { status: response.status, headers: response.headers, text };
}

const home = await get("/");
check("首页 200", home.status === 200, String(home.status));
check("标题为「十五的博客」", home.text.includes("<title>十五的博客</title>"));
check("文字雪背景已渲染", home.text.includes("text-snow-canvas"));
check("GitHub 活跃度区块", home.text.includes("GitHub 活跃度") && home.text.includes("次贡献"));
check("首页文章区空状态", home.text.includes("还没有文章"));
check("页脚版权", home.text.includes("十五"));
check("Cloudflare 代理", (home.headers.get("server") ?? "").toLowerCase().includes("cloudflare"), home.headers.get("server") ?? "");
check("HTML 不缓存策略", (home.headers.get("cache-control") ?? "").includes("must-revalidate"), home.headers.get("cache-control") ?? "");

const cssMatch = home.text.match(/href="(\/_astro\/[^"]+\.css)"/);
if (cssMatch) {
	const css = await fetch(baseUrl + cssMatch[1]);
	check("CSS 资源可访问", css.status === 200, `${css.status} ${cssMatch[1]}`);
} else {
	check("CSS 资源可访问", false, "首页未找到 CSS 链接");
}

const blog = await get("/blog/");
check("文章列表页", blog.status === 200 && blog.text.includes("还没有文章"));

const about = await get("/about/");
check("关于页", about.status === 200 && about.text.includes("我是十五"));

const rss = await get("/rss.xml");
check("RSS 可访问且站点地址正确", rss.status === 200 && rss.text.includes("https://blog.shiwu.dev/"));

const sitemap = await get("/sitemap-0.xml");
check("sitemap 包含站点地址", sitemap.status === 200 && sitemap.text.includes("https://blog.shiwu.dev/"));

const notFound = await get("/this-page-should-404/");
check("自定义 404 页面", notFound.status === 404 && notFound.text.includes("页面不存在"));

let failed = 0;
for (const item of results) {
	if (!item.ok) failed += 1;
	console.log(`${item.ok ? "✓" : "✗"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} 项通过`);

if (failed > 0) process.exitCode = 1;
