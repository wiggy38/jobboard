<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { isAdminAuthenticated } from '$lib/auth.js';

	if (browser && isAdminAuthenticated()) {
		goto('/admin');
	}

	let password = $state('');
	let error = $state<string | null>(null);
	let loading = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		error = null;

		try {
			const res = await fetch('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password }),
				credentials: 'include',
			});

			if (!res.ok) {
				error = 'Mot de passe incorrect.';
				return;
			}

			await goto('/admin');
		} catch {
			error = 'Impossible de joindre le serveur.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="page">
	<div class="card">
		<div class="logo">
			<img src="/logo.png" alt="Tumaa" class="logo-img" />
			<span class="badge">Admin</span>
		</div>

		<h1>Connexion</h1>

		{#if error}
			<div class="error">{error}</div>
		{/if}

		<form onsubmit={handleSubmit}>
			<label for="password">Mot de passe</label>
			<input
				id="password"
				type="password"
				bind:value={password}
				placeholder="••••••••"
				autocomplete="current-password"
				required
			/>
			<button type="submit" disabled={loading}>
				{loading ? 'Connexion…' : 'Se connecter'}
			</button>
		</form>
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg-subtle);
	}

	.card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 2.5rem 2rem;
		width: 100%;
		max-width: 360px;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.logo-img {
		height: 36px;
		width: auto;
		object-fit: contain;
	}

	.badge {
		font-size: 0.6rem;
		background: #2b9964;
		color: #fff;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-weight: 600;
		text-transform: uppercase;
	}

	h1 {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.error {
		background: #fee2e2;
		color: #991b1b;
		padding: 0.6rem 0.9rem;
		border-radius: var(--radius-md);
		font-size: 0.85rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-muted);
	}

	input {
		padding: 0.6rem 0.85rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.9rem;
		background: var(--color-bg);
		color: var(--color-text);
		transition: border-color 0.12s;
	}

	input:focus {
		outline: none;
		border-color: #2b9964;
	}

	button {
		margin-top: 0.25rem;
		background: #2b9964;
		color: #fff;
		border: none;
		padding: 0.65rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.9rem;
		font-weight: 600;
		transition: background 0.12s, opacity 0.12s;
	}

	button:hover:not(:disabled) {
		background: var(--color-green-dark);
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
