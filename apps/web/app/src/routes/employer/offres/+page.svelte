<script lang="ts">
	import { onMount } from 'svelte';
	import { employerApi } from '$lib/api.js';
	import type { EmployerOffer, JobOfferStatus } from '$lib/types.js';

	let allOffers = $state<EmployerOffer[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let activeFilter = $state<JobOfferStatus | 'ALL'>('ALL');
	let actionError = $state<string | null>(null);
	let actionLoading = $state<string | null>(null); // offerId en cours d'action

	onMount(async () => {
		await loadOffers();
	});

	async function loadOffers() {
		loading = true;
		error = null;
		try {
			allOffers = await employerApi.getMyOffers();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erreur inconnue';
		} finally {
			loading = false;
		}
	}

	const FILTERS: { label: string; value: JobOfferStatus | 'ALL' }[] = [
		{ label: 'Toutes', value: 'ALL' },
		{ label: 'En attente', value: 'PENDING' },
		{ label: 'Actives', value: 'ACTIVE' },
		{ label: 'Expirées', value: 'EXPIRED' },
		{ label: 'Archivées', value: 'ARCHIVED' },
	];

	const filtered = $derived(
		activeFilter === 'ALL' ? allOffers : allOffers.filter(o => o.status === activeFilter)
	);

	function fmtDate(d: string | null | undefined): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	async function doAction(id: string, action: 'renew' | 'sponsor' | 'archive') {
		actionLoading = id + ':' + action;
		actionError = null;
		try {
			if (action === 'renew') await employerApi.renewOffer(id);
			else if (action === 'sponsor') await employerApi.sponsorOffer(id);
			else await employerApi.archiveOffer(id);
			await loadOffers();
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'Erreur lors de l'action.';
		} finally {
			actionLoading = null;
		}
	}

	function isLoading(id: string, action: string) {
		return actionLoading === id + ':' + action;
	}
</script>

<div class="page">
	<div class="page-header">
		<h1>Mes offres</h1>
		<a href="/employer/publier" class="btn-primary">+ Nouvelle offre</a>
	</div>

	<!-- Filtres -->
	<div class="filters">
		{#each FILTERS as f}
			<button
				class="filter-btn"
				class:active={activeFilter === f.value}
				onclick={() => { activeFilter = f.value; }}
			>
				{f.label}
				{#if f.value !== 'ALL'}
					<span class="filter-count">{allOffers.filter(o => o.status === f.value).length}</span>
				{:else}
					<span class="filter-count">{allOffers.length}</span>
				{/if}
			</button>
		{/each}
	</div>

	{#if error}
		<div class="alert-error">{error}</div>
	{/if}

	{#if actionError}
		<div class="alert-error">{actionError}</div>
	{/if}

	{#if loading}
		<div class="table-wrap">
			<div class="loading-rows">
				{#each [0,1,2,3] as _}
					<div class="skeleton-row"></div>
				{/each}
			</div>
		</div>
	{:else if filtered.length === 0}
		<div class="empty">
			{#if activeFilter === 'ALL'}
				<p>Aucune offre publiée pour l'instant.</p>
				<a href="/employer/publier" class="btn-primary">Publier votre première offre</a>
			{:else}
				<p>Aucune offre avec ce statut.</p>
			{/if}
		</div>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Titre</th>
						<th>Type</th>
						<th>Ville</th>
						<th>Publiée le</th>
						<th>Expire le</th>
						<th class="num">Profils</th>
						<th class="num">Clics</th>
						<th>Statut</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as offer}
						<tr class:row-expired={offer.status === 'EXPIRED'} class:row-archived={offer.status === 'ARCHIVED'}>
							<td class="td-title">
								<span class="offer-title">{offer.title}</span>
								{#if offer.isSponsored}
									<span class="badge-sponsored">Sponsorisé</span>
								{/if}
							</td>
							<td><span class="tag">{offer.contractType}</span></td>
							<td>{offer.city}</td>
							<td class="td-date">{fmtDate(offer.publishedAt)}</td>
							<td class="td-date">{fmtDate(offer.expiresAt ?? offer.deadline)}</td>
							<td class="num">{offer.profilesReached.toLocaleString('fr-FR')}</td>
							<td class="num">{offer.contactClicks.toLocaleString('fr-FR')}</td>
							<td>
								<span class="badge badge-{offer.status.toLowerCase()}">{offer.status}</span>
							</td>
							<td class="td-actions">
								{#if offer.status !== 'ARCHIVED'}
									<button
										class="action-btn"
										disabled={!!actionLoading}
										onclick={() => doAction(offer.id, 'renew')}
									>
										{isLoading(offer.id, 'renew') ? '…' : 'Renouveler'}
									</button>
									{#if !offer.isSponsored}
										<button
											class="action-btn action-sponsor"
											disabled={!!actionLoading}
											onclick={() => doAction(offer.id, 'sponsor')}
										>
											{isLoading(offer.id, 'sponsor') ? '…' : 'Sponsoriser'}
										</button>
									{/if}
									<button
										class="action-btn action-archive"
										disabled={!!actionLoading}
										onclick={() => doAction(offer.id, 'archive')}
									>
										{isLoading(offer.id, 'archive') ? '…' : 'Archiver'}
									</button>
								{:else}
									<button
										class="action-btn"
										disabled={!!actionLoading}
										onclick={() => doAction(offer.id, 'renew')}
									>
										{isLoading(offer.id, 'renew') ? '…' : 'Renouveler'}
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.page { max-width: 1100px; }

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.25rem;
	}

	h1 { font-size: 1.5rem; font-weight: 700; }

	.btn-primary {
		background: var(--color-green);
		color: #fff;
		padding: 0.55rem 1.1rem;
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: 0.875rem;
		transition: background 0.15s;
		text-decoration: none;
		display: inline-block;
	}

	.btn-primary:hover { background: var(--color-green-dark); text-decoration: none; }

	/* ── Filtres ──────────────────────────────────────── */
	.filters {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}

	.filter-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.9rem;
		border-radius: 999px;
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--color-text-muted);
		transition: background 0.12s, border-color 0.12s, color 0.12s;
	}

	.filter-btn:hover {
		border-color: var(--color-green-mid);
		color: var(--color-green);
	}

	.filter-btn.active {
		background: var(--color-green);
		border-color: var(--color-green);
		color: #fff;
	}

	.filter-count {
		background: rgba(255,255,255,0.25);
		padding: 0 5px;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
	}

	.filter-btn:not(.active) .filter-count {
		background: var(--color-border);
		color: var(--color-text-muted);
	}

	/* ── Table ────────────────────────────────────────── */
	.table-wrap {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	thead { background: var(--color-bg-subtle); }

	th {
		padding: 0.65rem 1rem;
		text-align: left;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		white-space: nowrap;
		border-bottom: 1px solid var(--color-border);
	}

	th.num { text-align: right; }

	tbody tr {
		border-bottom: 1px solid var(--color-border);
		transition: background 0.1s;
	}

	tbody tr:last-child { border-bottom: none; }
	tbody tr:hover { background: var(--color-bg-subtle); }

	tbody tr.row-expired td { opacity: 0.65; }
	tbody tr.row-archived td { opacity: 0.5; }

	td {
		padding: 0.75rem 1rem;
		vertical-align: middle;
		color: var(--color-text);
	}

	td.num { text-align: right; font-variant-numeric: tabular-nums; }
	td.td-date { white-space: nowrap; color: var(--color-text-muted); font-size: 0.8rem; }

	.td-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		max-width: 220px;
	}

	.offer-title {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.badge-sponsored {
		background: #ffbd59;
		color: #7a4a00;
		font-size: 0.62rem;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 999px;
		text-transform: uppercase;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.tag {
		background: var(--color-green-light);
		color: var(--color-green-dark);
		padding: 2px 7px;
		border-radius: var(--radius-sm);
		font-size: 0.72rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.badge {
		display: inline-block;
		padding: 2px 7px;
		border-radius: var(--radius-sm);
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.badge-active { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-expired { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-archived { background: #fee2e2; color: #991b1b; }

	/* ── Actions ──────────────────────────────────────── */
	.td-actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.action-btn {
		padding: 0.3rem 0.65rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-bg-subtle);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		transition: background 0.12s, color 0.12s, border-color 0.12s;
		white-space: nowrap;
	}

	.action-btn:hover:not(:disabled) {
		background: var(--color-green-light);
		color: var(--color-green-dark);
		border-color: var(--color-green-mid);
	}

	.action-btn.action-sponsor:hover:not(:disabled) {
		background: #fff8eb;
		color: #92400e;
		border-color: #ffbd59;
	}

	.action-btn.action-archive:hover:not(:disabled) {
		background: #fee2e2;
		color: #991b1b;
		border-color: #fca5a5;
	}

	.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	/* ── Loading / empty ──────────────────────────────── */
	.loading-rows { display: flex; flex-direction: column; }

	.skeleton-row {
		height: 56px;
		border-bottom: 1px solid var(--color-border);
		background: linear-gradient(90deg, var(--color-bg-subtle) 25%, var(--color-border) 50%, var(--color-bg-subtle) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.4s ease-in-out infinite;
	}

	@keyframes shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	.empty {
		text-align: center;
		padding: 3rem;
		color: var(--color-text-muted);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.alert-error {
		background: #fee2e2;
		color: #991b1b;
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}
</style>
