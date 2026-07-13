// @ts-nocheck
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';

export const ssr = false;

export const load = async ({ params }: Parameters<PageLoad>[0]) => {
	try {
		const offer = await adminApi.getOffer(params.id);
		return { offer };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.includes('404')) throw error(404, 'Offre introuvable');
		throw error(500, 'Erreur serveur');
	}
};
