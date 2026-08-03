<script lang="ts">
	import type { PageData } from './$types.js';
	import type { TemplateType } from '$lib/types.js';

	let { data }: { data: PageData } = $props();

	type FilterType = TemplateType | 'ALL';
	let filterType = $state<FilterType>('ALL');

	const filteredLogs = $derived(
		filterType === 'ALL'
			? data.logs
			: data.logs.filter(l => l.type === filterType)
	);

	const totalSent = $derived(data.logs.length);
	const totalCap = $derived(data.usage.reduce((sum, u) => sum + u.cap, 0));

	const FILTERS: { value: FilterType; label: string }[] = [
		{ value: 'ALL', label: 'Tous' },
		{ value: 'RELANCE', label: 'Relance' },
		{ value: 'MATCH_PARFAIT', label: 'Match parfait' },
		{ value: 'NUDGE_PREMIUM', label: 'Nudge Premium' },
	];

	const typeLabel: Record<string, string> = {
		RELANCE: 'Relance',
		MATCH_PARFAIT: 'Match parfait',
		NUDGE_PREMIUM: 'Nudge Premium',
	};

	const statusLabel: Record<string, string> = {
		SENT: 'Envoyé',
		DELIVERED: 'Livré',
		READ: 'Lu',
		FAILED: 'Échec',
	};

	function maskPhone(phone: string): string {
		if (phone.length <= 6) return phone;
		return phone.slice(0, 7) + '•••' + phone.slice(-2);
	}
</script>

<div class="page">
	<div class="page-header">
		<h1>Templates WhatsApp</h1>
		<div class="global-counter">
			<span class="counter-sent">{totalSent}</span>
			<span class="counter-sep">/</span>
			<span class="counter-cap">{totalCap} envois ce mois</span>
		</div>
	</div>

	<!-- Filtre par type -->
	<div class="filters">
		{#each FILTERS as f}
			<button
				class="filter-btn"
				class:active={filterType === f.value}
				onclick={() => filterType = f.value}
			>
				{f.label}
			</button>
		{/each}
	</div>

	<!-- Tableau des envois -->
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Utilisateur</th>
					<th>Type template</th>
					<th>Date</th>
					<th>Statut</th>
				</tr>
			</thead>
			<tbody>
				{#each filteredLogs as log}
					<tr>
						<td class="phone">{maskPhone(log.phoneNumber)}</td>
						<td>
							<span class="type-badge type-{log.type.toLowerCase()}">{typeLabel[log.type] ?? log.type}</span>
						</td>
						<td class="muted">
							{new Date(log.sentAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
						</td>
						<td>
							<span class="status-badge status-{log.status.toLowerCase()}">{statusLabel[log.status] ?? log.status}</span>
						</td>
					</tr>
				{/each}
				{#if filteredLogs.length === 0}
					<tr>
						<td colspan="4" class="empty">Aucun envoi pour ce filtre.</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>

<style>
	.page { max-width: 860px; }

	.page-header {
		display: flex;
		align-items: baseline;
		gap: 1.5rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}

	h1 { font-size: 1.5rem; font-weight: 700; }

	.global-counter {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 0.3rem 0.75rem;
		font-size: 0.875rem;
	}

	.counter-sent { font-weight: 700; color: #2b9964; font-size: 1.1rem; }
	.counter-sep { color: var(--color-text-muted); }
	.counter-cap { color: var(--color-text-muted); }

	/* ── Filtres ─────────────────────────────────────── */
	.filters {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.filter-btn {
		padding: 0.35rem 0.875rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 600;
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text-muted);
		transition: background 0.12s, color 0.12s, border-color 0.12s;
	}

	.filter-btn:hover { background: var(--color-bg-subtle); color: var(--color-text); }

	.filter-btn.active {
		background: #2b9964;
		color: #fff;
		border-color: #2b9964;
	}

	/* ── Tableau ─────────────────────────────────────── */
	.table-wrap {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	table { width: 100%; border-collapse: collapse; }

	thead th {
		background: var(--color-bg-subtle);
		padding: 0.75rem 1rem;
		text-align: left;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid var(--color-border);
	}

	tbody td {
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}

	tbody tr:last-child td { border-bottom: none; }
	tbody tr:hover { background: var(--color-bg-subtle); }

	.phone { font-family: monospace; font-size: 0.82rem; color: var(--color-text); }
	.muted { color: var(--color-text-muted); font-size: 0.8rem; }

	.empty {
		text-align: center;
		color: var(--color-text-muted);
		padding: 2rem 1rem !important;
		font-size: 0.875rem;
	}

	/* ── Badges type ──────────────────────────────────── */
	.type-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.03em;
	}

	.type-relance { background: var(--color-green-light); color: var(--color-green-dark); }
	.type-match_parfait { background: #dbeafe; color: #1e40af; }
	.type-nudge_premium { background: var(--color-yellow-light); color: var(--color-yellow-dark); }

	/* ── Badges statut ────────────────────────────────── */
	.status-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.03em;
	}

	.status-read { background: var(--color-green-light); color: var(--color-green-dark); }
	.status-delivered { background: #e0f2fe; color: #0369a1; }
	.status-sent { background: #f3f4f6; color: #6b7280; }
	.status-failed { background: #fee2e2; color: #991b1b; }
</style>
