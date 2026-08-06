import type { PageLoad } from './$types.js';
import { error, redirect } from '@sveltejs/kit';
import { adminApi } from '$lib/api.js';
import { isAdminAuthenticated } from '$lib/auth.js';

export const ssr = false;

export const load: PageLoad = async () => {
	try {
		const settings = await adminApi.getSettings();
		return { settings };
	} catch (e) {
		// Session expirée (cookie présent mais JWT invalide/expiré côté serveur)
		// ou rôle insuffisant (accès direct par URL sans passer par le lien de
		// nav, réservé SUPER_ADMIN) — évite le crash générique SvelteKit et
		// redirige/affiche un message clair plutôt qu'un 500 opaque.
		const message = e instanceof Error ? e.message : 'Erreur inconnue';
		if (message.includes('401') || message.includes('Unauthorized')) {
			if (!isAdminAuthenticated()) throw redirect(302, '/login');
			throw error(401, 'Session expirée — reconnecte-toi.');
		}
		if (message.includes('403') || message.includes('Forbidden')) {
			throw error(403, 'Accès réservé aux comptes SUPER_ADMIN.');
		}
		throw error(500, message);
	}
};
