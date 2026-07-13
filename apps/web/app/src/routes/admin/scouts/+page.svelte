<script lang="ts">
	import type { PageData } from './$types.js';
	import type { Scout } from '$lib/types.js';
	import { adminApi } from '$lib/api.js';

	let { data }: { data: PageData } = $props();

	let scouts = $state<Scout[]>(data.scouts);

	let filterZone = $state('');
	let filterStatus = $state('');

	const filtered = $derived(scouts.filter(s => {
		if (filterZone && !s.zone.toLowerCase().includes(filterZone.toLowerCase())) return false;
		if (filterStatus === 'active' && !s.isActive) return false;
		if (filterStatus === 'inactive' && s.isActive) return false;
		return true;
	}));

	const totalCaptures = $derived(filtered.reduce((sum, s) => sum + s.totalCaptures, 0));
	const totalEarned = $derived(filtered.reduce((sum, s) => sum + s.totalEarned, 0));

	function formatFcfa(amount: number) {
		return amount.toLocaleString('fr-FR') + ' FCFA';
	}

	// ── Création ────────────────────────────────────────────────────────────
	let showCreate = $state(false);
	let createName = $state('');
	let createPhone = $state('');
	let createZone = $state('');
	let creating = $state(false);
	let toast = $state<{ msg: string; ok: boolean } | null>(null);

	function openCreate() {
		createName = '';
		createPhone = '';
		createZone = '';
		showCreate = true;
	}

	async function submitCreate() {
		if (!createName.trim() || !createPhone.trim() || !createZone.trim()) return;
		creating = true;
		try {
			const created = await adminApi.createScout({
				name: createName.trim(),
				phone: createPhone.trim(),
				zone: createZone.trim(),
			});
			scouts = [created, ...scouts];
			showCreate = false;
			toast = { msg: 'Scout créé avec succès.', ok: true };
		} catch (e) {
			toast = { msg: String(e), ok: false };
		} finally {
			creating = false;
			setTimeout(() => (toast = null), 3500);
		}
	}
</script>

<!-- Toast -->
{#if toast}
	<div class="toast toast-{toast.ok ? 'ok' : 'err'}">{toast.msg}</div>
{/if}

<!-- Modal création -->
{#if showCreate}
	<div class="overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-header">
				<h2>Nouveau scout</h2>
				<button class="btn-close" onclick={() => (showCreate = false)} aria-label="Fermer">✕</button>
			</div>
			<div class="modal-body">
				<label class="field-label" for="c-name">Nom complet</label>
				<input id="c-name" class="field-input" type="text" placeholder="Ex : Moussa Traoré" bind:value={createName} />

				<label class="field-label" for="c-phone">Téléphone WhatsApp</label>
				<input id="c-phone" class="field-input" type="tel" placeholder="+226 70 00 00 00" bind:value={createPhone} />

				<label class="field-label" for="c-zone">Zone d'activité</label>
				<input id="c-zone" class="field-input" type="text" placeholder="Ex : Ouagadougou Centre" bind:value={createZone} />
			</div>
			<div class="modal-footer">
				<button class="btn-secondary" onclick={() => (showCreate = false)}>Annuler</button>
				<button
					class="btn-primary"
					onclick={submitCreate}
					disabled={creating || !createName.trim() || !createPhone.trim() || !createZone.trim()}
				>
					{creating ? 'Création…' : 'Créer le scout'}
				</button>
			</div>
		</div>
	</div>
{/if}

<div class="page">
	<div class="page-header">
		<h1>Scouts</h1>
		<div class="header-right">
			<div class="header-stats">
				<span class="stat-chip">{filtered.length} scout{filtered.length !== 1 ? 's' : ''}</span>
				<span class="stat-chip">{totalCaptures} captures</span>
				<span class="stat-chip">{formatFcfa(totalEarned)}</span>
			</div>
			<button class="btn-create" onclick={openCreate}>+ Nouveau scout</button>
		</div>
	</div>

	<div class="filters">
		<input
			class="filter-input"
			type="text"
			placeholder="Filtrer par zone…"
			bind:value={filterZone}
		/>
		<select class="filter-select" bind:value={filterStatus}>
			<option value="">Tous les statuts</option>
			<option value="active">Actif</option>
			<option value="inactive">Inactif</option>
		</select>
		{#if filterZone || filterStatus}
			<button class="btn-reset" onclick={() => { filterZone = ''; filterStatus = ''; }}>
				✕ Réinitialiser
			</button>
		{/if}
	</div>

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Nom</th>
					<th>Téléphone</th>
					<th>Zone</th>
					<th>Captures</th>
					<th>Gains totaux</th>
					<th>Inscrit le</th>
					<th>Statut</th>
					<th>Détail</th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as s}
					<tr>
						<td class="name-cell">
							<span class="dot dot-{s.isActive ? 'ok' : 'off'}"></span>
							{s.name}
						</td>
						<td class="muted">{s.phone}</td>
						<td><span class="zone-pill">{s.zone}</span></td>
						<td class="num">{s.totalCaptures}</td>
						<td class="num">{formatFcfa(s.totalEarned)}</td>
						<td class="muted">
							{new Date(s.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'short' })}
						</td>
						<td>
							<span class="badge badge-{s.isActive ? 'active' : 'inactive'}">
								{s.isActive ? 'Actif' : 'Inactif'}
							</span>
						</td>
						<td>
							<a class="btn-detail" href="/admin/scouts/{s.id}">Voir →</a>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="8" class="empty">Aucun scout trouvé.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.page { max-width: 1100px; }

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}
	.page-header h1 { font-size: 1.5rem; font-weight: 700; margin: 0; }

	.header-right {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.header-stats {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.btn-create {
		padding: 0.45rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.85rem;
		font-weight: 600;
		border: none;
		background: #2b9964;
		color: #fff;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn-create:hover { background: var(--color-green-dark); }
	.stat-chip {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.7rem;
		border-radius: var(--radius-sm);
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
		color: var(--color-text-muted);
	}

	.filters {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin-bottom: 1.25rem;
	}

	.filter-input, .filter-select {
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		background: var(--color-bg);
		color: var(--color-text);
	}
	.filter-input { width: 220px; }

	.btn-reset {
		padding: 0.4rem 0.75rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 600;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
	}
	.btn-reset:hover { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }

	/* ── Table ── */
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

	.name-cell { display: flex; align-items: center; gap: 0.6rem; font-weight: 600; }

	.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
	.dot-ok  { background: #2b9964; }
	.dot-off { background: #9ca3af; }

	.zone-pill {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		background: #e0f2fe;
		color: #0369a1;
		white-space: nowrap;
	}

	.muted { color: var(--color-text-muted); font-size: 0.8rem; }
	.num { text-align: right; font-weight: 600; padding-right: 1.5rem; }

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

	.btn-detail {
		display: inline-block;
		padding: 0.3rem 0.7rem;
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		font-weight: 600;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text);
		text-decoration: none;
		transition: background 0.12s;
	}
	.btn-detail:hover { background: var(--color-bg-subtle); }

	.empty {
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		padding: 2rem;
	}

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
	.modal-body {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.modal-footer {
		padding: 0.75rem 1.25rem 1rem;
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		border-top: 1px solid var(--color-border);
	}

	.field-label { font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); }
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
	.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

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
