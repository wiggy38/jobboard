import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';

export const load: PageLoad = async ({ params, url }) => {
	const page = Number(url.searchParams.get('page') ?? '1');
	const referrals = await adminApi.getUserReferrals(params.id, page);
	return { referrals };
};
