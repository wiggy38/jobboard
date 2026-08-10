<script lang="ts">
	import type { PageData } from './$types.js';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let status = $state(data.filters.status ?? '');
	let country = $state(data.filters.country ?? '');
	let phone = $state(data.filters.phone ?? '');

	let phoneDebounce: ReturnType<typeof setTimeout> | null = null;

	function buildParams(page = 1) {
		const p = new URLSearchParams();
		p.set('page', String(page));
		if (status) p.set('status', status);
		if (country) p.set('country', country);
		if (phone) p.set('phone', phone);
		return p.toString();
	}

	function applyFilters() {
		goto(`/admin/abonnes-sans-plan?${buildParams(1)}`);
	}

	function onPhoneInput() {
		if (phoneDebounce) clearTimeout(phoneDebounce);
		phoneDebounce = setTimeout(
			() => goto(`/admin/abonnes-sans-plan?${buildParams(1)}`, { keepFocus: true, noScroll: true }),
			300
		);
	}

	function resetFilters() {
		status = '';
		country = '';
		phone = '';
		goto('/admin/abonnes-sans-plan?page=1');
	}

	function goPage(p: number) {
		goto(`/admin/abonnes-sans-plan?${buildParams(p)}`);
	}

	const hasFilters = $derived(status !== '' || country !== '' || phone !== '');

	function formatDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<div class="page">
	<div class="page-header">
		<h1>Inscrits sans formule</h1>
	</div>

	<p class="page-hint">
		Utilisateurs inscrits restés sur le plan par défaut Freemium — jamais passés à Premium ou Elite.
	</p>

	{#if data.error}
		<div class="api-error">⚠ API error : <code>{data.error}</code></div>
	{/if}

	<div class="filters">
		<div class="filter-row">
			<label class="filter-field filter-field--phone">
				<span>Recherche par téléphone</span>
				<input
					type="search"
					placeholder="Ex : +22670…"
					bind:value={phone}
					oninput={onPhoneInput}
				/>
			</label>

			<label class="filter-field">
				<span>Statut</span>
				<select bind:value={status}>
					<option value="">Tous</option>
					<option value="ACTIVE">Active</option>
					<option value="PAUSED">Paused</option>
					<option value="DORMANT">Dormant</option>
					<option value="STOPPED">Stopped</option>
				</select>
			</label>

			<label class="filter-field">
				<span>Pays</span>
				<input type="text" placeholder="ex: BF" bind:value={country} />
			</label>
		</div>

		<div class="filter-actions">
			<button class="btn-apply" onclick={applyFilters}>Filtrer</button>
			{#if hasFilters}
				<button class="btn-reset" onclick={resetFilters}>Réinitialiser</button>
			{/if}
		</div>
	</div>

	<div class="results-summary">
		{data.total} inscrit{data.total !== 1 ? 's' : ''} sans formule
	</div>

	<table>
		<thead>
			<tr>
				<th>Téléphone</th>
				<th>Nom</th>
				<th>Statut</th>
				<th>Pays</th>
				<th>Inscrit le</th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as user}
				<tr onclick={() => goto(`/admin/abonnes/${user.id}`)} class="clickable">
					<td class="phone">{user.phone}</td>
					<td>{user.displayName ?? '—'}</td>
					<td>
						<span class="badge badge-status-{user.status.toLowerCase()}">{user.status}</span>
					</td>
					<td>{user.countries.join(', ')}</td>
					<td class="date">{formatDate(user.createdAt)}</td>
				</tr>
			{/each}
			{#if data.users.length === 0}
				<tr><td colspan="5" class="empty">Aucun inscrit sans formule trouvé.</td></tr>
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
			{data.total} inscrit{data.total !== 1 ? 's' : ''} au total
		</span>
		<button disabled={data.page >= data.totalPages} onclick={() => goPage(data.page + 1)}>Suivant →</button>
	</div>
</div>

<style>
	.page { max-width: 1100px; }

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

	.page-hint {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin-top: -1rem;
		margin-bottom: 1.25rem;
	}

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

	.filter-field--phone {
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

	td.phone { font-weight: 500; font-variant-numeric: tabular-nums; }
	td.date { width: 130px; white-space: nowrap; color: var(--color-text-muted); }
	td.empty { text-align: center; color: var(--color-text-muted); padding: 2rem; }

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.badge-status-active { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-status-paused { background: #fef9c3; color: #854d0e; }
	.badge-status-dormant { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-status-stopped { background: #fee2e2; color: #991b1b; }

	.results-summary {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin-bottom: 0.75rem;
	}

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
