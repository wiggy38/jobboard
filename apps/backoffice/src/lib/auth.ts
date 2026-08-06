import { browser } from '$app/environment';
import { goto } from '$app/navigation';

function getCookie(name: string): string | undefined {
	if (!browser) return undefined;
	const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : undefined;
}

function deleteCookie(name: string): void {
	if (!browser) return;
	document.cookie = `${name}=; Max-Age=0; path=/`;
}

export interface AdminIdentity {
	sub: string;
	email: string;
	role: 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR';
	exp?: number;
}

function decodeJwtPayload<T>(token: string): T | undefined {
	try {
		const payloadB64 = token.split('.')[1];
		if (!payloadB64) return undefined;
		const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
		return JSON.parse(json) as T;
	} catch {
		return undefined;
	}
}

export function getAdminIdentity(): AdminIdentity | undefined {
	const token = getCookie('tumaa_admin_session');
	if (!token) return undefined;
	const payload = decodeJwtPayload<AdminIdentity>(token);
	if (!payload) return undefined;
	if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return undefined;
	return payload;
}

export function isAdminAuthenticated(): boolean {
	return !!getAdminIdentity();
}

export function isEmployerAuthenticated(): boolean {
	return !!getCookie('tumaa_employer_session');
}

export async function logout(): Promise<void> {
	deleteCookie('tumaa_admin_session');
	deleteCookie('tumaa_employer_session');
	await goto('/');
}
