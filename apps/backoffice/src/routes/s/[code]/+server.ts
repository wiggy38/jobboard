import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params, fetch }) => {
	const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
	const res = await fetch(`${apiBase}/api/shortlinks/${params.code}`);
	if (!res.ok) throw redirect(302, 'https://tumaa.bf/offres.html');
	const { path } = await res.json();
	throw redirect(302, path);
};
