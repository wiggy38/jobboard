<script lang="ts">
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
	let u = $derived(data.user);
</script>

<div class="section">
	<h2 class="section-title">Paiements ({u.payments.length})</h2>
	{#if u.payments.length === 0}
		<p class="empty">Aucun paiement enregistré.</p>
	{:else}
		<table class="inner-table">
			<thead>
				<tr>
					<th>Date</th>
					<th>Montant</th>
					<th>Fournisseur</th>
					<th>Plan acheté</th>
					<th>Durée</th>
					<th>Statut</th>
				</tr>
			</thead>
			<tbody>
				{#each u.payments as p}
					<tr>
						<td class="muted">{new Date(p.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'short' })}</td>
						<td class="num">{p.amount.toLocaleString('fr-FR')} FCFA</td>
						<td class="muted">{p.provider}</td>
						<td>{p.planPurchased}</td>
						<td class="muted">{p.durationDays} j</td>
						<td>
							<span class="badge badge-payment-{p.status.toLowerCase()}">{p.status}</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
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
	.muted { color: var(--color-text-muted); font-size: 0.8rem; }
	.num { text-align: right; font-weight: 600; }

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.badge-payment-success { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-payment-pending { background: #fef9c3; color: #854d0e; }
	.badge-payment-failed { background: #fee2e2; color: #991b1b; }

	.empty { color: var(--color-text-muted); font-size: 0.875rem; margin: 0; }
</style>
