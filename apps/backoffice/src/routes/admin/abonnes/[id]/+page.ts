import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';

export const ssr = false;

export const load: PageLoad = async ({ params }) => {
	const [user, pullHistory] = await Promise.all([
		adminApi.getUser(params.id),
		adminApi.getUserPullHistory(params.id, 1),
	]);
	return { user, pullHistory };
};
