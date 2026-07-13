import type { PageLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { adminApi } from '$lib/api.js';
import type { AdminScoutDetail } from '$lib/types.js';

const MOCK_SCOUT: AdminScoutDetail = {
	id: '1',
	name: 'Moussa Traoré',
	phone: '+22670000001',
	zone: 'Ouagadougou Centre',
	isActive: true,
	totalCaptures: 47,
	totalEarned: 23500,
	createdAt: new Date(Date.now() - 60 * 24 * 3600_000).toISOString(),
	updatedAt: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
	submissions: [
		{ id: 's1', title: 'Comptable senior', organization: 'BCI Bank', city: 'Ouagadougou', createdAt: new Date(Date.now() - 3 * 24 * 3600_000).toISOString(), status: 'ACTIVE' },
		{ id: 's2', title: 'Chauffeur livreur', organization: 'Faso Express', city: 'Ouagadougou', createdAt: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(), status: 'ACTIVE' },
		{ id: 's3', title: 'Agent de sécurité', organization: 'Vigil Pro', city: 'Koupèla', createdAt: new Date(Date.now() - 14 * 24 * 3600_000).toISOString(), status: 'EXPIRED' },
	],
	payments: [
		{ id: 'p1', month: '2026-06', amount: 11500, paidAt: new Date(Date.now() - 5 * 24 * 3600_000).toISOString() },
		{ id: 'p2', month: '2026-05', amount: 12000, paidAt: new Date(Date.now() - 35 * 24 * 3600_000).toISOString() },
	],
};

export const ssr = false;

export const load: PageLoad = async ({ params }) => {
	try {
		const scout = await adminApi.getScout(params.id);
		return { scout };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (import.meta.env.DEV) return { scout: MOCK_SCOUT };
		if (msg.includes('404')) throw error(404, 'Scout introuvable');
		throw error(500, 'Erreur serveur');
	}
};
