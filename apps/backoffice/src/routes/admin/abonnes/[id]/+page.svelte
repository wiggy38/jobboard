<script lang="ts">
	import type { PageData } from './$types.js';
	import { adminApi } from '$lib/api.js';
	import { invalidateAll, goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();
	let u = $derived(data.user);

	let pullHistory = $state(data.pullHistory);
	let expandedPulls = $state<Set<string>>(new Set());
	let pullHistoryLoading = $state(false);

	function togglePull(id: string) {
		const next = new Set(expandedPulls);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedPulls = next;
	}

	async function goPullHistoryPage(p: number) {
		pullHistoryLoading = true;
		try {
			pullHistory = await adminApi.getUserPullHistory(u.id, p);
			expandedPulls = new Set();
		} finally {
			pullHistoryLoading = false;
		}
	}

	function formatDateTime(d: string) {
		return new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
	}

	let showExtend = $state(false);
	let extendDays = $state(30);
	let extending = $state(false);
	let toast = $state<{ msg: string; ok: boolean } | null>(null);

	function openExtend() {
		extendDays = 30;
		showExtend = true;
	}

	async function confirmExtend() {
		if (!extendDays || extendDays <= 0) {
			toast = { msg: 'Le nombre de jours doit être positif.', ok: false };
			setTimeout(() => (toast = null), 3500);
			return;
		}
		extending = true;
		try {
			await adminApi.extendSubscription(u.id, extendDays);
			showExtend = false;
			toast = { msg: 'Abonnement prolongé.', ok: true };
			await invalidateAll();
		} catch (e) {
			toast = { msg: e instanceof Error ? e.message : String(e), ok: false };
		} finally {
			extending = false;
			setTimeout(() => (toast = null), 3500);
		}
	}

	function formatDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('fr-FR', { dateStyle: 'long' });
	}

	let channel = $derived(u.channelJoins[0] ?? null);
</script>

{#if toast}
	<div class="toast toast-{toast.ok ? 'ok' : 'err'}">{toast.msg}</div>
{/if}

{#if showExtend}
	<div class="overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-header">
				<h2>Prolonger l'abonnement</h2>
				<button class="btn-close" onclick={() => (showExtend = false)} aria-label="Fermer">✕</button>
			</div>
			<div class="modal-body">
				<label class="field-label" for="days">Nombre de jours</label>
				<input id="days" class="field-input" type="number" min="1" bind:value={extendDays} />
				<p class="hint">
					Nouvelle échéance calculée à partir de la date actuelle
					{u.planEndAt ? `(${formatDate(u.planEndAt)})` : "(aujourd'hui)"} si elle est future.
				</p>
			</div>
			<div class="modal-footer">
				<button class="btn-secondary" onclick={() => (showExtend = false)}>Annuler</button>
				<button class="btn-primary" onclick={confirmExtend} disabled={extending}>
					{extending ? 'Enregistrement…' : 'Confirmer'}
				</button>
			</div>
		</div>
	</div>
{/if}

<div class="page">
	<a class="back" href="/admin/abonnes">← Abonnés</a>

	<div class="page-header">
		<div class="title-row">
			<h1>{u.displayName ?? u.phone}</h1>
			<span class="badge badge-plan-{u.plan.toLowerCase()}">{u.plan}</span>
			<span class="badge badge-status-{u.status.toLowerCase()}">{u.status}</span>
		</div>
		<button class="btn-edit" onclick={openExtend} disabled={u.plan === 'FREEMIUM'}>
			Prolonger
		</button>
	</div>

	<div class="grid">
		<div class="section">
			<h2 class="section-title">Informations</h2>
			<dl class="info-list">
				<dt>Téléphone</dt>
				<dd>{u.phone}</dd>
				<dt>Pays</dt>
				<dd>{u.countries.join(', ')}</dd>
				<dt>Canal WhatsApp</dt>
				<dd>
					{#if !channel}
						<span class="badge badge-channel-pending">Pas encore invité</span>
					{:else if channel.joined}
						<span class="badge badge-channel-joined">✔ Rejoint le {formatDate(channel.joinedAt)}</span>
					{:else}
						<span class="badge badge-channel-pending">À relancer — invité le {formatDate(channel.invitedAt)}</span>
					{/if}
				</dd>
				<dt>Début abonnement</dt>
				<dd>{formatDate(u.planStartAt)}</dd>
				<dt>Fin abonnement</dt>
				<dd>{formatDate(u.planEndAt)}</dd>
				<dt>Inscrit le</dt>
				<dd>{formatDate(u.createdAt)}</dd>
				<dt>Code parrainage</dt>
				<dd>{u.referralCode}</dd>
				<dt>Crédits parrainage</dt>
				<dd>{u.referralCredits} jour{u.referralCredits !== 1 ? 's' : ''}</dd>
			</dl>
		</div>

		<div class="section">
			<h2 class="section-title">Profil</h2>
			{#if u.profile}
				<dl class="info-list">
					<dt>Villes</dt>
					<dd>{u.profile.cities.join(', ') || '—'}</dd>
					<dt>Secteurs</dt>
					<dd>{u.profile.sectors.join(', ') || '—'}</dd>
					<dt>Niveaux</dt>
					<dd>{u.profile.levels.join(', ') || '—'}</dd>
					<dt>Types de contrat</dt>
					<dd>{u.profile.contractTypes.join(', ') || '—'}</dd>
					<dt>Mots-clés</dt>
					<dd>{u.profile.keywords.join(', ') || '—'}</dd>
					<dt>Langue</dt>
					<dd>{u.profile.language}</dd>
				</dl>
			{:else}
				<p class="empty">Aucun profil renseigné.</p>
			{/if}
		</div>
	</div>

	<div class="section" style="margin-top: 1.5rem;">
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

	<div class="section" style="margin-top: 1.5rem;">
		<h2 class="section-title">Historique des pulls ({pullHistory.total})</h2>
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
												<th>Statut</th>
												<th>Page ouverte</th>
												<th>Source cliquée</th>
											</tr>
										</thead>
										<tbody>
											{#each pull.offers as offer}
												<tr onclick={() => goto(`/admin/offres/${offer.id}`)} class="clickable-row">
													<td>{offer.title}</td>
													<td class="muted">{offer.city}</td>
													<td class="muted">{offer.sector}</td>
													<td>
														<span class="badge badge-offer-{offer.status.toLowerCase()}">{offer.status}</span>
													</td>
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
					disabled={pullHistory.page <= 1 || pullHistoryLoading}
					onclick={() => goPullHistoryPage(pullHistory.page - 1)}
				>
					← Précédent
				</button>
				<span class="pagination-info">
					Page <strong>{pullHistory.page}</strong> / {pullHistory.totalPages}
				</span>
				<button
					disabled={pullHistory.page >= pullHistory.totalPages || pullHistoryLoading}
					onclick={() => goPullHistoryPage(pullHistory.page + 1)}
				>
					Suivant →
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.page { max-width: 900px; }

	.back {
		display: inline-block;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		text-decoration: none;
		margin-bottom: 1.25rem;
	}
	.back:hover { color: var(--color-text); }

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}
	.title-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.title-row h1 { font-size: 1.5rem; font-weight: 700; margin: 0; }

	.btn-edit {
		padding: 0.4rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 600;
		border: 1px solid var(--color-border);
		background: var(--color-bg-subtle);
		color: var(--color-text);
		cursor: pointer;
		white-space: nowrap;
	}
	.btn-edit:hover:not(:disabled) { background: var(--color-border); }
	.btn-edit:disabled { opacity: 0.5; cursor: not-allowed; }

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}

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

	.info-list {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem 1rem;
		margin: 0;
	}
	dt { font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; padding-top: 1px; }
	dd { font-size: 0.875rem; margin: 0; }

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
	.num { text-align: right; font-weight: 600; }

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

	.badge-offer-active { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-offer-pending { background: #fef9c3; color: #854d0e; }
	.badge-offer-expired { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-offer-archived { background: #fee2e2; color: #991b1b; }
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
	.badge-plan-freemium { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-plan-premium { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-plan-elite { background: #ede9fe; color: #6d28d9; }
	.badge-status-active { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-status-paused { background: #fef9c3; color: #854d0e; }
	.badge-status-dormant { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-status-stopped { background: #fee2e2; color: #991b1b; }
	.badge-payment-success { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-payment-pending { background: #fef9c3; color: #854d0e; }
	.badge-payment-failed { background: #fee2e2; color: #991b1b; }
	.badge-channel-joined { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-channel-pending { background: #fef9c3; color: #854d0e; }

	.empty { color: var(--color-text-muted); font-size: 0.875rem; margin: 0; }

	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}
	.modal {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		width: 400px;
		max-width: calc(100vw - 2rem);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.1rem 1.25rem 0.9rem;
		border-bottom: 1px solid var(--color-border);
	}
	.modal-header h2 { font-size: 1rem; font-weight: 700; margin: 0; }
	.btn-close {
		background: none;
		border: none;
		font-size: 1rem;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0.2rem 0.4rem;
		border-radius: var(--radius-sm);
	}
	.btn-close:hover { background: var(--color-bg-subtle); }
	.modal-body { padding: 1.25rem; }
	.modal-footer {
		padding: 0.75rem 1.25rem 1rem;
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		border-top: 1px solid var(--color-border);
	}

	.field-label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 0.4rem; }
	.field-input {
		width: 100%;
		padding: 0.45rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		background: var(--color-bg);
		color: var(--color-text);
		box-sizing: border-box;
	}
	.hint { font-size: 0.75rem; color: var(--color-text-muted); margin: 0.6rem 0 0; }

	.btn-primary {
		background: #2b9964;
		color: #fff;
		border: none;
		border-radius: var(--radius-md);
		padding: 0.45rem 1.1rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-primary:hover:not(:disabled) { background: var(--color-green-dark); }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

	.btn-secondary {
		background: transparent;
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 0.45rem 1.1rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-secondary:hover { background: var(--color-bg-subtle); }

	.toast {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		padding: 0.75rem 1.25rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		z-index: 200;
		box-shadow: 0 4px 16px rgba(0,0,0,0.15);
	}
	.toast-ok  { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
	.toast-err { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
</style>
