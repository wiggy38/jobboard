<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types.js';
	import { adminApi } from '$lib/api.js';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	let u = $derived(data.user);

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

	let tabs = $derived([
		{ href: `/admin/abonnes/${u.id}`, label: 'Général', exact: true },
		{ href: `/admin/abonnes/${u.id}/pulls`, label: 'Historique des Pulls', exact: false },
		{ href: `/admin/abonnes/${u.id}/paiements`, label: 'Paiement', exact: false },
		{ href: `/admin/abonnes/${u.id}/filleuls`, label: 'Filleuls', exact: false },
	]);

	function isActive(tab: { href: string; exact: boolean }): boolean {
		const path = page.url.pathname;
		return tab.exact ? path === tab.href : path.startsWith(tab.href);
	}
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

	<nav class="sub-nav">
		{#each tabs as tab}
			<a href={tab.href} class:active={isActive(tab)}>{tab.label}</a>
		{/each}
	</nav>

	{@render children()}
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

	.sub-nav {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: 1.5rem;
	}
	.sub-nav a {
		padding: 0.6rem 0.9rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-decoration: none;
		border-bottom: 2px solid transparent;
		transition: color 0.12s, border-color 0.12s;
	}
	.sub-nav a:hover { color: var(--color-green-dark); }
	.sub-nav a.active { color: #2b9964; border-bottom-color: #2b9964; }

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
