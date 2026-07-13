<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { isAdminAuthenticated, logout } from '$lib/auth.js';
	import { adminApi } from '$lib/api.js';
	import type { PipelineResult } from '$lib/types.js';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	if (browser && !isAdminAuthenticated()) {
		goto('/login');
	}

	let now = $state(new Date());
	let syncing = $state(false);

	onMount(() => {
		const id = setInterval(() => { now = new Date(); }, 60_000);
		return () => clearInterval(id);
	});

	// ── Sync modal ────────────────────────────────────────────────────────

	type SyncJobPhase = 'waiting' | 'active' | 'completed' | 'failed';

	type SyncJobState = {
		scraperName: string;
		jobId: string;
		phase: SyncJobPhase;
		result: PipelineResult | null;
		error: string | null;
	};

	let syncModal = $state<{
		open: boolean;
		jobs: SyncJobState[];
		syncError: string | null;
	}>({ open: false, jobs: [], syncError: null });

	let completedCount = $derived(
		syncModal.jobs.filter(j => j.phase === 'completed' || j.phase === 'failed').length
	);
	let allDone = $derived(syncModal.jobs.length > 0 && completedCount === syncModal.jobs.length);
	let progressPct = $derived(syncModal.jobs.length ? (completedCount / syncModal.jobs.length) * 100 : 0);

	let aggregate = $derived.by(() => {
		if (!allDone) return null;
		return syncModal.jobs.reduce(
			(acc, j) => {
				if (j.result) {
					acc.scraped += j.result.totalScraped;
					acc.inserted += j.result.totalInserted;
					acc.duplicates += j.result.totalDuplicates;
					acc.errors += j.result.totalErrors;
					acc.duration += j.result.duration;
				}
				return acc;
			},
			{ scraped: 0, inserted: 0, duplicates: 0, errors: 0, duration: 0 }
		);
	});

	function toPhase(state: string): SyncJobPhase {
		if (state === 'completed') return 'completed';
		if (state === 'failed') return 'failed';
		if (state === 'active') return 'active';
		return 'waiting';
	}

	async function syncScrapers() {
		syncing = true;
		// Ouvrir le modal immédiatement — état chargement
		syncModal = { open: true, jobs: [], syncError: null };
		try {
			const res = await adminApi.syncAll();
			if (res?.jobs === undefined) {
				syncModal = { open: true, jobs: [], syncError: 'Redémarre le serveur API (pnpm dev) — la réponse ne contient pas encore les jobIds.' };
				return;
			}
			if (res.jobs.length === 0) {
				syncModal = { open: true, jobs: [], syncError: 'Aucun scraper actif en base (table Source vide ou tous désactivés).' };
				return;
			}
			const jobs = res.jobs;
			syncModal = {
				open: true,
				syncError: null,
				jobs: jobs.map(j => ({
					scraperName: j.scraperName,
					jobId: j.jobId,
					phase: 'waiting' as SyncJobPhase,
					result: null,
					error: null,
				})),
			};
			// Poll tous les jobs en parallèle — pas d'await
			for (let i = 0; i < syncModal.jobs.length; i++) {
				pollSyncJob(i);
			}
		} catch (e) {
			syncModal = { open: true, jobs: [], syncError: String(e) };
		} finally {
			syncing = false;
		}
	}

	async function pollSyncJob(index: number) {
		const MAX = 150; // ~5 min à 2 s/poll
		for (let i = 0; i < MAX; i++) {
			await new Promise(r => setTimeout(r, 2000));
			try {
				const poll = await adminApi.pollJob(syncModal.jobs[index].jobId);
				syncModal.jobs[index].phase = toPhase(poll.state);
				if (poll.state === 'completed') {
					syncModal.jobs[index].result = poll.result;
					return;
				}
				if (poll.state === 'failed') {
					syncModal.jobs[index].error = poll.failedReason ?? 'Échec inconnu';
					return;
				}
			} catch { /* ignore, retry next tick */ }
		}
		syncModal.jobs[index].phase = 'failed';
		syncModal.jobs[index].error = 'Timeout — job encore en arrière-plan.';
	}

	function closeSyncModal() {
		syncModal = { ...syncModal, open: false };
	}

	function formatDuration(ms: number) {
		return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
	}

	function dotColor(phase: SyncJobPhase) {
		if (phase === 'completed') return 'ok';
		if (phase === 'failed') return 'error';
		if (phase === 'active') return 'active';
		return 'muted';
	}

	// ─────────────────────────────────────────────────────────────────────

	const navLinks = [
		{ href: '/admin', label: 'Dashboard', exact: true },
		{ href: '/admin/offres', label: 'Offres', exact: false },
		{ href: '/admin/scrapers', label: 'Scrapers', exact: false },
		{ href: '/admin/templates', label: 'Templates', exact: false },
		{ href: '/admin/employeurs', label: 'Employeurs', exact: false },
		{ href: '/admin/scouts', label: 'Scouts', exact: false },
	];

	function isActive(link: { href: string; exact: boolean }): boolean {
		const path = page.url.pathname;
		return link.exact ? path === link.href : path === link.href || path.startsWith(link.href + '/');
	}
</script>

<!-- ── Sync Modal ────────────────────────────────────────────────── -->
{#if syncModal.open}
	<div class="overlay" role="dialog" aria-modal="true" aria-label="Synchronisation des scrapers">
		<div class="modal modal-sync">

			<!-- Header -->
			<div class="modal-header">
				<div class="modal-title-block">
					<h2>Synchronisation des scrapers</h2>
					<p class="modal-subtitle">
						{#if syncModal.syncError}
							Erreur de lancement
						{:else if allDone}
							{syncModal.jobs.length} scraper{syncModal.jobs.length > 1 ? 's' : ''} traités
						{:else}
							{completedCount} / {syncModal.jobs.length} terminés…
						{/if}
					</p>
				</div>
				{#if allDone || syncModal.syncError}
					<button class="btn-close" onclick={closeSyncModal} aria-label="Fermer">✕</button>
				{/if}
			</div>

			<!-- Progress bar (only while running) -->
			{#if !allDone && !syncModal.syncError && syncModal.jobs.length > 0}
				<div class="progress-track" role="progressbar" aria-valuenow={completedCount} aria-valuemax={syncModal.jobs.length}>
					<div class="progress-fill" style="width: {progressPct}%"></div>
				</div>
			{/if}

			<!-- Body -->
			<div class="modal-body">

				{#if syncModal.syncError}
					<p class="sync-error">{syncModal.syncError}</p>

				{:else if syncModal.jobs.length === 0}
					<div class="loading-state">
						<span class="spinner" aria-hidden="true"></span>
						<p>Lancement en cours…</p>
					</div>

				{:else}
					<!-- Aggregate stats (visible once all done) -->
					{#if allDone && aggregate}
						<div class="stat-grid">
							<div class="stat">
								<span class="stat-value">{aggregate.scraped}</span>
								<span class="stat-label">Scrapées</span>
							</div>
							<div class="stat stat-green">
								<span class="stat-value">{aggregate.inserted}</span>
								<span class="stat-label">Importées</span>
							</div>
							<div class="stat stat-yellow">
								<span class="stat-value">{aggregate.duplicates}</span>
								<span class="stat-label">Doublons</span>
							</div>
							<div class="stat {aggregate.errors > 0 ? 'stat-red' : ''}">
								<span class="stat-value">{aggregate.errors}</span>
								<span class="stat-label">Erreurs</span>
							</div>
						</div>
						<p class="duration-total">Durée cumulée : {formatDuration(aggregate.duration)}</p>
						<div class="divider"></div>
					{/if}

					<!-- Per-scraper rows -->
					<ul class="scraper-list">
						{#each syncModal.jobs as job}
							<li class="scraper-row">
								<span class="dot dot-{dotColor(job.phase)}" class:dot-pulse={job.phase === 'active'}></span>
								<span class="scraper-name">{job.scraperName}</span>
								<span class="scraper-state-col">
									{#if job.phase === 'waiting'}
										<span class="pill pill-muted">En attente</span>
									{:else if job.phase === 'active'}
										<span class="pill pill-active">
											<span class="mini-spin" aria-hidden="true"></span>
											En cours
										</span>
									{:else if job.phase === 'completed'}
										<span class="pill pill-ok">
											✓&nbsp;{job.result?.totalInserted ?? 0} nouvelles
										</span>
									{:else if job.phase === 'failed'}
										<span class="pill pill-error" title={job.error ?? ''}>✗ Échec</span>
									{/if}
								</span>
								{#if job.phase === 'completed' && job.result}
									<span class="scraper-meta">
										{job.result.totalScraped} scrapées
										· {job.result.totalDuplicates} doublons
										· {formatDuration(job.result.duration)}
									</span>
								{:else if job.phase === 'failed' && job.error}
									<span class="scraper-meta scraper-meta-error">{job.error}</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

			</div>

			<!-- Footer -->
			{#if allDone || syncModal.syncError}
				<div class="modal-footer">
					<button class="btn-primary" onclick={closeSyncModal}>Fermer</button>
				</div>
			{/if}

		</div>
	</div>
{/if}

<!-- ── App shell ─────────────────────────────────────────────────── -->
<div class="layout">
	<aside class="sidebar">
		<div class="logo">
			<img src="/logo.png" alt="Tumaa" class="logo-img" />
			<span class="logo-badge">Admin</span>
		</div>

		<nav>
			{#each navLinks as link}
				<a href={link.href} class:active={isActive(link)}>{link.label}</a>
			{/each}
		</nav>

		<button class="logout-btn" onclick={() => logout()}>Déconnexion</button>
	</aside>

	<div class="main-col">
		<header class="topbar">
			<span class="topbar-date">
				{now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
				&nbsp;·&nbsp;
				{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
			</span>
			<button class="sync-btn" onclick={syncScrapers} disabled={syncing}>
				{#if syncing}
					Lancement…
				{:else}
					↺ Sync scrapers
				{/if}
			</button>
		</header>

		<main class="content">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.layout {
		display: flex;
		min-height: 100vh;
	}

	/* ── Sidebar ──────────────────────────────────────── */
	.sidebar {
		width: 220px;
		background: #f9fafb;
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		padding: 1.5rem 1rem;
		gap: 1.5rem;
		flex-shrink: 0;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--color-border);
	}

	.logo-img {
		height: 32px;
		width: auto;
		object-fit: contain;
	}

	.logo-badge {
		font-size: 0.6rem;
		background: #2b9964;
		color: #fff;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-weight: 600;
		text-transform: uppercase;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		flex: 1;
	}

	nav :global(a) {
		display: block;
		color: var(--color-text-muted);
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 500;
		border-left: 3px solid transparent;
		transition: background 0.12s, color 0.12s;
	}

	nav :global(a:hover) {
		background: var(--color-green-light);
		color: var(--color-green);
		text-decoration: none;
	}

	nav :global(a.active) {
		background: var(--color-green-light);
		color: #2b9964;
		border-left-color: #2b9964;
		font-weight: 600;
	}

	.logout-btn {
		background: transparent;
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		text-align: left;
		transition: background 0.12s;
	}

	.logout-btn:hover {
		background: #fee2e2;
		color: #991b1b;
		border-color: #fca5a5;
	}

	/* ── Main column ──────────────────────────────────── */
	.main-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		overflow: hidden;
	}

	/* ── Topbar ───────────────────────────────────────── */
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 2rem;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.topbar-date {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		text-transform: capitalize;
	}

	.sync-btn {
		background: #2b9964;
		color: #fff;
		border: none;
		padding: 0.4rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 600;
		transition: background 0.12s, opacity 0.12s;
	}

	.sync-btn:hover:not(:disabled) {
		background: var(--color-green-dark);
	}

	.sync-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* ── Content area ─────────────────────────────────── */
	.content {
		flex: 1;
		padding: 2rem;
		background: var(--color-bg-subtle);
		overflow-y: auto;
	}

	/* ── Sync modal ───────────────────────────────────── */
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
	}

	.modal-sync {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		width: 580px;
		max-width: calc(100vw - 2rem);
		max-height: calc(100vh - 4rem);
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 1.1rem 1.25rem 0.9rem;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.modal-title-block h2 {
		font-size: 1rem;
		font-weight: 700;
		margin: 0 0 0.15rem;
	}

	.modal-subtitle {
		font-size: 0.78rem;
		color: var(--color-text-muted);
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
		flex-shrink: 0;
	}
	.btn-close:hover { background: var(--color-bg-subtle); }

	/* Progress bar */
	.progress-track {
		height: 3px;
		background: var(--color-border);
		flex-shrink: 0;
	}

	.progress-fill {
		height: 100%;
		background: #2b9964;
		transition: width 0.4s ease;
	}

	/* Body */
	.modal-body {
		padding: 1.25rem;
		overflow-y: auto;
		flex: 1;
	}

	/* Aggregate stats */
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.65rem;
		margin-bottom: 0.75rem;
	}

	.stat {
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 0.65rem 0.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}

	.stat-value {
		font-size: 1.4rem;
		font-weight: 700;
		line-height: 1;
	}

	.stat-label {
		font-size: 0.62rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.stat-green .stat-value { color: #2b9964; }
	.stat-yellow .stat-value { color: #b45309; }
	.stat-red .stat-value { color: #dc2626; }

	.duration-total {
		font-size: 0.78rem;
		color: var(--color-text-muted);
		margin: 0 0 0.75rem;
		text-align: right;
	}

	.divider {
		height: 1px;
		background: var(--color-border);
		margin-bottom: 0.85rem;
	}

	/* Scraper list */
	.scraper-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.scraper-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--color-border);
		min-height: 2.4rem;
	}

	.scraper-row:last-child { border-bottom: none; }

	/* Status dot */
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.dot-ok     { background: #2b9964; }
	.dot-error  { background: #ef4444; }
	.dot-active { background: #2b9964; }
	.dot-muted  { background: #d1d5db; }

	.dot-pulse {
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50%       { opacity: 0.35; }
	}

	.scraper-name {
		font-size: 0.85rem;
		font-weight: 600;
		flex: 0 0 auto;
		min-width: 120px;
	}

	.scraper-state-col {
		flex: 0 0 auto;
	}

	.scraper-meta {
		font-size: 0.72rem;
		color: var(--color-text-muted);
		margin-left: auto;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 220px;
	}

	.scraper-meta-error {
		color: #dc2626;
	}

	/* Pills */
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 2px 8px;
		border-radius: 99px;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.pill-muted  { background: #f3f4f6; color: #6b7280; }
	.pill-active { background: #d1fae5; color: #065f46; }
	.pill-ok     { background: #d1fae5; color: #065f46; }
	.pill-error  { background: #fee2e2; color: #991b1b; }

	/* Mini spinner inside pill */
	.mini-spin {
		width: 9px;
		height: 9px;
		border: 1.5px solid #6ee7b7;
		border-top-color: #065f46;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* Footer */
	.modal-footer {
		padding: 0.75rem 1.25rem 1rem;
		display: flex;
		justify-content: flex-end;
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
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

	/* Loading state */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.85rem;
		padding: 1.5rem 0;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.loading-state p { margin: 0; }

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: #2b9964;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	/* Error state */
	.sync-error {
		color: #dc2626;
		font-size: 0.875rem;
		margin: 0;
	}
</style>
