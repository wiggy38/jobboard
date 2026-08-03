<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { isEmployerAuthenticated, logout } from '$lib/auth.js';
	import { employerApi } from '$lib/api.js';
	import type { Employer } from '$lib/types.js';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	if (browser && !isEmployerAuthenticated()) {
		goto('/employer/login');
	}

	let employer = $state<Employer | null>(null);

	onMount(async () => {
		try {
			employer = await employerApi.getMe();
		} catch {
			// non-bloquant — les données du profil sont optionnelles pour l'affichage
		}
	});

	const navLinks = [
		{ href: '/employer', label: 'Tableau de bord', exact: true },
		{ href: '/employer/publier', label: 'Publier', exact: false },
		{ href: '/employer/offres', label: 'Mes offres', exact: false },
		{ href: '/employer/statistiques', label: 'Statistiques', exact: false },
		{ href: '/employer/sponsored', label: 'Sponsored Alert', exact: false },
		{ href: '/employer/compte', label: 'Compte', exact: false },
	];

	function isActive(link: { href: string; exact: boolean }): boolean {
		const path = page.url.pathname;
		return link.exact ? path === link.href : path === link.href || path.startsWith(link.href + '/');
	}

	$derived: {
		const s = employer?.slotsLeft;
		var planWarning = s !== undefined && s !== null && s < 2;
	}
</script>

<div class="layout">
	<aside class="sidebar">
		<div class="logo">
			<img src="/logo.png" alt="Tumaa" class="logo-img" />
			<span class="logo-badge">Espace Employeur</span>
		</div>

		<nav>
			{#each navLinks as link}
				<a href={link.href} class:active={isActive(link)}>{link.label}</a>
			{/each}
		</nav>

		<button class="logout-btn" onclick={() => logout()}>Déconnexion</button>
	</aside>

	<div class="main-col">
		<header class="topbar">
			<div class="topbar-left">
				{#if employer}
					<span class="company-name">{employer.name}</span>
					{#if employer.isVerified}
						<span class="badge-verified">✓ Vérifié</span>
					{/if}
				{:else}
					<span class="company-name-placeholder"></span>
				{/if}
			</div>
			<a href="/employer/publier" class="btn-publish">+ Publier une offre</a>
		</header>

		{#if employer?.plan}
			<div class="plan-banner" class:plan-warning={planWarning}>
				<span class="plan-formula">Formule : <strong>{employer.plan}</strong></span>
				{#if employer.slotsLeft !== null && employer.slotsLeft !== undefined}
					<span class="plan-slots" class:slots-low={planWarning}>
						{employer.slotsLeft} slot{employer.slotsLeft !== 1 ? 's' : ''} restant{employer.slotsLeft !== 1 ? 's' : ''}
					</span>
				{/if}
				{#if employer.planEndAt}
					<span class="plan-expiry">
						Expire le {new Date(employer.planEndAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
					</span>
				{/if}
				{#if planWarning}
					<a href="/employer/publier" class="plan-cta">Renouveler →</a>
				{/if}
			</div>
		{/if}

		<main class="content">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.layout {
		display: flex;
		min-height: 100vh;
	}

	/* ── Sidebar ──────────────────────────────────────── */
	.sidebar {
		width: 220px;
		background: var(--color-green-dark);
		color: #fff;
		display: flex;
		flex-direction: column;
		padding: 1.5rem 1rem;
		gap: 1.5rem;
		flex-shrink: 0;
	}

	.logo {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
	}

	.logo-img {
		height: 32px;
		width: auto;
		object-fit: contain;
		border-radius: 6px;
	}

	.logo-badge {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		flex: 1;
	}

	nav :global(a) {
		display: block;
		color: rgba(255, 255, 255, 0.75);
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 500;
		border-left: 3px solid transparent;
		transition: background 0.12s, color 0.12s;
	}

	nav :global(a:hover) {
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
		text-decoration: none;
	}

	nav :global(a.active) {
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
		border-left-color: var(--color-yellow);
		font-weight: 600;
	}

	.logout-btn {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.15);
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		text-align: left;
		transition: background 0.12s;
	}

	.logout-btn:hover {
		background: rgba(255, 255, 255, 0.18);
		color: #fff;
	}

	/* ── Main column ──────────────────────────────────── */
	.main-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		overflow: hidden;
	}

	/* ── Topbar ───────────────────────────────────────── */
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 2rem;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
		gap: 1rem;
	}

	.topbar-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.company-name {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.company-name-placeholder {
		display: inline-block;
		width: 140px;
		height: 1em;
		background: var(--color-border);
		border-radius: var(--radius-sm);
		animation: pulse 1.4s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.badge-verified {
		background: var(--color-green-light);
		color: var(--color-green-dark);
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 999px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.btn-publish {
		background: var(--color-green);
		color: #fff;
		padding: 0.45rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.85rem;
		font-weight: 600;
		transition: background 0.12s;
		white-space: nowrap;
	}

	.btn-publish:hover {
		background: var(--color-green-dark);
		text-decoration: none;
	}

	/* ── Plan banner ──────────────────────────────────── */
	.plan-banner {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.55rem 2rem;
		background: var(--color-bg-subtle);
		border-bottom: 1px solid var(--color-border);
		font-size: 0.8rem;
		color: var(--color-text-muted);
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.plan-banner.plan-warning {
		background: #fff8eb;
		border-bottom-color: #ffbd59;
	}

	.plan-formula strong { color: var(--color-text); font-weight: 600; }

	.plan-slots { font-weight: 500; }
	.plan-slots.slots-low { color: #92400e; font-weight: 700; }

	.plan-cta {
		margin-left: auto;
		color: var(--color-green);
		font-weight: 600;
		font-size: 0.8rem;
	}

	.plan-cta:hover { text-decoration: underline; }

	/* ── Content area ─────────────────────────────────── */
	.content {
		flex: 1;
		padding: 2rem;
		background: var(--color-bg-subtle);
		overflow-y: auto;
	}
</style>
