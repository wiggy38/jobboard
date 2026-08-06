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

	const page = Number(url.searchParams.get('page') ?? '1');

	const defaultTo = todayStr();
	const defaultFromDate = new Date();
	defaultFromDate.setDate(defaultFromDate.getDate() - 30);
	const defaultFrom = todayStr(defaultFromDate);

	const from = url.searchParams.get('from') ?? defaultFrom;
	const to = url.searchParams.get('to') ?? defaultTo;
	const action = url.searchParams.get('action') ?? '';
	const jobTitle = url.searchParams.get('jobTitle') ?? '';

	const filters: Record<string, string> = { from, to };
	if (action) filters.action = action;
	if (jobTitle) filters.jobTitle = jobTitle;

	try {
		const res = await adminApi.getTracking(page, filters);
		return {
			events: res.data,
			total: res.total,
			perPage: res.perPage,
			totalPages: res.totalPages,
			page: res.page,
			period: res.period,
			summary: res.summary,
			filters: { from, to, action, jobTitle },
			error: null,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[admin/tracking] API error:', msg);
		return {
			events: [],
			total: 0,
			perPage: 20,
			totalPages: 1,
			page,
			period: { from, to },
			summary: { views: 0, clicks: 0, clickRate: 0 },
			filters: { from, to, action, jobTitle },
			error: msg,
		};
	}
};
