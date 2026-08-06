<script lang="ts">
	import type { PageData } from './$types.js';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let from = $state(data.filters.from);
	let to = $state(data.filters.to);
	let action = $state(data.filters.action ?? '');
	let jobTitle = $state(data.filters.jobTitle ?? '');

	let titleDebounce: ReturnType<typeof setTimeout> | null = null;

	function buildParams(page = 1) {
		const p = new URLSearchParams();
		p.set('page', String(page));
		if (from) p.set('from', from);
		if (to) p.set('to', to);
		if (action) p.set('action', action);
		if (jobTitle) p.set('jobTitle', jobTitle);
		return p.toString();
	}

	function applyFilters() {
		goto(`/admin/tracking?${buildParams(1)}`);
	}

	function onTitleInput() {
		if (titleDebounce) clearTimeout(titleDebounce);
		titleDebounce = setTimeout(
			() => goto(`/admin/tracking?${buildParams(1)}`, { keepFocus: true, noScroll: true }),
			300
		);
	}

	function resetFilters() {
		const now = new Date();
		const past = new Date();
		past.setDate(past.getDate() - 30);
		from = past.toISOString().split('T')[0];
		to = now.toISOString().split('T')[0];
		action = '';
		jobTitle = '';
		goto(`/admin/tracking?from=${from}&to=${to}&page=1`);
	}

	function goPage(p: number) {
		goto(`/admin/tracking?${buildParams(p)}`);
	}

	const hasFilters = $derived(action !== '' || jobTitle !== '');

	function formatDateTime(d: string) {
		return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	const ACTION_LABELS: Record<string, string> = {
		SEEN: 'Vue',
		CLICKED_SOURCE: 'Clic source',
	};
</script>

<div class="page">
	<div class="page-header">
		<h1>Tracking clics</h1>
	</div>

	{#if data.error}
		<div class="api-error">⚠ API error : <code>{data.error}</code></div>
	{/if}

	<div class="filters">
		<div class="filter-row">
			<label class="filter-field">
				<span>Du</span>
				<input type="date" bind:value={from} />
			</label>

			<label class="filter-field">
				<span>Au</span>
				<input type="date" bind:value={to} />
			</label>

			<label class="filter-field">
				<span>Action</span>
				<select bind:value={action}>
					<option value="">Toutes</option>
					<option value="SEEN">Vues</option>
					<option value="CLICKED_SOURCE">Clics source</option>
				</select>
			</label>

			<label class="filter-field filter-field--title">
				<span>Titre de l'offre</span>
				<input
					type="search"
					placeholder="Ex : développeur, comptable…"
					bind:value={jobTitle}
					oninput={onTitleInput}
				/>
			</label>
		</div>

		<div class="filter-actions">
			<button class="btn-apply" onclick={applyFilters}>Filtrer</button>
			{#if hasFilters}
				<button class="btn-reset" onclick={resetFilters}>Réinitialiser</button>
			{/if}
		</div>
	</div>

	<div class="stat-row">
		<div class="stat-card">
			<span class="stat-value">{data.summary.views}</span>
			<span class="stat-label">Vues (période)</span>
		</div>
		<div class="stat-card stat-green">
			<span class="stat-value">{data.summary.clicks}</span>
			<span class="stat-label">Clics source (période)</span>
		</div>
		<div class="stat-card">
			<span class="stat-value">{(data.summary.clickRate * 100).toFixed(1)}%</span>
			<span class="stat-label">Taux de clic</span>
		</div>
	</div>

	<table>
		<thead>
			<tr>
				<th>Date</th>
				<th>Offre</th>
				<th>Utilisateur</th>
				<th>Action</th>
			</tr>
		</thead>
		<tbody>
			{#each data.events as event}
				<tr onclick={() => goto(`/admin/offres/${event.job.id}`)} class="clickable">
					<td class="date">{formatDateTime(event.createdAt)}</td>
					<td class="title">
						{event.job.title}
						<span class="org">{event.job.organization}</span>
					</td>
					<td class="phone">{event.user.displayName ?? event.user.phone}</td>
					<td>
						<span class="badge badge-action-{event.action.toLowerCase()}">{ACTION_LABELS[event.action] ?? event.action}</span>
					</td>
				</tr>
			{/each}
			{#if data.events.length === 0}
				<tr><td colspan="4" class="empty">Aucun événement trouvé.</td></tr>
			{/if}
		</tbody>
	</table>

	<div class="pagination">
		<button disabled={data.page <= 1} onclick={() => goPage(data.page - 1)}>← Précédent</button>
		<span class="pagination-info">
			Page <strong>{data.page}</strong> / {data.totalPages}
			<span class="pagination-sep">·</span>
			{data.perPage} par page
			<span class="pagination-sep">·</span>
			{data.total} événement{data.total !== 1 ? 's' : ''} au total
		</span>
		<button disabled={data.page >= data.totalPages} onclick={() => goPage(data.page + 1)}>Suivant →</button>
	</div>
</div>

<style>
	.page { max-width: 1200px; }

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}
	.page-header h1 { margin-bottom: 0; }

	.filters {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
		margin-bottom: 1.25rem;
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: flex-end;
	}

	.filter-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		flex: 1 1 150px;
		min-width: 130px;
	}

	.filter-field--title {
		flex: 2 1 260px;
		min-width: 200px;
	}

	.filter-field span {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.filter-field select,
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

	.filter-field select:focus,
	.filter-field input:focus {
		border-color: var(--color-green-mid);
	}

	.filter-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}

	.btn-apply {
		background: var(--color-green);
		color: #fff;
		border: none;
		padding: 0.45rem 1.1rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s, transform 0.1s;
	}
	.btn-apply:hover { opacity: 0.88; }
	.btn-apply:active { transform: scale(0.93); opacity: 0.75; }

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

	.stat-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.stat-card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 0.85rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.stat-value {
		font-size: 1.4rem;
		font-weight: 700;
		line-height: 1;
	}

	.stat-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.stat-green .stat-value { color: #2b9964; }

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--color-bg);
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border);
	}

	th, td {
		padding: 0.75rem 1rem;
		text-align: left;
		font-size: 0.875rem;
		border-bottom: 1px solid var(--color-border);
	}

	th {
		background: var(--color-bg-subtle);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
	}

	td.date { width: 160px; white-space: nowrap; color: var(--color-text-muted); }
	td.title { font-weight: 500; color: var(--color-text); }
	td.title .org { display: block; font-size: 0.78rem; font-weight: 400; color: var(--color-text-muted); }
	td.phone { font-variant-numeric: tabular-nums; }
	td.empty { text-align: center; color: var(--color-text-muted); padding: 2rem; }

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.badge-action-seen { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-action-clicked_source { background: var(--color-green-light); color: var(--color-green-dark); }

	.pagination {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1rem;
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.pagination-info {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.pagination-sep {
		color: var(--color-border);
	}

	.pagination button {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		padding: 0.4rem 0.9rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		color: var(--color-text);
		transition: background 0.15s;
	}

	.pagination button:hover:not(:disabled) {
		background: var(--color-green-light);
		border-color: var(--color-green-mid);
	}

	.pagination button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	tbody tr.clickable { cursor: pointer; }
	tbody tr.clickable:hover { background: var(--color-green-light); }

	.api-error {
		background: #fef9c3;
		color: #854d0e;
		border: 1px solid #fde047;
		padding: 0.6rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		margin-bottom: 1rem;
	}

	.api-error code {
		font-family: monospace;
		font-size: 0.75rem;
	}
</style>
