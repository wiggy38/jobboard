import { browser } from '$app/environment';
import type { SettingKey, SettingValueMap } from '@tumaa/shared';
import type { AdminAccount, AdminAccountRole, AdminJobOfferDetail, AdminKpis, AdminScoutDetail, AdminStats, AdminUserDetail, Employer, EmployerOffer, EmployerStats, HealthCheckResult, JobOffer, JobPollResult, PaginatedOffers, PaginatedOfferInteractions, PaginatedPullActivity, PaginatedPullHistory, PaginatedReferrals, PaginatedTracking, PaginatedUsers, Scout, ScraperRunHistory, ScraperStatus, SyncAllResult, TemplateLog, TemplateUsage } from './types.js';

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
	getStats: (country?: string) =>
		apiFetch<AdminStats>(`/admin/stats${country ? `?country=${encodeURIComponent(country)}` : ''}`),
	getKpis: (params: { from?: string; to?: string; country?: string } = {}) => {
		const query = new URLSearchParams();
		if (params.from) query.set('from', params.from);
		if (params.to) query.set('to', params.to);
		if (params.country) query.set('country', params.country);
		const qs = query.toString();
		return apiFetch<AdminKpis>(`/admin/kpis${qs ? `?${qs}` : ''}`);
	},
	getScrapers: (country?: string) =>
		apiFetch<ScraperStatus[]>(`/admin/scrapers${country ? `?country=${encodeURIComponent(country)}` : ''}`),
	getTemplateUsage: (country?: string) =>
		apiFetch<TemplateUsage[]>(`/admin/templates/usage${country ? `?country=${encodeURIComponent(country)}` : ''}`),
	getTemplateLogs: () => apiFetch<TemplateLog[]>('/admin/templates/logs'),
	getOffers: (page = 1, filters: Record<string, string> = {}) => {
		const params = new URLSearchParams({ page: String(page), ...filters });
		return apiFetch<PaginatedOffers>(`/admin/offers?${params}`);
	},
	getOffer: (id: string) => apiFetch<AdminJobOfferDetail>(`/admin/offers/${id}`),
	getOfferInteractions: (id: string, page = 1, perPage = 20) =>
		apiFetch<PaginatedOfferInteractions>(`/admin/offers/${id}/interactions?page=${page}&perPage=${perPage}`),
	updateOfferStatus: (id: string, status: string) =>
		apiFetch<{ ok: boolean }>(`/admin/offers/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
	updateOffer: (id: string, data: Partial<AdminJobOfferDetail & { deadline: string | null }>) =>
		apiFetch<{ ok: boolean; id: string }>(`/admin/offers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
	createOffer: (data: {
		title: string; organization: string; city?: string; sector?: string; level?: string;
		contractType?: string; country?: string; description?: string; requirements?: string;
		contactEmail?: string; contactPhone?: string; contactAddress?: string;
		applicationUrl?: string; sourceUrl?: string; isSponsored?: boolean; isFeatured?: boolean;
		status?: string; deadline?: string | null;
	}) => apiFetch<{ ok: boolean; id: string }>('/admin/offers', { method: 'POST', body: JSON.stringify(data) }),
	runScraper: (id: string) => apiFetch<{ jobId: string }>(`/admin/scrapers/${id}/run`, { method: 'POST' }),
	pollJob: (jobId: string) => apiFetch<JobPollResult>(`/admin/jobs/${encodeURIComponent(jobId)}`),
	disableScraper: (id: string) => apiFetch<void>(`/admin/scrapers/${id}/disable`, { method: 'POST' }),
	getScraperRuns: (id: string, limit = 50) => apiFetch<ScraperRunHistory>(`/admin/scrapers/${id}/runs?limit=${limit}`),
	syncAll: () => apiFetch<SyncAllResult>('/admin/scrapers/sync', { method: 'POST' }),
	healthCheck: () => apiFetch<HealthCheckResult>('/admin/scrapers/health', { method: 'POST' }),
	getScouts: () => apiFetch<{ data: Scout[]; total: number }>('/admin/scouts').then(r => r.data),
	getScout: (id: string) => apiFetch<AdminScoutDetail>(`/admin/scouts/${id}`),
	createScout: (data: { name: string; phone: string; zone: string }) =>
		apiFetch<Scout>('/admin/scouts', { method: 'POST', body: JSON.stringify(data) }),
	updateScout: (id: string, data: { isActive?: boolean; zone?: string }) =>
		apiFetch<{ ok: boolean }>(`/admin/scouts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
	getUsers: (page = 1, filters: Record<string, string> = {}) => {
		const params = new URLSearchParams({ page: String(page), ...filters });
		return apiFetch<PaginatedUsers>(`/admin/users?${params}`);
	},
	getUser: (id: string) => apiFetch<AdminUserDetail>(`/admin/users/${id}`),
	getPullActivity: (page = 1, filters: Record<string, string> = {}) => {
		const params = new URLSearchParams({ page: String(page), ...filters });
		return apiFetch<PaginatedPullActivity>(`/admin/users/pull-activity?${params}`);
	},
	getUserPullHistory: (id: string, page = 1, filters: Record<string, string> = {}) => {
		const params = new URLSearchParams({ page: String(page), ...filters });
		return apiFetch<PaginatedPullHistory>(`/admin/users/${id}/pull-history?${params}`);
	},
	getUserReferrals: (id: string, page = 1) =>
		apiFetch<PaginatedReferrals>(`/admin/users/${id}/referrals?page=${page}`),
	extendSubscription: (id: string, days: number) =>
		apiFetch<{ ok: boolean; planEndAt: string }>(`/admin/users/${id}/extend`, { method: 'PATCH', body: JSON.stringify({ days }) }),
	getTracking: (page = 1, filters: Record<string, string> = {}) => {
		const params = new URLSearchParams({ page: String(page), ...filters });
		return apiFetch<PaginatedTracking>(`/admin/tracking?${params}`);
	},
	getMe: () => apiFetch<{ id: string; email: string; name: string; role: AdminAccountRole }>('/admin/auth/me'),
	listAdminAccounts: () => apiFetch<AdminAccount[]>('/admin/admin-users'),
	createAdminAccount: (data: { email: string; name: string; password: string; role: AdminAccountRole }) =>
		apiFetch<AdminAccount>('/admin/admin-users', { method: 'POST', body: JSON.stringify(data) }),
	updateAdminAccount: (id: string, data: { name?: string; role?: AdminAccountRole; active?: boolean; password?: string }) =>
		apiFetch<AdminAccount>(`/admin/admin-users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
	getSettings: () => apiFetch<SettingValueMap>('/admin/settings'),
	updateSetting: <K extends SettingKey>(key: K, value: SettingValueMap[K]) =>
		apiFetch<{ ok: boolean; warning?: string }>(`/admin/settings/${encodeURIComponent(key)}`, {
			method: 'PATCH',
			body: JSON.stringify({ value }),
		}),
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
