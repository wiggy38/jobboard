<script lang="ts">
	import type { PageData } from './$types.js';
	import { goto } from '$app/navigation';
	import { adminApi } from '$lib/api.js';
	import RichEditor from '../../../components/RichEditor.svelte';

	let { data }: { data: PageData } = $props();

	let source = $state(data.filters.source ?? '');
	let date = $state(data.filters.date ?? '');
	let status = $state(data.filters.status ?? '');
	let sector = $state(data.filters.sector ?? '');
	let score = $state(data.filters.score ?? '');
	let title = $state(data.filters.title ?? '');

	let titleDebounce: ReturnType<typeof setTimeout> | null = null;

	// ── Toast ─────────────────────────────────────────────────────────────
	let toast = $state<{ msg: string; ok: boolean } | null>(null);

	function showToast(msg: string, ok: boolean) {
		toast = { msg, ok };
		setTimeout(() => { toast = null; }, 4000);
	}

	// ── Create offer modal ────────────────────────────────────────────────
	let showCreate = $state(false);
	let creating = $state(false);
	let createForm = $state({
		title: '', organization: '', city: '', sector: '', level: '',
		contractType: 'CDI', country: 'BF', description: '', requirements: '',
		contactEmail: '', contactPhone: '', applicationUrl: '', deadline: '',
		isSponsored: false, status: 'ACTIVE',
	});

	function openCreate() {
		createForm = {
			title: '', organization: '', city: '', sector: '', level: '',
			contractType: 'CDI', country: 'BF', description: '', requirements: '',
			contactEmail: '', contactPhone: '', applicationUrl: '', deadline: '',
			isSponsored: false, status: 'ACTIVE',
		};
		showCreate = true;
	}

	async function submitCreate() {
		if (!createForm.title.trim() || !createForm.organization.trim()) {
			showToast('Titre et organisation sont requis.', false);
			return;
		}
		creating = true;
		try {
			const res = await adminApi.createOffer({
				title: createForm.title.trim(),
				organization: createForm.organization.trim(),
				city: createForm.city || undefined,
				sector: createForm.sector || undefined,
				level: createForm.level || undefined,
				contractType: createForm.contractType || undefined,
				country: createForm.country || 'BF',
				description: createForm.description || undefined,
				requirements: createForm.requirements || undefined,
				contactEmail: createForm.contactEmail || undefined,
				contactPhone: createForm.contactPhone || undefined,
				applicationUrl: createForm.applicationUrl || undefined,
				deadline: createForm.deadline || null,
				isSponsored: createForm.isSponsored,
				status: createForm.status,
			});
			showCreate = false;
			showToast('Offre créée avec succès', true);
			goto(`/admin/offres/${res.id}`);
		} catch (err: any) {
			showToast(err?.message ?? 'Erreur lors de la création', false);
		} finally {
			creating = false;
		}
	}

	function buildParams(page = 1) {
		const p = new URLSearchParams();
		p.set('page', String(page));
		if (source) p.set('source', source);
		if (date) p.set('date', date);
		if (status) p.set('status', status);
		if (sector) p.set('sector', sector);
		if (score) p.set('score', score);
		if (title) p.set('title', title);
		return p.toString();
	}

	function applyFilters() {
		goto(`/admin/offres?${buildParams(1)}`);
	}

	function onTitleInput() {
		if (titleDebounce) clearTimeout(titleDebounce);
		titleDebounce = setTimeout(
			() => goto(`/admin/offres?${buildParams(1)}`, { keepFocus: true, noScroll: true }),
			300
		);
	}

	function resetFilters() {
		source = '';
		date = '';
		status = '';
		sector = '';
		score = '';
		title = '';
		goto('/admin/offres?page=1');
	}

	function goPage(p: number) {
		goto(`/admin/offres?${buildParams(p)}`);
	}

	const hasFilters = $derived(
		source !== '' || date !== '' || status !== '' || sector !== '' || score !== '' || title !== ''
	);
</script>

<div class="page">
	<div class="page-header">
		<h1>Offres d'emploi</h1>
		<button class="btn-create" onclick={openCreate}>+ Nouvelle offre</button>
	</div>

	{#if data.error}
		<div class="api-error">⚠ API error (données mock affichées) : <code>{data.error}</code></div>
	{/if}

	<div class="filters">
		<div class="filter-row">
			<label class="filter-field filter-field--title">
				<span>Recherche par titre</span>
				<input
					type="search"
					placeholder="Ex : développeur, comptable…"
					bind:value={title}
					oninput={onTitleInput}
				/>
			</label>

			<label class="filter-field">
				<span>Source</span>
				<select bind:value={source}>
					<option value="">Toutes</option>
					{#each data.scrapers as s}
						<option value={s.id}>{s.name}</option>
					{/each}
				</select>
			</label>

			<label class="filter-field">
				<span>Inséré le</span>
				<input type="date" bind:value={date} />
			</label>

			<label class="filter-field">
				<span>Statut</span>
				<select bind:value={status}>
					<option value="">Tous</option>
					<option value="PENDING">Pending</option>
					<option value="ACTIVE">Active</option>
					<option value="EXPIRED">Expired</option>
					<option value="ARCHIVED">Archived</option>
				</select>
			</label>

			<label class="filter-field">
				<span>Secteur</span>
				<input type="text" placeholder="ex: Informatique" bind:value={sector} />
			</label>

			<label class="filter-field">
				<span>Score min (%)</span>
				<input type="number" min="0" max="100" placeholder="0" bind:value={score} />
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
		{data.total} offre{data.total !== 1 ? 's' : ''} trouvée{data.total !== 1 ? 's' : ''}
	</div>

	<table>
		<thead>
			<tr>
				<th>Titre</th>
				<th>Ville</th>
				<th>Secteur</th>
				<th>Délai</th>
				<th>Statut</th>
				<th>Score</th>
			</tr>
		</thead>
		<tbody>
			{#each data.offers as offer}
				<tr onclick={() => goto(`/admin/offres/${offer.id}`)} class="clickable">
					<td class="title">{offer.title}</td>
					<td class="city">{offer.city}</td>
					<td>{offer.sector}</td>
					<td class="deadline">{offer.deadline ? new Date(offer.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
					<td>
						<span class="badge badge-{offer.status.toLowerCase()}">
							{offer.status}
						</span>
					</td>
					<td>{(offer.scoreConfidence * 100).toFixed(0)}%</td>
				</tr>
			{/each}
			{#if data.offers.length === 0}
				<tr><td colspan="6" class="empty">Aucune offre trouvée.</td></tr>
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
			{data.total} offre{data.total !== 1 ? 's' : ''} au total
		</span>
		<button disabled={data.page >= data.totalPages} onclick={() => goPage(data.page + 1)}>Suivant →</button>
	</div>
</div>

{#if toast}
	<div class="toast" class:toast-ok={toast.ok} class:toast-err={!toast.ok}>{toast.msg}</div>
{/if}

{#if showCreate}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => { if (!creating) showCreate = false; }}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Nouvelle offre</h2>
				<button class="modal-close" onclick={() => { if (!creating) showCreate = false; }}>✕</button>
			</div>

			<div class="modal-body">
				<div class="form-section-title">Informations principales</div>
				<div class="form-grid">
					<label class="form-field form-field--full">
						<span>Titre <span class="required">*</span></span>
						<input type="text" bind:value={createForm.title} placeholder="Ex : Développeur fullstack" />
					</label>
					<label class="form-field form-field--full">
						<span>Organisation <span class="required">*</span></span>
						<input type="text" bind:value={createForm.organization} placeholder="Ex : ANPE Burkina" />
					</label>
					<label class="form-field">
						<span>Ville</span>
						<input type="text" bind:value={createForm.city} placeholder="Ex : Ouagadougou" />
					</label>
					<label class="form-field">
						<span>Pays</span>
						<select bind:value={createForm.country}>
							<option value="BF">Burkina Faso</option>
							<option value="CI">Côte d'Ivoire</option>
							<option value="SN">Sénégal</option>
							<option value="ML">Mali</option>
							<option value="GN">Guinée</option>
						</select>
					</label>
					<label class="form-field">
						<span>Secteur</span>
						<input type="text" bind:value={createForm.sector} placeholder="Ex : Informatique" />
					</label>
					<label class="form-field">
						<span>Niveau</span>
						<input type="text" bind:value={createForm.level} placeholder="Ex : Junior, Senior" />
					</label>
					<label class="form-field">
						<span>Type de contrat</span>
						<select bind:value={createForm.contractType}>
							<option value="CDI">CDI</option>
							<option value="CDD">CDD</option>
							<option value="STAGE">Stage</option>
							<option value="ALTERNANCE">Alternance</option>
							<option value="FREELANCE">Freelance</option>
							<option value="BENEVOLE">Bénévolat</option>
							<option value="AUTRE">Autre</option>
						</select>
					</label>
					<label class="form-field">
						<span>Statut initial</span>
						<select bind:value={createForm.status}>
							<option value="ACTIVE">Active</option>
							<option value="PENDING">Pending</option>
						</select>
					</label>
					<label class="form-field">
						<span>Date limite</span>
						<input type="date" bind:value={createForm.deadline} />
					</label>
				</div>

				<div class="form-section-title">Description</div>
				<div class="form-field form-field--full">
					<span>Description</span>
					<RichEditor bind:value={createForm.description} placeholder="Description du poste…" />
				</div>
				<div class="form-field form-field--full">
					<span>Prérequis</span>
					<RichEditor bind:value={createForm.requirements} placeholder="Compétences et expériences requises…" />
				</div>

				<div class="form-section-title">Contact</div>
				<div class="form-grid">
					<label class="form-field">
						<span>Email contact</span>
						<input type="email" bind:value={createForm.contactEmail} placeholder="recrutement@org.bf" />
					</label>
					<label class="form-field">
						<span>Téléphone contact</span>
						<input type="tel" bind:value={createForm.contactPhone} placeholder="+226 XX XX XX XX" />
					</label>
					<label class="form-field form-field--full">
						<span>URL candidature</span>
						<input type="url" bind:value={createForm.applicationUrl} placeholder="https://…" />
					</label>
				</div>

				<div class="form-grid form-grid--flags">
					<label class="form-checkbox">
						<input type="checkbox" bind:checked={createForm.isSponsored} />
						<span>Offre sponsorisée</span>
					</label>
				</div>
			</div>

			<div class="modal-footer">
				<button type="button" class="btn-cancel" onclick={() => { if (!creating) showCreate = false; }} disabled={creating}>
					Annuler
				</button>
				<button type="button" class="btn-save" class:btn-save--loading={creating} onclick={submitCreate} disabled={creating}>
					{#if creating}
						<span class="btn-spinner"></span>Enregistrement…
					{:else}
						Enregistrer
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.page { max-width: 1100px; }

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
	}

	/* Filters */
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

	.filter-field--title {
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

	/* Table */
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

	td.title { font-weight: 500; color: var(--color-text); max-width: 280px; }
	td.city { width: 140px; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	td.deadline { width: 120px; white-space: nowrap; color: var(--color-text-muted); }
	td.empty { text-align: center; color: var(--color-text-muted); padding: 2rem; }

	.tag {
		background: var(--color-green-light);
		color: var(--color-green-dark);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
	}

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.badge-active { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-pending { background: #fef9c3; color: #854d0e; }
	.badge-expired { background: #f3f4f6; color: var(--color-text-muted); }
	.badge-archived { background: #fee2e2; color: #991b1b; }

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

	/* Page header */
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}
	.page-header h1 { margin-bottom: 0; }

	.btn-create {
		background: var(--color-green);
		color: #fff;
		border: none;
		padding: 0.5rem 1.2rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s, transform 0.1s;
		white-space: nowrap;
	}
	.btn-create:hover { opacity: 0.88; }
	.btn-create:active { transform: scale(0.93); }

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		padding: 1rem;
	}

	.modal {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 680px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0,0,0,0.2);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}
	.modal-header h2 {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0;
	}
	.modal-close {
		background: none;
		border: none;
		font-size: 1rem;
		cursor: pointer;
		color: var(--color-text-muted);
		padding: 0.2rem 0.5rem;
		border-radius: var(--radius-sm);
		transition: background 0.15s;
	}
	.modal-close:hover { background: var(--color-bg-subtle); }

	.modal-body {
		overflow-y: auto;
		padding: 1.25rem;
		flex: 1;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.form-section-title {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		margin: 1.2rem 0 0.6rem;
	}
	.form-section-title:first-child { margin-top: 0; }

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.form-grid--flags { margin-top: 0.75rem; }

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.form-field--full { grid-column: 1 / -1; }

	.form-field span {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}
	.required { color: #ef4444; }

	.form-field input,
	.form-field select {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg-subtle);
		color: var(--color-text);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s;
		font-family: inherit;
	}
	.form-field input:focus,
	.form-field select:focus { border-color: var(--color-green-mid); }

	.form-checkbox {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		cursor: pointer;
	}
	.form-checkbox input { width: 1rem; height: 1rem; cursor: pointer; }

	.btn-cancel {
		background: var(--color-bg-subtle);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		padding: 0.45rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-cancel:hover:not(:disabled) { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
	.btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

	.btn-save {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--color-green);
		color: #fff;
		border: none;
		padding: 0.45rem 1.2rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s, transform 0.1s, box-shadow 0.1s;
		position: relative;
		overflow: hidden;
	}
	.btn-save:hover:not(:disabled) { opacity: 0.9; }
	.btn-save:active:not(:disabled) {
		transform: scale(0.95);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-green) 35%, transparent);
	}
	.btn-save:disabled { opacity: 0.65; cursor: not-allowed; }
	.btn-save--loading { animation: btn-pulse 1.2s ease-in-out infinite; }

	@keyframes btn-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.btn-spinner {
		display: inline-block;
		width: 0.85rem;
		height: 0.85rem;
		border: 2px solid rgba(255,255,255,0.35);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.65s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Toast */
	.toast {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 300;
		padding: 0.65rem 1.1rem;
		border-radius: var(--radius-lg);
		font-size: 0.875rem;
		font-weight: 600;
		box-shadow: 0 4px 16px rgba(0,0,0,0.15);
		animation: toast-in 0.2s ease;
		max-width: 320px;
	}
	.toast-ok { background: var(--color-green); color: #fff; }
	.toast-err { background: #ef4444; color: #fff; }

	@keyframes toast-in {
		from { opacity: 0; transform: translateY(10px); }
		to   { opacity: 1; transform: translateY(0); }
	}
</style>
