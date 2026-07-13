import { json } from '@sveltejs/kit';
import { ADMIN_PASSWORD, ADMIN_SECRET } from '$env/static/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => ({}));

	if (!body.password || body.password !== ADMIN_PASSWORD) {
		return json({ error: 'Mot de passe incorrect' }, { status: 401 });
	}

	cookies.set('tumaa_admin_session', ADMIN_SECRET, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		maxAge: 60 * 60 * 8,
	});

	return json({ ok: true });
};
