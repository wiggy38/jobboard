import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';
import type { JobOffer, ScraperStatus } from '$lib/types.js';

const SUPPORTED_COUNTRIES = ['BF', 'BJ', 'TG', 'CI'];

const MOCK_SCRAPERS: ScraperStatus[] = [
	{ id: 'lefaso', name: 'Lefaso.net', type: 'HTML', country: 'BF', lastCrawl: null, newOffers: 0, consecutiveErrors: 0, status: 'ok' },
	{ id: 'anpe-bf', name: 'ANPE Burkina', type: 'HTML', country: 'BF', lastCrawl: null, newOffers: 0, consecutiveErrors: 0, status: 'ok' },
];

export const ssr = false;

export const load: PageLoad = async ({ params, url }) => {
	void url.search;

	const country = params.country.toUpperCase();
	if (!SUPPORTED_COUNTRIES.includes(country)) throw error(404, 'Pays inconnu');

	const page = Number(url.searchParams.get('page') ?? '1');

	const source = url.searchParams.get('source') ?? '';
	const date = url.searchParams.get('date') ?? '';
	const status = url.searchParams.get('status') ?? '';
	const sector = url.searchParams.get('sector') ?? '';
	const score = url.searchParams.get('score') ?? '';
	const title = url.searchParams.get('title') ?? '';
	const city = url.searchParams.get('city') ?? '';

	const filters: Record<string, string> = { country };
	if (source) filters.source = source;
	if (date) filters.date = date;
	if (status) filters.status = status;
	if (sector) filters.sector = sector;
	if (score) filters.score = score;
	if (title) filters.title = title;
	if (city) filters.city = city;

	const [offersRes, scrapersRes] = await Promise.allSettled([
		adminApi.getOffers(page, filters),
		adminApi.getScrapers(),
	]);

	const scrapers = scrapersRes.status === 'fulfilled' ? scrapersRes.value : MOCK_SCRAPERS;

	if (offersRes.status === 'fulfilled') {
		const raw = offersRes.value as { offers: JobOffer[]; total: number; perPage: number; totalPages: number };
		return {
			offers: raw.offers,
			total: raw.total,
			perPage: raw.perPage,
			totalPages: raw.totalPages,
			scrapers,
			page,
			filters,
			country,
			error: null,
		};
	}

	const msg = offersRes.reason instanceof Error ? offersRes.reason.message : String(offersRes.reason);
	console.error('[admin/offres/pays] API error:', msg);
	if (!import.meta.env.DEV) throw new Error('API unavailable');

	return { offers: [], total: 0, perPage: 20, totalPages: 1, scrapers, page, filters, country, error: msg };
};
