export type ContributionDay = {
	date: string;
	count: number;
	level: number;
};

export type RecentContributions = {
	recentDays: ContributionDay[];
	recentTotalCount: number;
};

/**
 * 取最近约 6 个月（默认 182 天）的贡献数据，用于移动端展示。
 * 以数据中的最后一天为基准，而不是服务器当前时间，避免时区/缓存造成空洞。
 */
export function splitRecentContributions(
	contributions: ContributionDay[],
	daysBack = 182,
): RecentContributions {
	const sorted = [...contributions].sort((a, b) => a.date.localeCompare(b.date));
	const last = sorted.at(-1);
	if (!last) return { recentDays: [], recentTotalCount: 0 };

	const cutoff = new Date(`${last.date}T00:00:00Z`);
	cutoff.setUTCDate(cutoff.getUTCDate() - daysBack + 1);
	const cutoffKey = cutoff.toISOString().slice(0, 10);

	const recentDays = sorted.filter((day) => day.date >= cutoffKey);
	const recentTotalCount = recentDays.reduce((sum, day) => sum + day.count, 0);
	return { recentDays, recentTotalCount };
}
