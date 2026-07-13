// @ts-nocheck
import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';
import type { Scout } from '$lib/types.js';

const MOCK_SCOUTS: Scout[] = [
	{ id: '1', name: 'Moussa Traoré', phone: '+22670000001', zone: 'Ouagadougou Centre', isActive: true, totalCaptures: 47, totalEarned: 23500, createdAt: new Date(Date.now() - 60 * 24 * 3600_000).toISOString() },
	{ id: '2', name: 'Aminata Ouédraogo', phone: '+22675000002', zone: 'Bobo-Dioulasso', isActive: true, totalCaptures: 31, totalEarned: 15500, createdAt: new Date(Date.now() - 45 * 24 * 3600_000).toISOString() },
	{ id: '3', name: 'Ibrahim Sawadogo', phone: '+22666000003', zone: 'Koudougou', isActive: false, totalCaptures: 12, totalEarned: 6000, createdAt: new Date(Date.now() - 90 * 24 * 3600_000).toISOString() },
	{ id: '4', name: 'Fatoumata Diallo', phone: '+22671000004', zone: 'Ouagadougou Nord', isActive: true, totalCaptures: 58, totalEarned: 29000, createdAt: new Date(Date.now() - 30 * 24 * 3600_000).toISOString() },
	{ id: '5', name: 'Seydou Compaoré', phone: '+22678000005', zone: 'Banfora', isActive: true, totalCaptures: 22, totalEarned: 11000, createdAt: new Date(Date.now() - 15 * 24 * 3600_000).toISOString() },
];

export const ssr = false;

export const load = async () => {
	try {
		const scouts = await adminApi.getScouts();
		return { scouts };
	} catch {
		if (!import.meta.env.DEV) throw new Error('API unavailable');
		return { scouts: MOCK_SCOUTS };
	}
};
;null as any as PageLoad;