import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';
import type { ScraperStatus } from '$lib/types.js';

const MOCK_SCRAPERS: ScraperStatus[] = [
	{ id: 'lefaso', name: 'Lefaso.net', type: 'HTML', lastCrawl: new Date(Date.now() - 3_600_000).toISOString(), newOffers: 12, consecutiveErrors: 0, status: 'ok' },
	{ id: 'anpe', name: 'ANPE BF', type: 'HTML', lastCrawl: new Date(Date.now() - 7_200_000).toISOString(), newOffers: 5, consecutiveErrors: 0, status: 'ok' },
	{ id: 'fasonet', name: 'Fasonet Jobs', type: 'RSS', lastCrawl: new Date(Date.now() - 86_400_000).toISOString(), newOffers: 0, consecutiveErrors: 2, status: 'warn' },
	{ id: 'emploibf', name: 'EmploiBF', type: 'API', lastCrawl: new Date(Date.now() - 172_800_000).toISOString(), newOffers: 0, consecutiveErrors: 5, status: 'error', errorMessage: 'Timeout 30s' },
	{ id: 'ouestaf', name: 'Ouestaf Jobs', type: 'HTML', lastCrawl: new Date(Date.now() - 1_800_000).toISOString(), newOffers: 3, consecutiveErrors: 0, status: 'ok' },
	{ id: 'bfemploi', name: 'BFemploi', type: 'HTML', lastCrawl: new Date(Date.now() - 5_400_000).toISOString(), newOffers: 8, consecutiveErrors: 0, status: 'ok' },
	{ id: 'rekrute', name: 'Rekrute BF', type: 'API', lastCrawl: new Date(Date.now() - 10_800_000).toISOString(), newOffers: 2, consecutiveErrors: 1, status: 'warn', errorMessage: 'Rate limit 429' },
	{ id: 'onef', name: 'ONEF BF', type: 'HTML', lastCrawl: new Date(Date.now() - 21_600_000).toISOString(), newOffers: 0, consecutiveErrors: 0, status: 'ok' },
	{ id: 'emploi226', name: 'Emploi226', type: 'RSS', lastCrawl: new Date(Date.now() - 43_200_000).toISOString(), newOffers: 1, consecutiveErrors: 0, status: 'ok' },
];

export const ssr = false;

export const load: PageLoad = async () => {
	try {
		const scrapers = await adminApi.getScrapers();
		return { scrapers };
	} catch {
		if (!import.meta.env.DEV) throw new Error('API unavailable');
		return { scrapers: MOCK_SCRAPERS };
	}
};
