import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';

export const ssr = false;

export const load: PageLoad = async ({ url }) => {
	// Access url.search to register a dependency on the full query string,
	// ensuring the load re-runs whenever any search param changes.
	void url.search;

	const page = Number(url.searchParams.get('page') ?? '1');

	const plan = url.searchParams.get('plan') ?? '';
	const status = url.searchParams.get('status') ?? '';
	const country = url.searchParams.get('country') ?? '';
	const phone = url.searchParams.get('phone') ?? '';
	const channelJoined = url.searchParams.get('channelJoined') ?? '';

	const filters: Record<string, string> = {};
	if (plan) filters.plan = plan;
	if (status) filters.status = status;
	if (country) filters.country = country;
	if (phone) filters.phone = phone;
	if (channelJoined) filters.channelJoined = channelJoined;

	try {
		const res = await adminApi.getUsers(page, filters);
		const perPage = 20;
		const totalPages = Math.max(1, Math.ceil(res.total / perPage));
		return { users: res.data, total: res.total, perPage, totalPages, page, filters, error: null };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[admin/abonnes] API error:', msg);
		return { users: [], total: 0, perPage: 20, totalPages: 1, page, filters, error: msg };
	}
};
