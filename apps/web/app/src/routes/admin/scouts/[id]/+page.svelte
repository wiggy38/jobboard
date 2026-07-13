<script lang="ts">
	import type { PageData } from './$types.js';
	import { adminApi } from '$lib/api.js';

	let { data }: { data: PageData } = $props();
	let s = $derived(data.scout);

	// Edit modal
	let showEdit = $state(false);
	let editZone = $state('');
	let editActive = $state(true);
	let saving = $state(false);
	let toast = $state<{ msg: string; ok: boolean } | null>(null);

	function openEdit() {
		editZone = s.zone;
		editActive = s.isActive;
		showEdit = true;
	}

	async function saveEdit() {
		saving = true;
		try {
			await adminApi.updateScout(s.id, { zone: editZone, isActive: editActive });
			showEdit = false;
			toast = { msg: 'Scout mis à jour.', ok: true };
		} catch (e) {
			toast = { msg: String(e), ok: false };
		} finally {
			saving = false;
			setTimeout(() => (toast = null), 3500);
		}
	}

	function formatFcfa(n: number) {
		return n.toLocaleString('fr-FR') + ' FCFA';
	}

	const jobStatusLabel: Record<string, string> = {
		PENDING: 'En attente',
		ACTIVE: 'Active',
		EXPIRED: 'Expirée',
		ARCHIVED: 'Archivée',
	};
</script>

<!-- Toast -->
{#if toast}
	<div class="toast toast-{toast.ok ? 'ok' : 'err'}">{toast.msg}</div>
{/if}

<!-- Edit modal -->
{#if showEdit}
	<div class="overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-header">
				<h2>Modifier le scout</h2>
				<button class="btn-close" onclick={() => (showEdit = false)} aria-label="Fermer">✕</button>
			</div>
			<div class="modal-body">
				<label class="field-label" for="zone">Zone</label>
				<input id="zone" class="field-input" type="text" bind:value={editZone} />

				<label class="field-label" style="margin-top:1rem;">Statut</label>
				<div class="radio-row">
					<label class="radio-opt">
						<input type="radio" name="status" value={true} bind:group={editActive} />
						Actif
					</label>
					<label class="radio-opt">
						<input type="radio" name="status" value={false} bind:group={editActive} />
						Inactif
					</label>
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-secondary" onclick={() => (showEdit = false)}>Annuler</button>
				<button class="btn-primary" onclick={saveEdit} disabled={saving}>
					{saving ? 'Enregistrement…' : 'Enregistrer'}
				</button>
			</div>
		</div>
	</div>
{/if}

<div class="page">
	<a class="back" href="/admin/scouts">← Scouts</a>

	<div class="page-header">
		<div class="title-row">
			<h1>{s.name}</h1>
			<span class="badge badge-{s.isActive ? 'active' : 'inactive'}">
				{s.isActive ? 'Actif' : 'Inactif'}
			</span>
		</div>
		<button class="btn-edit" onclick={openEdit}>Modifier</button>
	</div>

	<!-- Stats -->
	<div class="stats-row">
		<div class="stat-card">
			<span class="stat-value">{s.totalCaptures}</span>
			<span class="stat-label">Captures</span>
		</div>
		<div class="stat-card stat-green">
			<span class="stat-value">{formatFcfa(s.totalEarned)}</span>
			<span class="stat-label">Gains totaux</span>
		</div>
		<div class="stat-card">
			<span class="stat-value">{s.payments.length}</span>
			<span class="stat-label">Paiements</span>
		</div>
	</div>

	<div class="grid">
		<!-- Info -->
		<div class="section">
			<h2 class="section-title">Informations</h2>
			<dl class="info-list">
				<dt>Téléphone</dt>
				<dd>{s.phone}</dd>
				<dt>Zone</dt>
				<dd>{s.zone}</dd>
				<dt>Inscrit le</dt>
				<dd>{new Date(s.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</dd>
				<dt>Mis à jour</dt>
				<dd>{new Date(s.updatedAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</dd>
			</dl>
		</div>

		<!-- Payments -->
		<div class="section">
			<h2 class="section-title">Paiements</h2>
			{#if s.payments.length === 0}
				<p class="empty">Aucun paiement enregistré.</p>
			{:else}
				<table class="inner-table">
					<thead>
						<tr>
							<th>Mois</th>
							<th>Montant</th>
							<th>Date</th>
						</tr>
					</thead>
					<tbody>
						{#each s.payments as p}
							<tr>
								<td>{p.month}</td>
								<td class="num">{formatFcfa(p.amount)}</td>
								<td class="muted">{new Date(p.paidAt).toLocaleDateString('fr-FR', { dateStyle: 'short' })}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</div>

	<!-- Submissions -->
	<div class="section" style="margin-top: 1.5rem;">
		<h2 class="section-title">Offres collectées ({s.submissions.length})</h2>
		{#if s.submissions.length === 0}
			<p class="empty">Aucune offre soumise.</p>
		{:else}
			<table class="inner-table">
				<thead>
					<tr>
						<th>Titre</th>
						<th>Organisation</th>
						<th>Ville</th>
						<th>Statut</th>
						<th>Date</th>
					</tr>
				</thead>
				<tbody>
					{#each s.submissions as sub}
						<tr>
							<td class="fw">{sub.title}</td>
							<td class="muted">{sub.organization}</td>
							<td class="muted">{sub.city}</td>
							<td>
								<span class="badge badge-status-{sub.status.toLowerCase()}">
									{jobStatusLabel[sub.status] ?? sub.status}
								</span>
							</td>
							<td class="muted">{new Date(sub.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'short' })}</td>
						</tr>
					{/each}
				</tbody>
			</table>
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
	.title-row { display: flex; align-items: center; gap: 0.75rem; }
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
	}
	.btn-edit:hover { background: var(--color-border); }

	/* ── Stats ── */
	.stats-row {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.stat-card {
		flex: 1;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.stat-value { font-size: 1.5rem; font-weight: 700; }
	.stat-label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
	.stat-green .stat-value { color: #2b9964; }

	/* ── Grid ── */
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}

	/* ── Section card ── */
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

	/* ── Info list ── */
	.info-list {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem 1rem;
		margin: 0;
	}
	dt { font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; padding-top: 1px; }
	dd { font-size: 0.875rem; margin: 0; }

	/* ── Inner tables ── */
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
	.fw { font-weight: 600; }

	/* ── Badges ── */
	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.badge-active   { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-inactive { background: #f3f4f6; color: #6b7280; }
	.badge-status-active   { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-status-pending  { background: #fef9c3; color: #854d0e; }
	.badge-status-expired  { background: #fee2e2; color: #991b1b; }
	.badge-status-archived { background: #f3f4f6; color: #6b7280; }

	.empty { color: var(--color-text-muted); font-size: 0.875rem; margin: 0; }

	/* ── Modal ── */
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
	.radio-row { display: flex; gap: 1.5rem; }
	.radio-opt { display: flex; align-items: center; gap: 0.4rem; font-size: 0.875rem; cursor: pointer; }

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

	/* ── Toast ── */
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
