<script lang="ts">
	import type { PageData } from './$types.js';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();
	let u = $derived(data.user);
	let pullHistory = $derived(data.pullHistory);

	let expandedPulls = $state<Set<string>>(new Set());
	$effect(() => {
		data.pullHistory;
		expandedPulls = new Set();
	});

	function todayStr(d: Date = new Date()): string {
		return d.toISOString().split('T')[0];
	}
	const defaultTo = todayStr();
	const defaultFromDate = new Date();
	defaultFromDate.setDate(defaultFromDate.getDate() - 30);
	const defaultFrom = todayStr(defaultFromDate);

	let from = $state(data.filters.from);
	let to = $state(data.filters.to);
	let hasFilters = $derived(data.filters.from !== defaultFrom || data.filters.to !== defaultTo);

	function togglePull(id: string) {
		const next = new Set(expandedPulls);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedPulls = next;
	}

	function buildParams(p: number) {
		const params = new URLSearchParams();
		params.set('page', String(p));
		if (from) params.set('from', from);
		if (to) params.set('to', to);
		return params.toString();
	}

	function applyFilters() {
		goto(`/admin/abonnes/${u.id}/pulls?${buildParams(1)}`);
	}

	function resetFilters() {
		from = defaultFrom;
		to = defaultTo;
		goto(`/admin/abonnes/${u.id}/pulls?from=${defaultFrom}&to=${defaultTo}&page=1`);
	}

	function goPullHistoryPage(p: number) {
		goto(`/admin/abonnes/${u.id}/pulls?${buildParams(p)}`);
	}

	function formatDateTime(d: string) {
		return new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
	}
</script>

<div class="section">
	<h2 class="section-title">Historique des pulls ({pullHistory.total})</h2>

	<div class="filters">
		<label class="filter-field">
			<span>Du</span>
			<input type="date" bind:value={from} />
		</label>
		<label class="filter-field">
			<span>Au</span>
			<input type="date" bind:value={to} />
		</label>
		<div class="filter-actions">
			<button class="btn-apply" onclick={applyFilters}>Filtrer</button>
			{#if hasFilters}
				<button class="btn-reset" onclick={resetFilters}>Réinitialiser</button>
			{/if}
		</div>
	</div>

	{#if pullHistory.data.length === 0}
		<p class="empty">Cet abonné n'a jamais tapé OFFRES ou SUITE.</p>
	{:else}
		<ul class="pull-list">
			{#each pullHistory.data as pull}
				<li class="pull-row">
					<button class="pull-header" onclick={() => togglePull(pull.id)}>
						<span class="pull-toggle">{expandedPulls.has(pull.id) ? '▾' : '▸'}</span>
						<span class="pull-command badge-command-{pull.command.toLowerCase()}">{pull.command}</span>
						<span class="pull-date">{formatDateTime(pull.createdAt)}</span>
						<span class="pull-count">
							{pull.offersCount} offre{pull.offersCount !== 1 ? 's' : ''}
						</span>
					</button>
					{#if expandedPulls.has(pull.id)}
						<div class="pull-offers">
							{#if pull.offers.length === 0}
								<p class="empty">Aucune offre envoyée lors de ce pull.</p>
							{:else}
								<table class="inner-table">
									<thead>
										<tr>
											<th>Titre</th>
											<th>Ville</th>
											<th>Secteur</th>
											<th>Page ouverte</th>
											<th>Source cliquée</th>
											<th>Partage</th>
										</tr>
									</thead>
									<tbody>
										{#each pull.offers as offer}
											<tr onclick={() => goto(`/admin/offres/${offer.id}`)} class="clickable-row">
												<td>
													<span class="lock-icon" title={offer.unlocked ? 'Débloquée (source accessible)' : 'Verrouillée (aucun abonnement actif)'}>
														{offer.unlocked ? '🔓' : '🔒'}
													</span>
													{offer.title}
												</td>
												<td class="muted">{offer.city}</td>
												<td class="muted">{offer.sector}</td>
												<td class="muted">
													{#if offer.seenAt}
														<span class="badge badge-tracking-yes">✔ {formatDateTime(offer.seenAt)}</span>
													{:else}
														<span class="badge badge-tracking-no">Non ouverte</span>
													{/if}
												</td>
												<td class="muted">
													{#if offer.sourceClickedAt}
														<span class="badge badge-tracking-yes">✔ {formatDateTime(offer.sourceClickedAt)}</span>
													{:else}
														<span class="badge badge-tracking-no">—</span>
													{/if}
												</td>
												<td class="muted">
													{#if offer.sharedAt}
														<span class="badge badge-tracking-yes">✔ {formatDateTime(offer.sharedAt)}</span>
													{:else}
														<span class="badge badge-tracking-no">—</span>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		<div class="pagination">
			<button
				disabled={pullHistory.page <= 1}
				onclick={() => goPullHistoryPage(pullHistory.page - 1)}
			>
				← Précédent
			</button>
			<span class="pagination-info">
				Page <strong>{pullHistory.page}</strong> / {pullHistory.totalPages}
			</span>
			<button
				disabled={pullHistory.page >= pullHistory.totalPages}
				onclick={() => goPullHistoryPage(pullHistory.page + 1)}
			>
				Suivant →
			</button>
		</div>
	{/if}
</div>

<style>
	.section {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
	}
	.section-title {
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		margin: 0 0 1rem;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}
	.filter-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.filter-field span {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}
	.filter-field input {
		height: 2.1rem;
		padding: 0 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg-subtle);
		color: var(--color-text);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.filter-field input:focus { border-color: var(--color-green-mid); }
	.filter-actions { display: flex; gap: 0.5rem; }
	.btn-apply {
		background: var(--color-green);
		color: #fff;
		border: none;
		padding: 0.45rem 1.1rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.btn-apply:hover { opacity: 0.88; }
	.btn-reset {
		background: var(--color-bg-subtle);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		padding: 0.45rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-reset:hover { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }

	.inner-table { width: 100%; border-collapse: collapse; }
	.inner-table th {
		text-align: left;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}
	.inner-table td {
		padding: 0.5rem 0.5rem;
		font-size: 0.85rem;
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}
	.inner-table tr:last-child td { border-bottom: none; }
	.inner-table tr.clickable-row { cursor: pointer; }
	.inner-table tr.clickable-row:hover { background: var(--color-green-light); }
	.muted { color: var(--color-text-muted); font-size: 0.8rem; }

	.pull-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.pull-row {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.pull-header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		background: var(--color-bg-subtle);
		border: none;
		cursor: pointer;
		font-size: 0.85rem;
		text-align: left;
	}
	.pull-header:hover { background: var(--color-border); }

	.pull-toggle {
		width: 1rem;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.pull-command {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.badge-command-offres { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-command-suite { background: #e0e7ff; color: #3730a3; }

	.pull-date { color: var(--color-text-muted); flex: 1; }
	.pull-count { font-weight: 600; }

	.pull-offers {
		padding: 0.75rem;
		border-top: 1px solid var(--color-border);
	}

	.badge-tracking-yes { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-tracking-no { background: #f3f4f6; color: var(--color-text-muted); font-weight: 500; text-transform: none; letter-spacing: normal; }

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-top: 1rem;
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}
	.pagination-info { display: flex; align-items: center; gap: 0.4rem; }
	.pagination button {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		padding: 0.35rem 0.8rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		color: var(--color-text);
		cursor: pointer;
		transition: background 0.15s;
	}
	.pagination button:hover:not(:disabled) {
		background: var(--color-green-light);
		border-color: var(--color-green-mid);
	}
	.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.empty { color: var(--color-text-muted); font-size: 0.875rem; margin: 0; }
</style>
