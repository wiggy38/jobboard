import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';
import type { ScraperStatus } from '$lib/types.js';

const MOCK_SCRAPERS: ScraperStatus[] = [
	{ id: 'lefaso', name: 'Lefaso.net', type: 'HTML', country: 'BF', lastCrawl: new Date(Date.now() - 3_600_000).toISOString(), newOffers: 12, consecutiveErrors: 0, status: 'ok' },
	{ id: 'anpe-bf', name: 'ANPE BF', type: 'HTML', country: 'BF', lastCrawl: new Date(Date.now() - 7_200_000).toISOString(), newOffers: 5, consecutiveErrors: 0, status: 'ok' },
	{ id: 'reliefweb', name: 'ReliefWeb', type: 'RSS', country: 'BF', lastCrawl: new Date(Date.now() - 86_400_000).toISOString(), newOffers: 0, consecutiveErrors: 2, status: 'warn' },
	{ id: 'emploiburkina', name: 'EmploiBurkina', type: 'HTML', country: 'BF', lastCrawl: new Date(Date.now() - 172_800_000).toISOString(), newOffers: 0, consecutiveErrors: 5, status: 'error', errorMessage: 'Timeout 30s' },
	{ id: 'bfemploi', name: 'BFemploi', type: 'HTML', country: 'BF', lastCrawl: new Date(Date.now() - 5_400_000).toISOString(), newOffers: 8, consecutiveErrors: 0, status: 'ok' },
	{ id: 'sidwaya', name: 'Sidwaya', type: 'HTML', country: 'BF', lastCrawl: new Date(Date.now() - 10_800_000).toISOString(), newOffers: 2, consecutiveErrors: 1, status: 'warn', errorMessage: 'Rate limit 429' },
	{ id: 'faso7', name: 'Faso7', type: 'HTML', country: 'BF', lastCrawl: new Date(Date.now() - 21_600_000).toISOString(), newOffers: 0, consecutiveErrors: 0, status: 'ok' },
	{ id: 'jobbenin', name: 'JobBenin', type: 'HTML', country: 'BJ', lastCrawl: new Date(Date.now() - 43_200_000).toISOString(), newOffers: 1, consecutiveErrors: 0, status: 'ok' },
	{ id: 'anpe-bj', name: 'ANPE BJ', type: 'HTML', country: 'BJ', lastCrawl: new Date(Date.now() - 3_600_000).toISOString(), newOffers: 4, consecutiveErrors: 0, status: 'ok' },
	{ id: 'talentsplusafrique', name: 'TalentsPlusAfrique', type: 'HTML', country: 'MULTI', lastCrawl: new Date(Date.now() - 3_600_000).toISOString(), newOffers: 6, consecutiveErrors: 0, status: 'ok' },
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
