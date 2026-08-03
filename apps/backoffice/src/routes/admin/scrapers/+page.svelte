<script lang="ts">
	import type { PageData } from './$types.js';
	import type { PipelineResult, SourceAlert } from '$lib/types.js';
	import { adminApi } from '$lib/api.js';

	let { data }: { data: PageData } = $props();

	let running = $state<Set<string>>(new Set());
	let disabled = $state<Set<string>>(new Set());

	// Modal state
	let modal = $state<{
		open: boolean;
		scraperName: string;
		phase: 'running' | 'done' | 'error';
		result: PipelineResult | null;
		error: string | null;
	}>({ open: false, scraperName: '', phase: 'running', result: null, error: null });

	const statusLabel: Record<string, string> = {
		ok: 'Opérationnel',
		warn: 'Avertissement',
		error: 'Erreur',
	};

	async function runScraper(id: string, name: string) {
		running = new Set([...running, id]);
		modal = { open: true, scraperName: name, phase: 'running', result: null, error: null };

		try {
			const { jobId } = await adminApi.runScraper(id);
			await pollUntilDone(jobId);
		} catch (e) {
			modal = { ...modal, phase: 'error', error: String(e) };
		} finally {
			running = new Set([...running].filter(x => x !== id));
		}
	}

	async function pollUntilDone(jobId: string) {
		const MAX = 150; // ~5 min à 2 s/poll
		for (let i = 0; i < MAX; i++) {
			await new Promise(r => setTimeout(r, 2000));
			const poll = await adminApi.pollJob(jobId);
			if (poll.state === 'completed') {
				modal = { ...modal, phase: 'done', result: poll.result };
				return;
			}
			if (poll.state === 'failed') {
				modal = { ...modal, phase: 'error', error: poll.failedReason ?? 'Échec inconnu' };
				return;
			}
		}
		modal = { ...modal, phase: 'error', error: 'Timeout — le scraper tourne encore en arrière-plan.' };
	}

	async function disableScraper(id: string) {
		try {
			await adminApi.disableScraper(id);
			disabled = new Set([...disabled, id]);
		} catch { /* best-effort */ }
	}

	function closeModal() {
		modal = { ...modal, open: false };
	}

	function formatDuration(ms: number) {
		return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
	}

	// ── Health check ──────────────────────────────────────────────────────
	let healthModal = $state<{
		open: boolean;
		phase: 'running' | 'done' | 'error';
		alerts: SourceAlert[];
		checkedAt: string | null;
		error: string | null;
	}>({ open: false, phase: 'running', alerts: [], checkedAt: null, error: null });

	async function runHealthCheck() {
		healthModal = { open: true, phase: 'running', alerts: [], checkedAt: null, error: null };
		try {
			const result = await adminApi.healthCheck();
			healthModal = { ...healthModal, phase: 'done', alerts: result.alerts, checkedAt: result.checkedAt };
		} catch (e) {
			healthModal = { ...healthModal, phase: 'error', error: String(e) };
		}
	}

	function closeHealthModal() {
		healthModal = { ...healthModal, open: false };
	}
</script>

<!-- Modal -->
{#if modal.open}
	<div class="overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-header">
				<h2>Scraper — {modal.scraperName}</h2>
				{#if modal.phase !== 'running'}
					<button class="btn-close" onclick={closeModal} aria-label="Fermer">✕</button>
				{/if}
			</div>

			{#if modal.phase === 'running'}
				<div class="modal-body center">
					<span class="spinner" aria-hidden="true"></span>
					<p class="running-label">Scraping en cours…</p>
				</div>
			{:else if modal.phase === 'error'}
				<div class="modal-body">
					<p class="error-msg">{modal.error}</p>
				</div>
				<div class="modal-footer">
					<button class="btn-primary" onclick={closeModal}>Fermer</button>
				</div>
			{:else if modal.phase === 'done' && modal.result}
				{@const r = modal.result}
				<div class="modal-body">
					<div class="stat-grid">
						<div class="stat">
							<span class="stat-value">{r.totalScraped}</span>
							<span class="stat-label">Scrapées</span>
						</div>
						<div class="stat stat-green">
							<span class="stat-value">{r.totalInserted}</span>
							<span class="stat-label">Importées</span>
						</div>
						<div class="stat stat-yellow">
							<span class="stat-value">{r.totalDuplicates}</span>
							<span class="stat-label">Doublons</span>
						</div>
						<div class="stat {r.totalErrors > 0 ? 'stat-red' : ''}">
							<span class="stat-value">{r.totalErrors}</span>
							<span class="stat-label">Erreurs</span>
						</div>
					</div>
					<p class="duration">Durée : {formatDuration(r.duration)}</p>
				</div>
				<div class="modal-footer">
					<button class="btn-primary" onclick={closeModal}>Fermer</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Modal Health Check -->
{#if healthModal.open}
	<div class="overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-header">
				<h2>Health Check</h2>
				{#if healthModal.phase !== 'running'}
					<button class="btn-close" onclick={closeHealthModal} aria-label="Fermer">✕</button>
				{/if}
			</div>

			{#if healthModal.phase === 'running'}
				<div class="modal-body center">
					<span class="spinner" aria-hidden="true"></span>
					<p class="running-label">Vérification en cours…</p>
				</div>
			{:else if healthModal.phase === 'error'}
				<div class="modal-body">
					<p class="error-msg">{healthModal.error}</p>
				</div>
				<div class="modal-footer">
					<button class="btn-primary" onclick={closeHealthModal}>Fermer</button>
				</div>
			{:else}
				<div class="modal-body">
					{#if healthModal.alerts.length === 0}
						<div class="health-ok">
							<span class="health-ok-icon">✓</span>
							<p>Toutes les sources sont opérationnelles.</p>
						</div>
					{:else}
						<p class="health-subtitle">{healthModal.alerts.length} source(s) en alerte</p>
						<ul class="alert-list">
							{#each healthModal.alerts as a}
								<li class="alert-item">
									<span class="dot dot-error"></span>
									<div class="alert-detail">
										<strong>{a.name}</strong>
										<span class="alert-reason">{a.reason}</span>
										{#if a.lastCrawled}
											<span class="alert-meta">Dernier crawl : {new Date(a.lastCrawled).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
										{:else}
											<span class="alert-meta">Jamais crawlé</span>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
					{#if healthModal.checkedAt}
						<p class="health-ts">Vérifié à {new Date(healthModal.checkedAt).toLocaleString('fr-FR', { timeStyle: 'short' })}</p>
					{/if}
				</div>
				<div class="modal-footer">
					<button class="btn-primary" onclick={closeHealthModal}>Fermer</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<div class="page">
	<div class="page-header">
		<h1>Scrapers</h1>
		<button class="btn-health" onclick={runHealthCheck}>⚡ Health Check</button>
	</div>

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Nom</th>
					<th>Type</th>
					<th>Dernier crawl</th>
					<th>Offres collectées</th>
					<th>Erreurs consécutives</th>
					<th>Statut</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.scrapers as s}
					{@const isRunning = running.has(s.id)}
					{@const isDisabled = disabled.has(s.id)}
					<tr class:row-disabled={isDisabled}>
						<td class="name-cell">
							<span class="dot dot-{s.status}"></span>
							{s.name}
						</td>
						<td><span class="type-pill">{s.type}</span></td>
						<td class="muted">
							{s.lastCrawl
								? new Date(s.lastCrawl).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
								: '—'}
						</td>
						<td class="num">{s.newOffers}</td>
						<td class="num {s.consecutiveErrors >= 3 ? 'num-warn' : ''}">
							{s.consecutiveErrors}
							{#if s.errorMessage}
								<span class="err-hint" title={s.errorMessage}>⚠</span>
							{/if}
						</td>
						<td>
							<span class="badge badge-{s.status}">{statusLabel[s.status]}</span>
						</td>
						<td class="actions-cell">
							<button
								class="btn-run"
								onclick={() => runScraper(s.id, s.name)}
								disabled={isRunning || isDisabled}
							>
								{isRunning ? '…' : '↺ Relancer'}
							</button>
							<button
								class="btn-disable"
								onclick={() => disableScraper(s.id)}
								disabled={isDisabled}
							>
								{isDisabled ? 'Désactivé' : 'Désactiver'}
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.page { max-width: 1100px; }

	h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; }

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
	.row-disabled { opacity: 0.5; }

	.name-cell { display: flex; align-items: center; gap: 0.6rem; font-weight: 600; }

	.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
	.dot-ok { background: #2b9964; }
	.dot-warn { background: #ffbd59; }
	.dot-error { background: #ef4444; }

	.type-pill {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 7px;
		border-radius: var(--radius-sm);
		background: #e5e7eb;
		color: #374151;
		letter-spacing: 0.04em;
	}

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
	.badge-ok { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-warn { background: var(--color-yellow-light); color: var(--color-yellow-dark); }
	.badge-error { background: #fee2e2; color: #991b1b; }

	.actions-cell { display: flex; gap: 0.5rem; align-items: center; }

	.btn-run, .btn-disable {
		padding: 0.3rem 0.7rem;
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		font-weight: 600;
		border: 1px solid;
		transition: background 0.12s, color 0.12s;
	}

	.btn-run { background: #2b9964; color: #fff; border-color: #2b9964; }
	.btn-run:hover:not(:disabled) { background: var(--color-green-dark); }

	.btn-disable { background: transparent; color: var(--color-text-muted); border-color: var(--color-border); }
	.btn-disable:hover:not(:disabled) { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }

	.btn-run:disabled, .btn-disable:disabled { opacity: 0.5; cursor: not-allowed; }

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
		width: 420px;
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

	.modal-header h2 {
		font-size: 1rem;
		font-weight: 700;
		margin: 0;
	}

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
		padding: 1.5rem 1.25rem;
	}

	.modal-body.center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem 1.25rem;
	}

	.modal-footer {
		padding: 0.75rem 1.25rem 1rem;
		display: flex;
		justify-content: flex-end;
		border-top: 1px solid var(--color-border);
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
	.btn-primary:hover { background: var(--color-green-dark); }

	/* Spinner */
	.spinner {
		width: 36px;
		height: 36px;
		border: 3px solid var(--color-border);
		border-top-color: #2b9964;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	.running-label {
		font-size: 0.9rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	/* Stat grid */
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.stat {
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 0.75rem 0.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1;
	}

	.stat-label {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.stat-green .stat-value { color: #2b9964; }
	.stat-yellow .stat-value { color: #b45309; }
	.stat-red .stat-value { color: #dc2626; }

	.duration {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin: 0;
		text-align: right;
	}

	.error-msg {
		color: #dc2626;
		font-size: 0.875rem;
		margin: 0;
	}

	/* ── Page header ── */
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}
	.page-header h1 { margin: 0; }

	.btn-health {
		padding: 0.4rem 0.9rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 600;
		border: 1px solid var(--color-border);
		background: var(--color-bg-subtle);
		color: var(--color-text);
		cursor: pointer;
		transition: background 0.12s;
	}
	.btn-health:hover { background: var(--color-border); }

	/* ── Health modal ── */
	.health-ok {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
	}
	.health-ok-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #d1fae5;
		color: #065f46;
		font-size: 1rem;
		font-weight: 700;
		flex-shrink: 0;
	}
	.health-ok p { margin: 0; font-size: 0.9rem; }

	.health-subtitle {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 0.75rem;
	}

	.alert-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.alert-item {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.6rem 0.75rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: var(--radius-md);
	}
	.alert-item .dot { margin-top: 4px; flex-shrink: 0; }
	.alert-detail {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.85rem;
	}
	.alert-reason { color: #b91c1c; font-size: 0.8rem; }
	.alert-meta { color: var(--color-text-muted); font-size: 0.75rem; }

	.health-ts {
		margin: 0.75rem 0 0;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-align: right;
	}
</style>
