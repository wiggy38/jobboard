import type { LayoutLoad } from './$types.js';
import { adminApi } from '$lib/api.js';

export const ssr = false;

export const load: LayoutLoad = async ({ params }) => {
	const user = await adminApi.getUser(params.id);
	return { user };
};
