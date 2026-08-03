<script lang="ts">
	import { onMount } from 'svelte';
	import { employerApi } from '$lib/api.js';
	import type { EmployerStats, EmployerOffer } from '$lib/types.js';

	let stats = $state<EmployerStats | null>(null);
	let recentOffers = $state<EmployerOffer[]>([]);
	let error = $state<string | null>(null);
	let loading = $state(true);

	onMount(async () => {
		try {
			[stats, recentOffers] = await Promise.all([
				employerApi.getStats(),
				employerApi.getMyOffers(),
			]);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erreur inconnue';
		} finally {
			loading = false;
		}
	});

	const reachMax = $derived(
		recentOffers.length > 0
			? Math.max(...recentOffers.map(o => o.profilesReached), 1)
			: 1
	);

	const PLANS = [
		{
			id: 'standard',
			label: 'Standard',
			price: '5 000 FCFA',
			desc: '1 offre publiée pendant 30 jours',
			features: ['Visible WhatsApp + web', 'Profils ciblés', 'Tableau de bord'],
			highlight: false,
		},
		{
			id: 'mise-en-avant',
			label: 'Mise en avant',
			price: '15 000 FCFA',
			desc: '1 offre sponsorisée avec push ciblé',
			features: ['Tout Standard +', 'Badge Sponsorisé', 'Push aux profils matchés'],
			highlight: true,
		},
		{
			id: 'pack5',
			label: 'Pack 5',
			price: '20 000 FCFA',
			desc: '5 offres Standard pendant 30 jours',
			features: ['5 publications', 'Économisez 5 000 FCFA', 'Tableau de bord consolidé'],
			highlight: false,
		},
		{
			id: 'illimite',
			label: 'Recruteur illimité',
			price: '50 000 FCFA',
			desc: 'Publications illimitées pendant 30 jours',
			features: ['Offres illimitées', 'Scout B2B dédié', 'Rapport mensuel'],
			highlight: false,
		},
	];
</script>

<div class="dashboard">
	<h1>Tableau de bord</h1>

	{#if error}
		<div class="error">{error}</div>
	{/if}

	<!-- Métriques -->
	{#if stats}
		<div class="stats-grid">
			<div class="stat-card">
				<span class="stat-label">Vues totales</span>
				<span class="stat-value">{stats.totalViews.toLocaleString('fr-FR')}</span>
			</div>
			<div class="stat-card">
				<span class="stat-label">Profils atteints</span>
				<span class="stat-value">{stats.profilesReached.toLocaleString('fr-FR')}</span>
			</div>
			<div class="stat-card highlight">
				<span class="stat-label">Clics contact</span>
				<span class="stat-value">{stats.contactClicks.toLocaleString('fr-FR')}</span>
			</div>
		</div>
	{:else if loading}
		<div class="stats-grid">
			{#each [0,1,2] as _}
				<div class="stat-card skeleton"></div>
			{/each}
		</div>
	{/if}

	<!-- Offres récentes -->
	<section class="section">
		<div class="section-header">
			<h2>Mes offres récentes</h2>
			<a href="/employer/offres" class="see-all">Voir toutes →</a>
		</div>

		{#if loading}
			<div class="offer-list">
				{#each [0,1,2] as _}
					<div class="offer-row skeleton-row"></div>
				{/each}
			</div>
		{:else if recentOffers.length === 0}
			<div class="empty-offers">
				<p>Aucune offre publiée pour l'instant.</p>
				<a href="/employer/publier" class="btn-primary">Publier ma première offre</a>
			</div>
		{:else}
			<div class="offer-list">
				{#each recentOffers.slice(0, 3) as offer}
					<div class="offer-row">
						<div class="offer-info">
							<span class="offer-title">{offer.title}</span>
							<span class="offer-meta">{offer.contractType} · {offer.city}</span>
						</div>
						<div class="offer-reach">
							<span class="reach-label">{offer.profilesReached} profils atteints</span>
							<div class="progress-bar">
								<div
									class="progress-fill"
									style="width: {Math.min((offer.profilesReached / reachMax) * 100, 100).toFixed(1)}%"
								></div>
							</div>
						</div>
						<span class="offer-status badge-{offer.status.toLowerCase()}">{offer.status}</span>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Choisir une formule -->
	<section class="section">
		<div class="section-header">
			<h2>Choisir une formule</h2>
		</div>
		<div class="plans-grid">
			{#each PLANS as plan}
				<div class="plan-card" class:plan-highlight={plan.highlight}>
					{#if plan.highlight}
						<span class="plan-badge">Recommandé</span>
					{/if}
					<div class="plan-label">{plan.label}</div>
					<div class="plan-price">{plan.price}<span class="plan-period">/offre</span></div>
					<p class="plan-desc">{plan.desc}</p>
					<ul class="plan-features">
						{#each plan.features as feat}
							<li>{feat}</li>
						{/each}
					</ul>
					<a href="/employer/publier" class="plan-cta" class:plan-cta-highlight={plan.highlight}>
						Choisir {plan.label}
					</a>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.dashboard { max-width: 960px; }

	h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; }
	h2 { font-size: 1rem; font-weight: 700; }

	/* ── Stats ────────────────────────────────────────── */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 90px;
	}

	.stat-card.highlight {
		border-color: var(--color-yellow);
		background: var(--color-yellow-light);
	}

	.stat-card.skeleton {
		background: var(--color-bg-subtle);
		animation: pulse 1.4s ease-in-out infinite;
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.stat-value {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-green);
	}

	/* ── Sections ─────────────────────────────────────── */
	.section {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.25rem;
	}

	.see-all {
		font-size: 0.8rem;
		color: var(--color-green);
		font-weight: 600;
	}

	.see-all:hover { text-decoration: underline; }

	/* ── Offer list ───────────────────────────────────── */
	.offer-list { display: flex; flex-direction: column; gap: 0.75rem; }

	.offer-row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: 1.5rem;
		padding: 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background: var(--color-bg-subtle);
	}

	.offer-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.offer-title {
		font-size: 0.9rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.offer-meta { font-size: 0.75rem; color: var(--color-text-muted); }

	.offer-reach {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 160px;
	}

	.reach-label { font-size: 0.75rem; color: var(--color-text-muted); }

	.progress-bar {
		height: 6px;
		background: var(--color-green-light);
		border-radius: 999px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--color-green);
		border-radius: 999px;
		transition: width 0.4s ease;
		min-width: 4px;
	}

	.offer-status {
		display: inline-block;
		padding: 3px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.badge-active { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-expired { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-archived { background: #fee2e2; color: #991b1b; }

	.skeleton-row {
		height: 68px;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
		animation: pulse 1.4s ease-in-out infinite;
	}

	/* ── Plans ────────────────────────────────────────── */
	.plans-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
	}

	.plan-card {
		position: relative;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		background: var(--color-bg-subtle);
		transition: border-color 0.15s;
	}

	.plan-card:hover { border-color: var(--color-green-mid); }

	.plan-card.plan-highlight {
		border: 2px solid #2b9964;
		background: var(--color-bg);
	}

	.plan-badge {
		position: absolute;
		top: -10px;
		left: 1rem;
		background: #ffbd59;
		color: var(--color-yellow-dark);
		font-size: 0.65rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 999px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.plan-label {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--color-text);
		margin-top: 0.5rem;
	}

	.plan-price {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--color-green);
	}

	.plan-period {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--color-text-muted);
	}

	.plan-desc {
		font-size: 0.78rem;
		color: var(--color-text-muted);
		line-height: 1.4;
	}

	.plan-features {
		list-style: none;
		padding: 0;
		margin: 0.25rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.plan-features li {
		font-size: 0.78rem;
		color: var(--color-text-muted);
		padding-left: 1rem;
		position: relative;
	}

	.plan-features li::before {
		content: '✓';
		position: absolute;
		left: 0;
		color: var(--color-green);
		font-weight: 700;
	}

	.plan-cta {
		display: block;
		text-align: center;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		font-size: 0.82rem;
		font-weight: 600;
		background: var(--color-green-light);
		color: var(--color-green-dark);
		transition: background 0.15s;
		margin-top: auto;
	}

	.plan-cta:hover { background: var(--color-green-mid); text-decoration: none; }

	.plan-cta.plan-cta-highlight {
		background: #2b9964;
		color: #fff;
	}

	.plan-cta.plan-cta-highlight:hover { background: var(--color-green-dark); }

	/* ── Misc ─────────────────────────────────────────── */
	.empty-offers {
		text-align: center;
		padding: 2rem;
		color: var(--color-text-muted);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.btn-primary {
		background: var(--color-green);
		color: #fff;
		padding: 0.6rem 1.25rem;
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: 0.9rem;
		transition: background 0.15s;
		text-decoration: none;
		display: inline-block;
	}

	.btn-primary:hover { background: var(--color-green-dark); text-decoration: none; }

	.error { background: #fee2e2; color: #991b1b; padding: 0.75rem 1rem; border-radius: var(--radius-md); margin-bottom: 1.5rem; font-size: 0.875rem; }

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
</style>
