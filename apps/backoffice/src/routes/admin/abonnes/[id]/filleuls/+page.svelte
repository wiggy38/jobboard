<script lang="ts">
	import type { PageData } from './$types.js';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();
	let u = $derived(data.user);
	let referrals = $derived(data.referrals);

	function formatDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('fr-FR', { dateStyle: 'medium' });
	}

	function goReferralsPage(p: number) {
		goto(`/admin/abonnes/${u.id}/filleuls?page=${p}`);
	}
</script>

<div class="section">
	<h2 class="section-title">Filleuls ({referrals.total})</h2>

	{#if referrals.data.length === 0}
		<p class="empty">Aucun inscrit via le code de parrainage de cet abonné pour l'instant.</p>
	{:else}
		<table class="inner-table">
			<thead>
				<tr>
					<th>Téléphone / Nom</th>
					<th>Inscrit le</th>
					<th>Profil</th>
					<th>Abonnement</th>
				</tr>
			</thead>
			<tbody>
				{#each referrals.data as r}
					<tr onclick={() => goto(`/admin/abonnes/${r.id}`)} class="clickable-row">
						<td>{r.displayName ?? r.phone}</td>
						<td class="muted">{formatDate(r.createdAt)}</td>
						<td>
							{#if r.profileCompleted}
								<span class="badge badge-profile-yes">Complet</span>
							{:else}
								<span class="badge badge-profile-no">Incomplet</span>
							{/if}
						</td>
						<td>
							{#if r.subscribedPlan}
								<span class="badge badge-plan-{r.subscribedPlan.toLowerCase()}">{r.subscribedPlan}</span>
								<span class="muted"> — {formatDate(r.subscribedAt)}</span>
							{:else}
								<span class="badge badge-profile-no">Aucun</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="pagination">
			<button disabled={referrals.page <= 1} onclick={() => goReferralsPage(referrals.page - 1)}>
				← Précédent
			</button>
			<span class="pagination-info">
				Page <strong>{referrals.page}</strong> / {referrals.totalPages}
			</span>
			<button
				disabled={referrals.page >= referrals.totalPages}
				onclick={() => goReferralsPage(referrals.page + 1)}
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

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.badge-profile-yes { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-profile-no { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-plan-freemium { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-plan-premium { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-plan-elite { background: #ede9fe; color: #6d28d9; }

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

	.empty { color: var(--color-text-muted); font-size: 0.875rem; margin: 0; }
</style>
