// @ts-nocheck
import type { PageLoad } from './$types.js';
import { adminApi } from '$lib/api.js';
import type { JobOffer, ScraperStatus } from '$lib/types.js';

const MOCK_OFFERS: JobOffer[] = [
	{ id: '1', title: 'Développeur Full-Stack', organization: 'Société Burkina Tech', city: 'Ouagadougou', sector: 'Informatique', level: 'Confirmé', contractType: 'CDI', deadline: null, isSponsored: false, scoreConfidence: 0.92, status: 'ACTIVE' },
	{ id: '2', title: 'Chargé de Communication', organization: 'ONG Espoir Sahel', city: 'Bobo-Dioulasso', sector: 'Communication', level: 'Junior', contractType: 'CDD', deadline: '2026-07-15', isSponsored: true, scoreConfidence: 0.78, status: 'ACTIVE' },
	{ id: '3', title: 'Comptable Senior', organization: 'Cabinet Audit BF', city: 'Ouagadougou', sector: 'Finance', level: 'Senior', contractType: 'CDI', deadline: null, isSponsored: false, scoreConfidence: 0.85, status: 'ACTIVE' },
	{ id: '4', title: 'Ingénieur Génie Civil', organization: 'BTP Sahara', city: 'Koudougou', sector: 'BTP', level: 'Confirmé', contractType: 'CDI', deadline: '2026-06-30', isSponsored: false, scoreConfidence: 0.70, status: 'EXPIRED' },
	{ id: '5', title: 'Assistant Administratif', organization: 'Ministère de la Santé', city: 'Ouagadougou', sector: 'Administration', level: 'Junior', contractType: 'STAGE', deadline: null, isSponsored: false, scoreConfidence: 0.88, status: 'ACTIVE' },
];

const MOCK_SCRAPERS: ScraperStatus[] = [
	{ id: 'lefaso', name: 'Lefaso.net', type: 'HTML', lastCrawl: null, newOffers: 0, consecutiveErrors: 0, status: 'ok' },
	{ id: 'anpe', name: 'ANPE Burkina', type: 'HTML', lastCrawl: null, newOffers: 0, consecutiveErrors: 0, status: 'ok' },
];

export const ssr = false;

export const load = async ({ url }: Parameters<PageLoad>[0]) => {
	// Access url.search to register a dependency on the full query string,
	// ensuring the load re-runs whenever any search param changes.
	void url.search;

	const page = Number(url.searchParams.get('page') ?? '1');

	const source = url.searchParams.get('source') ?? '';
	const date = url.searchParams.get('date') ?? '';
	const status = url.searchParams.get('status') ?? '';
	const sector = url.searchParams.get('sector') ?? '';
	const score = url.searchParams.get('score') ?? '';
	const title = url.searchParams.get('title') ?? '';

	const filters: Record<string, string> = {};
	if (source) filters.source = source;
	if (date) filters.date = date;
	if (status) filters.status = status;
	if (sector) filters.sector = sector;
	if (score) filters.score = score;
	if (title) filters.title = title;

	const [offersRes, scrapersRes] = await Promise.allSettled([
		adminApi.getOffers(page, filters),
		adminApi.getScrapers(),
	]);

	const scrapers = scrapersRes.status === 'fulfilled' ? scrapersRes.value : MOCK_SCRAPERS;

	if (offersRes.status === 'fulfilled') {
		const raw = offersRes.value as unknown;
		// Backward compat: API used to return bare JobOffer[] before pagination was added
		const offers = Array.isArray(raw) ? raw : (raw as { offers: JobOffer[] }).offers ?? [];
		const total = Array.isArray(raw) ? raw.length : (raw as { total: number }).total ?? offers.length;
		const perPage = Array.isArray(raw) ? 20 : (raw as { perPage: number }).perPage ?? 20;
		const totalPages = Array.isArray(raw) ? 1 : (raw as { totalPages: number }).totalPages ?? 1;
		return { offers, total, perPage, totalPages, scrapers, page, filters, error: null };
	}

	const msg = offersRes.reason instanceof Error ? offersRes.reason.message : String(offersRes.reason);
	console.error('[admin/offres] API error:', msg);
	if (!import.meta.env.DEV) throw new Error('API unavailable');

	const filtered = MOCK_OFFERS.filter((o) => {
		if (filters.status && o.status !== filters.status) return false;
		if (filters.sector && !o.sector.toLowerCase().includes(filters.sector.toLowerCase())) return false;
		if (filters.score && o.scoreConfidence * 100 < Number(filters.score)) return false;
		if (filters.date && o.createdAt && o.createdAt < filters.date) return false;
		if (filters.title && !o.title.toLowerCase().includes(filters.title.toLowerCase())) return false;
		return true;
	});
	return { offers: filtered, total: filtered.length, perPage: 20, totalPages: 1, scrapers, page, filters, error: msg };
};
