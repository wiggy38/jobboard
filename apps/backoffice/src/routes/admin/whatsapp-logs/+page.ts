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
	const phoneNumber = url.searchParams.get('phoneNumber') ?? '';

	const filters: Record<string, string> = { from, to };
	if (phoneNumber) filters.phoneNumber = phoneNumber;

	try {
		const res = await adminApi.getUnknownCommands(page, filters);
		return {
			entries: res.data,
			total: res.total,
			perPage: res.perPage,
			totalPages: res.totalPages,
			page: res.page,
			period: res.period,
			filters: { from, to, phoneNumber },
			error: null,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[admin/whatsapp-logs] API error:', msg);
		return {
			entries: [],
			total: 0,
			perPage: 20,
			totalPages: 1,
			page,
			period: { from, to },
			filters: { from, to, phoneNumber },
			error: msg,
		};
	}
};
