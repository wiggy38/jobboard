import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';

export const ssr = false;

export const load: PageLoad = async ({ params }) => {
	try {
		const history = await adminApi.getScraperRuns(params.id);
		return { history };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.includes('404')) throw error(404, 'Scraper introuvable');
		throw error(500, 'Erreur serveur');
	}
};
