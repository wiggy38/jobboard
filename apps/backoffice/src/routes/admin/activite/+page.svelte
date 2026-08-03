<script lang="ts">
	import type { PageData } from './$types.js';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let from = $state(data.filters.from);
	let to = $state(data.filters.to);
	let pulled = $state(data.filters.pulled ?? '');
	let plan = $state(data.filters.plan ?? '');
	let status = $state(data.filters.status ?? '');
	let phone = $state(data.filters.phone ?? '');

	let phoneDebounce: ReturnType<typeof setTimeout> | null = null;

	function buildParams(page = 1) {
		const p = new URLSearchParams();
		p.set('page', String(page));
		if (from) p.set('from', from);
		if (to) p.set('to', to);
		if (pulled) p.set('pulled', pulled);
		if (plan) p.set('plan', plan);
		if (status) p.set('status', status);
		if (phone) p.set('phone', phone);
		return p.toString();
	}

	function applyFilters() {
		goto(`/admin/activite?${buildParams(1)}`);
	}

	function onPhoneInput() {
		if (phoneDebounce) clearTimeout(phoneDebounce);
		phoneDebounce = setTimeout(
			() => goto(`/admin/activite?${buildParams(1)}`, { keepFocus: true, noScroll: true }),
			300
		);
	}

	function resetFilters() {
		const now = new Date();
		const past = new Date();
		past.setDate(past.getDate() - 30);
		from = past.toISOString().split('T')[0];
		to = now.toISOString().split('T')[0];
		pulled = '';
		plan = '';
		status = '';
		phone = '';
		goto(`/admin/activite?from=${from}&to=${to}&page=1`);
	}

	function goPage(p: number) {
		goto(`/admin/activite?${buildParams(p)}`);
	}

	const hasFilters = $derived(
		pulled !== '' || plan !== '' || status !== '' || phone !== ''
	);

	function formatDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	const pulledCount = $derived(data.users.filter((u) => u.pullDaysCount > 0).length);
	const notPulledCount = $derived(data.users.length - pulledCount);
	const totalOffersReceived = $derived(data.users.reduce((sum, u) => sum + u.offersReceived, 0));
</script>

<div class="page">
	<div class="page-header">
		<h1>Activité pull</h1>
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
				<span>Activité</span>
				<select bind:value={pulled}>
					<option value="">Tous</option>
					<option value="true">A pullé</option>
					<option value="false">N'a jamais pullé</option>
				</select>
			</label>

			<label class="filter-field">
				<span>Plan</span>
				<select bind:value={plan}>
					<option value="">Tous</option>
					<option value="FREEMIUM">Freemium</option>
					<option value="PREMIUM">Premium</option>
					<option value="ELITE">Elite</option>
				</select>
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

			<label class="filter-field filter-field--phone">
				<span>Téléphone</span>
				<input
					type="search"
					placeholder="Ex : +22670…"
					bind:value={phone}
					oninput={onPhoneInput}
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
			<span class="stat-value">{data.total}</span>
			<span class="stat-label">Abonnés (page filtrée)</span>
		</div>
		<div class="stat-card stat-green">
			<span class="stat-value">{pulledCount}</span>
			<span class="stat-label">Ont pullé sur cette page</span>
		</div>
		<div class="stat-card stat-yellow">
			<span class="stat-value">{notPulledCount}</span>
			<span class="stat-label">N'ont pas pullé sur cette page</span>
		</div>
		<div class="stat-card">
			<span class="stat-value">{totalOffersReceived}</span>
			<span class="stat-label">Offres reçues (page)</span>
		</div>
	</div>

	<table>
		<thead>
			<tr>
				<th>Téléphone</th>
				<th>Nom</th>
				<th>Plan</th>
				<th>Statut</th>
				<th>Jours pullés</th>
				<th>Offres reçues</th>
				<th>Dernier pull</th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as user}
				<tr onclick={() => goto(`/admin/abonnes/${user.id}`)} class="clickable">
					<td class="phone">{user.phone}</td>
					<td>{user.displayName ?? '—'}</td>
					<td>
						<span class="badge badge-plan-{user.plan.toLowerCase()}">{user.plan}</span>
					</td>
					<td>
						<span class="badge badge-status-{user.status.toLowerCase()}">{user.status}</span>
					</td>
					<td class="num">
						{#if user.pullDaysCount > 0}
							{user.pullDaysCount}
						{:else}
							<span class="badge badge-never-pulled">Jamais</span>
						{/if}
					</td>
					<td class="num">{user.offersReceived}</td>
					<td class="date">{formatDate(user.lastPullDate)}</td>
				</tr>
			{/each}
			{#if data.users.length === 0}
				<tr><td colspan="7" class="empty">Aucun abonné trouvé.</td></tr>
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
			{data.total} abonné{data.total !== 1 ? 's' : ''} au total
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

	.filter-field--phone {
		flex: 2 1 220px;
		min-width: 180px;
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
		grid-template-columns: repeat(4, 1fr);
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
	.stat-yellow .stat-value { color: #b45309; }

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
	td.num { font-variant-numeric: tabular-nums; font-weight: 600; }
	td.empty { text-align: center; color: var(--color-text-muted); padding: 2rem; }

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.badge-plan-freemium { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-plan-premium { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-plan-elite { background: #ede9fe; color: #6d28d9; }

	.badge-status-active { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-status-paused { background: #fef9c3; color: #854d0e; }
	.badge-status-dormant { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-status-stopped { background: #fee2e2; color: #991b1b; }

	.badge-never-pulled { background: #fee2e2; color: #991b1b; }

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
