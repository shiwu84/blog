import { request as httpsRequest } from "node:https";

export type GitHubContribution = {
  date: string;
  count: number;
  level: number;
};

export type GitHubContributionData = {
  contributions: GitHubContribution[];
  totalCount: number;
};

const GRAPHQL_URL = "https://api.github.com/graphql";
const PUBLIC_API_BASE = "https://github-contributions-api.jogruber.de/v4";
const DAY_MS = 86_400_000;
const REQUEST_TIMEOUT_MS = 10_000;

function requestHttps(
  url: string,
  options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string } = {},
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: options.method ?? "GET",
      agent: false,
      headers: {
        Accept: "application/json",
        Connection: "close",
        "User-Agent": "logflow-blog-build",
        ...options.headers,
        ...(options.body ? { "Content-Length": String(Buffer.byteLength(options.body)) } : {}),
      },
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { responseBody += chunk; });
      response.on("end", () => resolve({ statusCode: response.statusCode ?? 0, body: responseBody }));
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error(`请求超时：${url}`)));
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

/**
 * 官方 GitHub GraphQL：需要只读 token，数据最权威。
 */
async function fetchGraphQLContributions(username: string, token: string): Promise<GitHubContributionData> {
  const to = new Date();
  const from = new Date(to.valueOf() - 365 * DAY_MS);
  const query = `query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount contributionLevel } }
        }
      }
    }
  }`;
  const response = await requestHttps(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { login: username, from: from.toISOString(), to: to.toISOString() },
    }),
  });
  if (response.statusCode !== 200) {
    throw new Error(`GitHub GraphQL returned ${response.statusCode || "unknown"}`);
  }

  const payload = JSON.parse(response.body) as {
    errors?: Array<{ message?: string }>;
    data?: { user?: { contributionsCollection?: { contributionCalendar?: {
      totalContributions: number;
      weeks: Array<{ contributionDays: Array<{
        date: string; contributionCount: number; contributionLevel: string;
      }> }>;
    } } } | null };
  };

  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error("GitHub GraphQL returned no contribution calendar");

  const levels: Record<string, number> = {
    NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4,
  };
  const contributions = calendar.weeks.flatMap((week) => week.contributionDays.map((day) => ({
    date: day.date,
    count: day.contributionCount,
    level: levels[day.contributionLevel] ?? 0,
  })));
  if (!contributions.length) throw new Error("GitHub GraphQL returned no contributions");
  return { contributions, totalCount: calendar.totalContributions };
}

const publicApiCache = new Map<string, Promise<GitHubContributionData>>();

/**
 * 免 token 的公开统计接口：只读取公开贡献数据，适合不配置 token 的个人博客。
 */
export function fetchPublicContributions(username: string): Promise<GitHubContributionData> {
  const cached = publicApiCache.get(username);
  if (cached) return cached;

  const request = (async () => {
    const response = await requestHttps(`${PUBLIC_API_BASE}/${encodeURIComponent(username)}?y=last`);
    if (response.statusCode !== 200) {
      throw new Error(`公开贡献接口返回 ${response.statusCode || "unknown"}`);
    }
    const payload = JSON.parse(response.body) as {
      total?: { lastYear?: number };
      contributions?: Array<{ date?: string; count?: number; level?: number }>;
    };
    const contributions = (payload.contributions ?? []).flatMap((day) => {
      if (typeof day.date !== "string") return [];
      return [{
        date: day.date,
        count: Number(day.count ?? 0),
        level: Math.min(4, Math.max(0, Number(day.level ?? 0))),
      }];
    });
    if (!contributions.length) throw new Error("公开贡献接口没有返回数据");
    const totalCount = typeof payload.total?.lastYear === "number"
      ? payload.total.lastYear
      : contributions.reduce((sum, day) => sum + day.count, 0);
    return { contributions, totalCount };
  })();

  publicApiCache.set(username, request);
  request.catch(() => publicApiCache.delete(username));
  return request;
}

/**
 * 优先使用官方 GraphQL（token），否则回退到免 token 的公开统计接口。
 */
export async function fetchGitHubContributions(username: string, token?: string): Promise<GitHubContributionData> {
  return token ? fetchGraphQLContributions(username, token) : fetchPublicContributions(username);
}
