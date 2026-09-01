<script lang="ts">
	import type { PageData } from './$types.js';
	import { goto } from '$app/navigation';
	import { adminApi } from '$lib/api.js';

	let { data }: { data: PageData } = $props();

	let from = $state(data.filters.from);
	let to = $state(data.filters.to);
	let phoneNumber = $state(data.filters.phoneNumber ?? '');

	let phoneDebounce: ReturnType<typeof setTimeout> | null = null;
	let exporting = $state(false);
	let exportError = $state('');

	function isoWeekString(d: Date): string {
		const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
		const day = date.getUTCDay() || 7;
		date.setUTCDate(date.getUTCDate() + 4 - day);
		const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
		const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
		return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
	}

	function pastWeekOptions(count = 12): string[] {
		const weeks: string[] = [];
		const now = new Date();
		for (let i = 0; i < count; i++) {
			const d = new Date(now);
			d.setDate(d.getDate() - i * 7);
			weeks.push(isoWeekString(d));
		}
		return weeks;
	}

	const weekOptions = pastWeekOptions();
	let selectedWeek = $state(weekOptions[0]);

	function buildParams(page = 1) {
		const p = new URLSearchParams();
		p.set('page', String(page));
		if (from) p.set('from', from);
		if (to) p.set('to', to);
		if (phoneNumber) p.set('phoneNumber', phoneNumber);
		return p.toString();
	}

	function applyFilters() {
		goto(`/admin/whatsapp-logs?${buildParams(1)}`);
	}

	function onPhoneInput() {
		if (phoneDebounce) clearTimeout(phoneDebounce);
		phoneDebounce = setTimeout(
			() => goto(`/admin/whatsapp-logs?${buildParams(1)}`, { keepFocus: true, noScroll: true }),
			300
		);
	}

	function resetFilters() {
		const now = new Date();
		const past = new Date();
		past.setDate(past.getDate() - 30);
		from = past.toISOString().split('T')[0];
		to = now.toISOString().split('T')[0];
		phoneNumber = '';
		goto(`/admin/whatsapp-logs?from=${from}&to=${to}&page=1`);
	}

	function goPage(p: number) {
		goto(`/admin/whatsapp-logs?${buildParams(p)}`);
	}

	const hasFilters = $derived(phoneNumber !== '');

	function formatDateTime(d: string) {
		return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	async function downloadExport() {
		exporting = true;
		exportError = '';
		try {
			const blob = await adminApi.exportUnknownCommands(selectedWeek);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `unknown-commands-${selectedWeek}.jsonl`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			exportError = err instanceof Error ? err.message : String(err);
		} finally {
			exporting = false;
		}
	}
</script>

<div class="page">
	<div class="page-header">
		<h1>Commandes WhatsApp incomprises</h1>
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

			<label class="filter-field filter-field--phone">
				<span>Téléphone</span>
				<input
					type="search"
					placeholder="Ex : +226..."
					bind:value={phoneNumber}
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

	<div class="export-bar">
		<label class="filter-field">
			<span>Semaine à exporter</span>
			<select bind:value={selectedWeek}>
				{#each weekOptions as w}
					<option value={w}>{w}</option>
				{/each}
			</select>
		</label>
		<button class="btn-apply" onclick={downloadExport} disabled={exporting}>
			{exporting ? 'Génération…' : '⬇ Télécharger (JSONL)'}
		</button>
		{#if exportError}
			<span class="export-error">⚠ {exportError}</span>
		{/if}
	</div>

	<table>
		<thead>
			<tr>
				<th>Date</th>
				<th>Téléphone</th>
				<th>Commande brute</th>
				<th>Pays</th>
			</tr>
		</thead>
		<tbody>
			{#each data.entries as entry}
				<tr>
					<td class="date">{formatDateTime(entry.createdAt)}</td>
					<td class="phone">{entry.phoneNumber}</td>
					<td class="raw">{entry.raw}</td>
					<td>{entry.country ?? '—'}</td>
				</tr>
			{/each}
			{#if data.entries.length === 0}
				<tr><td colspan="4" class="empty">Aucune commande incomprise trouvée.</td></tr>
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
			{data.total} commande{data.total !== 1 ? 's' : ''} au total
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

	.export-bar {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
		margin-bottom: 1.25rem;
	}

	.export-error {
		font-size: 0.8rem;
		color: #991b1b;
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
	.btn-apply:disabled { opacity: 0.5; cursor: not-allowed; }

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

	td.date { width: 160px; white-space: nowrap; color: var(--color-text-muted); }
	td.phone { font-variant-numeric: tabular-nums; white-space: nowrap; }
	td.raw { font-family: monospace; }
	td.empty { text-align: center; color: var(--color-text-muted); padding: 2rem; }

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
