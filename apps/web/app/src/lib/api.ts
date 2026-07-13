import { browser } from '$app/environment';
import type { AdminJobOfferDetail, AdminScoutDetail, AdminStats, Employer, EmployerOffer, EmployerStats, HealthCheckResult, JobOffer, JobPollResult, PaginatedOffers, Scout, ScraperStatus, SyncAllResult, TemplateLog, TemplateUsage, TokenizedOffer } from './types.js';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function getAdminToken(): string | undefined {
	if (!browser) return undefined;
	const match = document.cookie.match(/(?:^|; )tumaa_admin_session=([^;]*)/);
	return match ? decodeURIComponent(match[1]) : undefined;
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
	const hasBody = options?.body != null;
	const adminToken = getAdminToken();
	const res = await fetch(`${API_BASE}${path}`, {
		...options,
		headers: {
			...(hasBody ? { 'Content-Type': 'application/json' } : {}),
			...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}),
			...options?.headers,
		},
		credentials: 'include',
	});
	if (!res.ok) {
		let detail = '';
		try { const body = await res.clone().json(); detail = body.error ?? body.message ?? ''; } catch { /* ignore */ }
		throw new Error(detail || `API ${res.status}: ${path}`);
	}
	return res.json() as Promise<T>;
}

export const adminApi = {
	getStats: () => apiFetch<AdminStats>('/admin/stats'),
	getScrapers: () => apiFetch<ScraperStatus[]>('/admin/scrapers'),
	getTemplateUsage: () => apiFetch<TemplateUsage[]>('/admin/templates/usage'),
	getTemplateLogs: () => apiFetch<TemplateLog[]>('/admin/templates/logs'),
	getOffers: (page = 1, filters: Record<string, string> = {}) => {
		const params = new URLSearchParams({ page: String(page), ...filters });
		return apiFetch<PaginatedOffers>(`/admin/offers?${params}`);
	},
	getOffer: (id: string) => apiFetch<AdminJobOfferDetail>(`/admin/offers/${id}`),
	updateOfferStatus: (id: string, status: string) =>
		apiFetch<{ ok: boolean }>(`/admin/offers/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
	updateOffer: (id: string, data: Partial<AdminJobOfferDetail & { deadline: string | null }>) =>
		apiFetch<{ ok: boolean; id: string }>(`/admin/offers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
	createOffer: (data: {
		title: string; organization: string; city?: string; sector?: string; level?: string;
		contractType?: string; country?: string; description?: string; requirements?: string;
		contactEmail?: string; contactPhone?: string; contactAddress?: string;
		applicationUrl?: string; sourceUrl?: string; isSponsored?: boolean;
		status?: string; deadline?: string | null;
	}) => apiFetch<{ ok: boolean; id: string }>('/admin/offers', { method: 'POST', body: JSON.stringify(data) }),
	runScraper: (id: string) => apiFetch<{ jobId: string }>(`/admin/scrapers/${id}/run`, { method: 'POST' }),
	pollJob: (jobId: string) => apiFetch<JobPollResult>(`/admin/jobs/${encodeURIComponent(jobId)}`),
	disableScraper: (id: string) => apiFetch<void>(`/admin/scrapers/${id}/disable`, { method: 'POST' }),
	syncAll: () => apiFetch<SyncAllResult>('/admin/scrapers/sync', { method: 'POST' }),
	healthCheck: () => apiFetch<HealthCheckResult>('/admin/scrapers/health', { method: 'POST' }),
	getScouts: () => apiFetch<{ data: Scout[]; total: number }>('/admin/scouts').then(r => r.data),
	getScout: (id: string) => apiFetch<AdminScoutDetail>(`/admin/scouts/${id}`),
	createScout: (data: { name: string; phone: string; zone: string }) =>
		apiFetch<Scout>('/admin/scouts', { method: 'POST', body: JSON.stringify(data) }),
	updateScout: (id: string, data: { isActive?: boolean; zone?: string }) =>
		apiFetch<{ ok: boolean }>(`/admin/scouts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

export const employerApi = {
	getStats: () => apiFetch<EmployerStats>('/employer/stats'),
	getMe: () => apiFetch<Employer>('/employer/me'),
	getMyOffers: () => apiFetch<EmployerOffer[]>('/employer/offers'),
	publishOffer: (data: Partial<JobOffer> & { contactEmail?: string; contactPhone?: string; requirements?: string; isSponsored?: boolean }) =>
		apiFetch<{ id: string; paymentUrl?: string }>('/employer/offers', {
			method: 'POST',
			body: JSON.stringify(data),
		}),
	getEstimate: (city: string, sector: string, level: string) =>
		apiFetch<{ count: number }>(`/employer/estimate?city=${encodeURIComponent(city)}&sector=${encodeURIComponent(sector)}&level=${encodeURIComponent(level)}`),
	renewOffer: (id: string) => apiFetch<void>(`/employer/offers/${id}/renew`, { method: 'POST' }),
	sponsorOffer: (id: string) => apiFetch<void>(`/employer/offers/${id}/sponsor`, { method: 'POST' }),
	archiveOffer: (id: string) => apiFetch<void>(`/employer/offers/${id}/archive`, { method: 'POST' }),
};

export const publicApi = {
	getOfferByToken: (token: string) =>
		apiFetch<TokenizedOffer>(`/offers/token/${token}`),
};
