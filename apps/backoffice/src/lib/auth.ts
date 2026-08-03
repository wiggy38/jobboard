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

export function isAdminAuthenticated(): boolean {
	return !!getCookie('tumaa_admin_session');
}

export function isEmployerAuthenticated(): boolean {
	return !!getCookie('tumaa_employer_session');
}

export async function logout(): Promise<void> {
	deleteCookie('tumaa_admin_session');
	deleteCookie('tumaa_employer_session');
	await goto('/');
}
