<script lang="ts">
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
	const runs = $derived(data.history.runs);
	const sourceName = $derived(data.history.source.name);

	const runStatusLabel: Record<string, string> = {
		SUCCESS: 'Succès',
		ERROR: 'Erreur',
		SKIPPED: 'Ignoré',
	};

	function formatDuration(ms: number) {
		return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
	}
</script>

<div class="page">
	<a class="back" href="/admin/scrapers">← Scrapers</a>

	<div class="page-header">
		<h1>Historique — {sourceName}</h1>
	</div>

	{#if runs.length === 0}
		<p class="empty">Aucun run enregistré pour ce scraper.</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Date / heure</th>
						<th>Statut</th>
						<th>Scrapées</th>
						<th>Importées</th>
						<th>Doublons</th>
						<th>Expirées</th>
						<th>Erreurs</th>
						<th>Durée</th>
					</tr>
				</thead>
				<tbody>
					{#each runs as r}
						<tr>
							<td class="muted">{new Date(r.startedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
							<td>
								<span class="badge badge-{r.status}">{runStatusLabel[r.status] ?? r.status}</span>
								{#if r.errorMessage}
									<span class="err-hint" title={r.errorMessage}>⚠</span>
								{/if}
							</td>
							<td class="num">{r.totalScraped}</td>
							<td class="num">{r.totalInserted}</td>
							<td class="num">{r.totalDuplicates}</td>
							<td class="num">{r.totalExpired}</td>
							<td class="num {r.totalErrors > 0 ? 'num-warn' : ''}">{r.totalErrors}</td>
							<td class="muted">{formatDuration(r.duration)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.page { max-width: 1100px; }

	.back {
		display: inline-block;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		text-decoration: none;
		margin-bottom: 1.25rem;
	}
	.back:hover { color: var(--color-text); }

	.page-header { margin-bottom: 1.5rem; }
	h1 { font-size: 1.5rem; font-weight: 700; margin: 0; }

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9rem;
	}

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

	.muted { color: var(--color-text-muted); font-size: 0.8rem; }
	.num { text-align: center; font-weight: 600; }
	.num-warn { color: #b45309; }

	.err-hint { font-size: 0.75rem; cursor: help; margin-left: 4px; }

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.badge-SUCCESS { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-ERROR { background: #fee2e2; color: #991b1b; }
	.badge-SKIPPED { background: var(--color-yellow-light); color: var(--color-yellow-dark); }
</style>
