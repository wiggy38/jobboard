// @ts-nocheck
import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';
import type { AdminStats, ScraperStatus, TemplateUsage } from '$lib/types.js';

const MOCK_STATS: AdminStats = {
	activeUsers: 1_243,
	tpqToday: 68,
	totalOffers: 1_028,
	pendingOffers: 54,
	activeOffers: 347,
	expiredOffers: 589,
	archivedOffers: 38,
	offersInsertedToday: 23,
	templatesSentThisMonth: 136,
	templateBudgetCap: 500,
	offersDailyHistory: Array.from({ length: 10 }, (_, i) => {
		const d = new Date();
		d.setDate(d.getDate() - (9 - i));
		return { date: d.toISOString().slice(0, 10), count: Math.floor(10 + Math.random() * 40) };
	}),
};

const MOCK_SCRAPERS: ScraperStatus[] = [
	{ id: 'lefaso', name: 'Lefaso.net', type: 'HTML', lastCrawl: new Date(Date.now() - 3_600_000).toISOString(), newOffers: 12, consecutiveErrors: 0, status: 'ok' },
	{ id: 'anpe', name: 'ANPE BF', type: 'HTML', lastCrawl: new Date(Date.now() - 7_200_000).toISOString(), newOffers: 5, consecutiveErrors: 0, status: 'ok' },
	{ id: 'fasonet', name: 'Fasonet Jobs', type: 'RSS', lastCrawl: new Date(Date.now() - 86_400_000).toISOString(), newOffers: 0, consecutiveErrors: 2, status: 'warn' },
	{ id: 'emploibf', name: 'EmploiBF', type: 'API', lastCrawl: new Date(Date.now() - 172_800_000).toISOString(), newOffers: 0, consecutiveErrors: 5, status: 'error', errorMessage: 'Timeout 30s' },
	{ id: 'ouestaf', name: 'Ouestaf Jobs', type: 'HTML', lastCrawl: new Date(Date.now() - 1_800_000).toISOString(), newOffers: 3, consecutiveErrors: 0, status: 'ok' },
];

const MOCK_TEMPLATE_USAGE: TemplateUsage[] = [
	{ type: 'RELANCE', used: 45, cap: 100 },
	{ type: 'MATCH_PARFAIT', used: 68, cap: 100 },
	{ type: 'NUDGE_PREMIUM', used: 23, cap: 100 },
];

export const ssr = false;

export const load = async () => {
	try {
		const [stats, scrapers, templateUsage] = await Promise.all([
			adminApi.getStats(),
			adminApi.getScrapers(),
			adminApi.getTemplateUsage(),
		]);
		return { stats, scrapers, templateUsage };
	} catch {
		if (!import.meta.env.DEV) throw new Error('API unavailable');
		return { stats: MOCK_STATS, scrapers: MOCK_SCRAPERS, templateUsage: MOCK_TEMPLATE_USAGE };
	}
};
;null as any as PageLoad;