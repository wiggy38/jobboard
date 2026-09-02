import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';
import { SETTING_KEYS, SECTOR_OPTIONS, type ProfileOption } from '@tumaa/shared';

export const ssr = false;

export const load: PageLoad = async ({ params }) => {
	try {
		const [offer, settingsRes] = await Promise.all([
			adminApi.getOffer(params.id),
			// Secteurs édités en backoffice (/admin/parametres) — repli sur la
			// liste statique si l'API est indisponible, pour ne pas bloquer la page.
			adminApi.getSettings().catch(() => null),
		]);
		const sectors: ProfileOption[] = settingsRes ? settingsRes[SETTING_KEYS.REFERENCE_SECTORS] : SECTOR_OPTIONS;
		return { offer, sectors };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.includes('404')) throw error(404, 'Offre introuvable');
		throw error(500, 'Erreur serveur');
	}
};
