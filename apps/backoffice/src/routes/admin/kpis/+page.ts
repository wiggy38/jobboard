import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';

export const ssr = false;

function todayStr(d: Date = new Date()): string {
	return d.toISOString().split('T')[0];
}

export const load: PageLoad = async ({ url }) => {
	// Access url.search to register a dependency on the full query string,
	// ensuring the load re-runs whenever any search param changes.
	void url.search;

	const defaultTo = todayStr();
	const defaultFromDate = new Date();
	defaultFromDate.setDate(defaultFromDate.getDate() - 30);
	const defaultFrom = todayStr(defaultFromDate);

	const from = url.searchParams.get('from') ?? defaultFrom;
	const to = url.searchParams.get('to') ?? defaultTo;
	const country = url.searchParams.get('country') ?? '';

	const emptySeries = { signups: [], profileCompleted: [], offersViewed: [], lockedClicks: [], premiumConversions: [], shares: [] };
	const emptyTotals = { signups: 0, profileCompleted: 0, offersViewed: 0, lockedClicks: 0, premiumConversions: 0, shares: 0 };

	try {
		const res = await adminApi.getKpis({ from, to, country: country || undefined });
		return {
			period: res.period,
			series: res.series,
			totals: res.totals,
			filters: { from, to, country },
			error: null,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[admin/kpis] API error:', msg);
		return {
			period: { from, to },
			series: emptySeries,
			totals: emptyTotals,
			filters: { from, to, country },
			error: msg,
		};
	}
};
