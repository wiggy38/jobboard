import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';

function todayStr(d: Date = new Date()): string {
	return d.toISOString().split('T')[0];
}

export const load: PageLoad = async ({ params, url }) => {
	// Enregistre une dépendance sur la query string complète pour que le load
	// se relance à chaque changement de filtre (from/to/page).
	void url.search;

	const page = Number(url.searchParams.get('page') ?? '1');

	const defaultTo = todayStr();
	const defaultFromDate = new Date();
	defaultFromDate.setDate(defaultFromDate.getDate() - 30);
	const defaultFrom = todayStr(defaultFromDate);

	const from = url.searchParams.get('from') ?? defaultFrom;
	const to = url.searchParams.get('to') ?? defaultTo;

	const pullHistory = await adminApi.getUserPullHistory(params.id, page, { from, to });
	return { pullHistory, filters: { from, to } };
};
