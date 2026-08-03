<script lang="ts">
	import type { PageData } from './$types.js';
	import { adminApi } from '$lib/api.js';
	import type { JobOfferStatus } from '$lib/types.js';
	import RichEditor from '../../../../components/RichEditor.svelte';

	let { data }: { data: PageData } = $props();

	let o = $state({ ...data.offer });
	$effect(() => { o = { ...data.offer }; });
	let showEdit = $state(false);
	let saving = $state(false);
	let statusLoading = $state(false);
	let toast = $state<{ msg: string; ok: boolean } | null>(null);

	let editForm = $state(buildForm());

	function buildForm() {
		return {
			title: o.title,
			organization: o.organization,
			city: o.city,
			sector: o.sector,
			level: o.level ?? '',
			contractType: o.contractType,
			description: o.description ?? '',
			requirements: o.requirements ?? '',
			contactEmail: o.contactEmail ?? '',
			contactPhone: o.contactPhone ?? '',
			contactAddress: o.contactAddress ?? '',
			applicationUrl: o.applicationUrl ?? '',
			deadline: o.deadline ? o.deadline.substring(0, 10) : '',
			isSponsored: o.isSponsored,
			isFraudSuspect: o.isFraudSuspect,
			validated: o.validated,
			ttlDays: o.ttlDays,
		};
	}

	function openEdit() {
		editForm = buildForm();
		showEdit = true;
	}

	function showToast(msg: string, ok: boolean) {
		toast = { msg, ok };
		setTimeout(() => { toast = null; }, 3000);
	}

	async function changeStatus(status: JobOfferStatus) {
		if (statusLoading || o.status === status) return;
		statusLoading = true;
		try {
			await adminApi.updateOfferStatus(o.id, status);
			o = { ...o, status };
			showToast('Statut mis à jour', true);
		} catch {
			showToast('Erreur lors du changement de statut', false);
		} finally {
			statusLoading = false;
		}
	}

	async function saveEdit() {
		saving = true;
		try {
			await adminApi.updateOffer(o.id, {
				title: editForm.title,
				organization: editForm.organization,
				city: editForm.city,
				sector: editForm.sector,
				level: editForm.level,
				contractType: editForm.contractType as any,
				description: editForm.description || null,
				requirements: editForm.requirements || null,
				contactEmail: editForm.contactEmail || null,
				contactPhone: editForm.contactPhone || null,
				contactAddress: editForm.contactAddress || null,
				applicationUrl: editForm.applicationUrl || null,
				deadline: editForm.deadline || null,
				isSponsored: editForm.isSponsored,
				isFraudSuspect: editForm.isFraudSuspect,
				validated: editForm.validated,
				ttlDays: Number(editForm.ttlDays),
			});
			o = {
				...o,
				title: editForm.title,
				organization: editForm.organization,
				city: editForm.city,
				sector: editForm.sector,
				level: editForm.level,
				contractType: editForm.contractType as any,
				description: editForm.description || null,
				requirements: editForm.requirements || null,
				contactEmail: editForm.contactEmail || null,
				contactPhone: editForm.contactPhone || null,
				contactAddress: editForm.contactAddress || null,
				applicationUrl: editForm.applicationUrl || null,
				deadline: editForm.deadline ? editForm.deadline + 'T00:00:00.000Z' : null,
				isSponsored: editForm.isSponsored,
				isFraudSuspect: editForm.isFraudSuspect,
				validated: editForm.validated,
				ttlDays: Number(editForm.ttlDays),
			};
			showEdit = false;
			showToast('Offre modifiée avec succès', true);
		} catch (err) {
			console.error('[saveEdit]', err);
			showToast('Erreur lors de la sauvegarde', false);
		} finally {
			saving = false;
		}
	}

	const statusColor: Record<string, string> = {
		PENDING: '#f59e0b',
		ACTIVE: '#2b9964',
		EXPIRED: '#9ca3af',
		ARCHIVED: '#ef4444',
	};
	const statusLabel: Record<string, string> = {
		PENDING: 'En attente',
		ACTIVE: 'Active',
		EXPIRED: 'Expirée',
		ARCHIVED: 'Archivée',
	};

	function fmt(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
	}

	function pct(n: number): string {
		return (n * 100).toFixed(0) + '%';
	}

	const interactions = [
		{ key: 'SEEN', label: 'Vues' },
		{ key: 'UNLOCKED', label: 'Déverrouillées' },
		{ key: 'BOOKMARKED', label: 'Sauvegardées' },
		{ key: 'REPORTED_FRAUD', label: 'Signalements fraude' },
	];

	const CONTRACT_TYPES = ['CDI', 'CDD', 'STAGE', 'ALTERNANCE', 'FREELANCE', 'BENEVOLE', 'AUTRE'];
</script>

<!-- Toast -->
{#if toast}
	<div class="toast" class:toast-ok={toast.ok} class:toast-err={!toast.ok}>
		{toast.msg}
	</div>
{/if}

<!-- Edit modal -->
{#if showEdit}
	<div class="modal-backdrop" role="button" tabindex="-1" onclick={() => showEdit = false} onkeydown={(e) => e.key === 'Escape' && (showEdit = false)}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-label="Modifier l'offre">
		<div class="modal-header">
			<h2>Modifier l'offre</h2>
			<button class="btn-icon" onclick={() => showEdit = false} aria-label="Fermer">✕</button>
		</div>
		<form id="edit-form" class="modal-body" novalidate onsubmit={(e) => { e.preventDefault(); saveEdit(); }}>
			<div class="form-grid">
				<label class="field field-full">
					<span>Titre</span>
					<input type="text" bind:value={editForm.title} required />
				</label>
				<label class="field field-full">
					<span>Organisation</span>
					<input type="text" bind:value={editForm.organization} required />
				</label>
				<label class="field">
					<span>Ville</span>
					<input type="text" bind:value={editForm.city} required />
				</label>
				<label class="field">
					<span>Secteur</span>
					<input type="text" bind:value={editForm.sector} required />
				</label>
				<label class="field">
					<span>Niveau</span>
					<input type="text" bind:value={editForm.level} />
				</label>
				<label class="field">
					<span>Contrat</span>
					<select bind:value={editForm.contractType}>
						{#each CONTRACT_TYPES as ct}
							<option value={ct}>{ct}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>Date limite</span>
					<input type="date" bind:value={editForm.deadline} />
				</label>
				<label class="field">
					<span>TTL (jours)</span>
					<input type="number" min="1" max="365" bind:value={editForm.ttlDays} />
				</label>
				<div class="field field-full">
					<span class="field-label">Description</span>
					<RichEditor bind:value={editForm.description} placeholder="Description du poste…" />
				</div>
				<div class="field field-full">
					<span class="field-label">Prérequis</span>
					<RichEditor bind:value={editForm.requirements} placeholder="Prérequis et compétences attendues…" />
				</div>
				<label class="field">
					<span>Email contact</span>
					<input type="email" bind:value={editForm.contactEmail} />
				</label>
				<label class="field">
					<span>Téléphone contact</span>
					<input type="tel" bind:value={editForm.contactPhone} />
				</label>
				<label class="field field-full">
					<span>Adresse contact</span>
					<input type="text" bind:value={editForm.contactAddress} />
				</label>
				<label class="field field-full">
					<span>URL candidature</span>
					<input type="url" bind:value={editForm.applicationUrl} />
				</label>
			</div>

			<div class="form-flags">
				<label class="flag-check">
					<input type="checkbox" bind:checked={editForm.isSponsored} />
					<span>Sponsorisée</span>
				</label>
				<label class="flag-check">
					<input type="checkbox" bind:checked={editForm.validated} />
					<span>Validée</span>
				</label>
				<label class="flag-check">
					<input type="checkbox" bind:checked={editForm.isFraudSuspect} />
					<span>Fraude suspectée</span>
				</label>
			</div>

		</form>
		<div class="modal-footer">
			<button type="button" class="btn-secondary" onclick={() => showEdit = false}>Annuler</button>
			<button type="button" class="btn-primary" disabled={saving} onclick={saveEdit}>
				{saving ? 'Sauvegarde…' : 'Sauvegarder'}
			</button>
		</div>
	</div>
{/if}

<div class="page">
	<a href="/admin/offres" class="back">← Retour aux offres</a>

	<!-- En-tête -->
	<div class="header">
		<div class="header-main">
			<h1>{o.title}</h1>
			<p class="org">{o.organization}</p>
		</div>
		<div class="header-badges">
			<span class="status-badge" style="background: {statusColor[o.status]}20; color: {statusColor[o.status]}; border: 1px solid {statusColor[o.status]}40">
				{statusLabel[o.status]}
			</span>
			{#if o.isSponsored}
				<span class="badge-sponsored">Sponsorisée</span>
			{/if}
			{#if o.isFraudSuspect}
				<span class="badge-fraud">⚠ Fraude suspectée</span>
			{/if}
			{#if o.validated}
				<span class="badge-validated">✓ Validée</span>
			{/if}
		</div>
	</div>

	<!-- Barre d'actions -->
	<div class="actions-bar">
		<div class="status-actions">
			<span class="actions-label">Statut :</span>
			{#each ['PENDING', 'ACTIVE', 'EXPIRED', 'ARCHIVED'] as s}
				<button
					class="btn-status"
					class:btn-status-active={o.status === s}
					style="--c: {statusColor[s]}"
					disabled={statusLoading || o.status === s}
					onclick={() => changeStatus(s as JobOfferStatus)}
				>
					{statusLabel[s]}
				</button>
			{/each}
		</div>
		<button class="btn-edit" onclick={openEdit}>
			✏ Modifier l'offre
		</button>
	</div>

	<!-- Métriques interactions -->
	<div class="metrics-row">
		{#each interactions as it}
			<div class="metric-card">
				<span class="metric-val">{o.interactions[it.key] ?? 0}</span>
				<span class="metric-lbl">{it.label}</span>
			</div>
		{/each}
		<div class="metric-card metric-score">
			<span class="metric-val">{pct(o.scoreConfidence)}</span>
			<span class="metric-lbl">Score confiance</span>
		</div>
	</div>

	<div class="cols">
		<div class="col-main">
			<!-- Informations clés -->
			<section class="section">
				<h2>Informations</h2>
				<dl class="info-grid">
					<div class="info-item">
						<dt>Ville</dt>
						<dd>{o.city}</dd>
					</div>
					<div class="info-item">
						<dt>Secteur</dt>
						<dd>{o.sector}</dd>
					</div>
					<div class="info-item">
						<dt>Niveau</dt>
						<dd>{o.level || '—'}</dd>
					</div>
					<div class="info-item">
						<dt>Contrat</dt>
						<dd><span class="tag">{o.contractType}</span></dd>
					</div>
					<div class="info-item">
						<dt>Publiée le</dt>
						<dd>{fmt(o.publishedAt ?? null)}</dd>
					</div>
					<div class="info-item">
						<dt>Date limite</dt>
						<dd class="{o.deadline && new Date(o.deadline) < new Date() ? 'expired' : ''}">{fmt(o.deadline)}</dd>
					</div>
					<div class="info-item">
						<dt>TTL</dt>
						<dd>{o.ttlDays} jours</dd>
					</div>
					<div class="info-item">
						<dt>Créée le</dt>
						<dd>{fmt(o.createdAt)}</dd>
					</div>
				</dl>
			</section>

			<!-- Description -->
			{#if o.description}
				<section class="section">
					<h2>Description</h2>
					<div class="prose">{@html o.description}</div>
				</section>
			{/if}

			<!-- Prérequis -->
			{#if o.requirements}
				<section class="section">
					<h2>Prérequis</h2>
					<div class="prose">{@html o.requirements}</div>
				</section>
			{/if}
		</div>

		<div class="col-side">
			<!-- Contact -->
			<section class="section">
				<h2>Contact</h2>
				<dl class="info-list">
					<div class="info-item">
						<dt>Email</dt>
						<dd>{#if o.contactEmail}<a href="mailto:{o.contactEmail}">{o.contactEmail}</a>{:else}—{/if}</dd>
					</div>
					<div class="info-item">
						<dt>Téléphone</dt>
						<dd>{o.contactPhone ?? '—'}</dd>
					</div>
					<div class="info-item">
						<dt>Adresse</dt>
						<dd>{o.contactAddress ?? '—'}</dd>
					</div>
					<div class="info-item">
						<dt>Candidature</dt>
						<dd>{#if o.applicationUrl}<a href={o.applicationUrl} target="_blank" rel="noopener">Lien ↗</a>{:else}—{/if}</dd>
					</div>
				</dl>
			</section>

			<!-- Source -->
			<section class="section">
				<h2>Source</h2>
				<dl class="info-list">
					<div class="info-item">
						<dt>Nom</dt>
						<dd><a href={o.source.url} target="_blank" rel="noopener">{o.source.name} ↗</a></dd>
					</div>
					<div class="info-item">
						<dt>Type</dt>
						<dd>{o.source.type}</dd>
					</div>
					<div class="info-item">
						<dt>Trust score</dt>
						<dd>{pct(o.source.trustScore)}</dd>
					</div>
					<div class="info-item">
						<dt>URL source</dt>
						<dd><a href={o.sourceUrl} target="_blank" rel="noopener" class="url-truncate">Voir l'original ↗</a></dd>
					</div>
				</dl>
			</section>

			<!-- Technique -->
			<section class="section section-technical">
				<h2>Technique</h2>
				<dl class="info-list">
					<div class="info-item">
						<dt>ID</dt>
						<dd class="mono">{o.id}</dd>
					</div>
					<div class="info-item">
						<dt>Hash</dt>
						<dd class="mono hash">{o.hash}</dd>
					</div>
					<div class="info-item">
						<dt>Mise à jour</dt>
						<dd>{fmt(o.updatedAt)}</dd>
					</div>
				</dl>
			</section>
		</div>
	</div>
</div>

<style>
	.page { max-width: 1100px; }

	.back {
		display: inline-block;
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin-bottom: 1.5rem;
		transition: color 0.12s;
	}
	.back:hover { color: var(--color-text); text-decoration: none; }

	/* ── En-tête ─────────────────────────────────────────── */
	.header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 0.25rem;
		line-height: 1.25;
	}

	.org {
		font-size: 1rem;
		color: var(--color-text-muted);
		margin: 0;
		font-weight: 500;
	}

	.header-badges {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
		flex-shrink: 0;
	}

	.status-badge {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 3px 10px;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.badge-sponsored {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 3px 10px;
		border-radius: var(--radius-sm);
		background: #dbeafe;
		color: #1e40af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.badge-fraud {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 3px 10px;
		border-radius: var(--radius-sm);
		background: #fee2e2;
		color: #991b1b;
	}

	.badge-validated {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 3px 10px;
		border-radius: var(--radius-sm);
		background: var(--color-green-light);
		color: var(--color-green-dark);
	}

	/* ── Barre d'actions ─────────────────────────────────── */
	.actions-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 0.75rem 1rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}

	.status-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.actions-label {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-right: 0.25rem;
	}

	.btn-status {
		font-size: 0.78rem;
		font-weight: 600;
		padding: 5px 14px;
		border-radius: var(--radius-sm);
		border: 1.5px solid color-mix(in srgb, var(--c) 40%, transparent);
		background: color-mix(in srgb, var(--c) 10%, transparent);
		color: var(--c);
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s, opacity 0.12s;
	}
	.btn-status:hover:not(:disabled) {
		background: color-mix(in srgb, var(--c) 18%, transparent);
	}
	.btn-status-active {
		background: color-mix(in srgb, var(--c) 20%, transparent) !important;
		border-color: var(--c) !important;
		font-weight: 700;
	}
	.btn-status:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-edit {
		font-size: 0.85rem;
		font-weight: 600;
		padding: 6px 16px;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--color-border);
		background: var(--color-bg-muted, #f9fafb);
		color: var(--color-text);
		cursor: pointer;
		transition: border-color 0.12s, background 0.12s;
	}
	.btn-edit:hover {
		border-color: #2b9964;
		color: #2b9964;
	}

	/* ── Métriques ───────────────────────────────────────── */
	.metrics-row {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.metric-card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 110px;
	}

	.metric-score { border-color: var(--color-green-mid); }

	.metric-val {
		font-size: 1.6rem;
		font-weight: 700;
		color: #2b9964;
		line-height: 1;
	}

	.metric-lbl {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* ── Colonnes ────────────────────────────────────────── */
	.cols {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 1.25rem;
		align-items: start;
	}

	@media (max-width: 900px) {
		.cols { grid-template-columns: 1fr; }
	}

	/* ── Sections ────────────────────────────────────────── */
	.section {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.25rem 1.5rem;
		margin-bottom: 1rem;
	}

	.section-technical { border-style: dashed; }

	h2 {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 1rem;
	}

	/* ── Grille info ─────────────────────────────────────── */
	.info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem 1.5rem;
		margin: 0;
	}

	.info-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	dt {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	dd {
		font-size: 0.875rem;
		color: var(--color-text);
		margin: 0;
		font-weight: 500;
	}

	dd a { color: #2b9964; }
	dd a:hover { text-decoration: underline; }

	.expired { color: #ef4444; }

	.tag {
		display: inline-block;
		background: var(--color-green-light);
		color: var(--color-green-dark);
		padding: 2px 7px;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 700;
	}

	/* ── Prose ───────────────────────────────────────────── */
	.prose {
		font-size: 0.875rem;
		line-height: 1.65;
		color: var(--color-text);
		margin: 0;
	}

	.prose :global(p) { margin: 0 0 0.6em; }
	.prose :global(p:last-child) { margin-bottom: 0; }
	.prose :global(strong) { font-weight: 700; }
	.prose :global(em) { font-style: italic; }
	.prose :global(u) { text-decoration: underline; }
	.prose :global(ul), .prose :global(ol) { padding-left: 1.4em; margin: 0.4em 0 0.6em; }
	.prose :global(li) { margin-bottom: 0.2em; }
	.prose :global(h1), .prose :global(h2), .prose :global(h3) {
		font-weight: 700;
		margin: 0.8em 0 0.3em;
		line-height: 1.3;
	}
	.prose :global(h1) { font-size: 1.1em; }
	.prose :global(h2) { font-size: 1em; }
	.prose :global(h3) { font-size: 0.95em; }

	/* ── Technique ───────────────────────────────────────── */
	.mono {
		font-family: monospace;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		word-break: break-all;
	}

	.hash { font-size: 0.7rem; }

	.url-truncate {
		display: inline-block;
		max-width: 220px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		vertical-align: bottom;
	}

	/* ── Modal ───────────────────────────────────────────── */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.45);
		z-index: 100;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 101;
		background: var(--color-bg, #fff);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		width: min(680px, 95vw);
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0,0,0,0.18);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem 1rem;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.modal-header h2 {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		text-transform: none;
		letter-spacing: 0;
		margin: 0;
	}

	.btn-icon {
		background: none;
		border: none;
		font-size: 1rem;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 4px 6px;
		border-radius: var(--radius-sm);
		line-height: 1;
	}
	.btn-icon:hover { background: var(--color-border); color: var(--color-text); }

	.modal-body {
		overflow-y: auto;
		padding: 1.25rem 1.5rem;
		flex: 1;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.field-full {
		grid-column: 1 / -1;
	}

	.field span,
	.field-label {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.field input,
	.field select {
		font-size: 0.875rem;
		padding: 6px 10px;
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text);
		width: 100%;
		box-sizing: border-box;
		font-family: inherit;
		transition: border-color 0.12s;
	}
	.field input:focus,
	.field select:focus {
		outline: none;
		border-color: #2b9964;
	}

	.form-flags {
		display: flex;
		gap: 1.5rem;
		margin-top: 1rem;
		flex-wrap: wrap;
	}

	.flag-check {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
		font-size: 0.875rem;
		color: var(--color-text);
		font-weight: 500;
	}

	.flag-check input[type="checkbox"] {
		width: 15px;
		height: 15px;
		cursor: pointer;
		accent-color: #2b9964;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.btn-secondary {
		font-size: 0.875rem;
		font-weight: 600;
		padding: 7px 18px;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
	}
	.btn-secondary:hover { border-color: var(--color-text-muted); }

	.btn-primary {
		font-size: 0.875rem;
		font-weight: 600;
		padding: 7px 18px;
		border-radius: var(--radius-sm);
		border: none;
		background: #2b9964;
		color: #fff;
		cursor: pointer;
		transition: background 0.12s;
	}
	.btn-primary:hover:not(:disabled) { background: #22855a; }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

	/* ── Toast ───────────────────────────────────────────── */
	.toast {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 200;
		padding: 10px 18px;
		border-radius: var(--radius-lg);
		font-size: 0.875rem;
		font-weight: 600;
		box-shadow: 0 4px 16px rgba(0,0,0,0.12);
		animation: toast-in 0.2s ease;
	}
	.toast-ok { background: #2b9964; color: #fff; }
	.toast-err { background: #ef4444; color: #fff; }

	@keyframes toast-in {
		from { opacity: 0; transform: translateY(8px); }
		to   { opacity: 1; transform: translateY(0); }
	}
</style>
