import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';
import { getAdminIdentity } from '$lib/auth.js';

export const ssr = false;

export const load: PageLoad = async () => {
	if (getAdminIdentity()?.role !== 'SUPER_ADMIN') {
		throw redirect(302, '/admin');
	}
	const accounts = await adminApi.listAdminAccounts();
	return { accounts };
};
