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
	const pulled = url.searchParams.get('pulled') ?? '';
	const plan = url.searchParams.get('plan') ?? '';
	const status = url.searchParams.get('status') ?? '';
	const phone = url.searchParams.get('phone') ?? '';

	const filters: Record<string, string> = { from, to };
	if (pulled) filters.pulled = pulled;
	if (plan) filters.plan = plan;
	if (status) filters.status = status;
	if (phone) filters.phone = phone;

	try {
		const res = await adminApi.getPullActivity(page, filters);
		return {
			users: res.data,
			total: res.total,
			perPage: res.perPage,
			totalPages: res.totalPages,
			page: res.page,
			period: res.period,
			filters: { from, to, pulled, plan, status, phone },
			error: null,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[admin/activite] API error:', msg);
		return {
			users: [],
			total: 0,
			perPage: 20,
			totalPages: 1,
			page,
			period: { from, to },
			filters: { from, to, pulled, plan, status, phone },
			error: msg,
		};
	}
};
