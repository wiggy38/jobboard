import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:2999';

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
	const body = await request.json().catch(() => ({}));

	if (!body.email || !body.password) {
		return json({ error: 'Email et mot de passe requis' }, { status: 400 });
	}

	const res = await fetch(`${API_BASE}/admin/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: body.email, password: body.password }),
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		return json({ error: err.error ?? 'Identifiants invalides' }, { status: res.status });
	}

	const { token } = await res.json();

	cookies.set('tumaa_admin_session', token, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		maxAge: 60 * 60 * 8,
	});

	return json({ ok: true });
};
