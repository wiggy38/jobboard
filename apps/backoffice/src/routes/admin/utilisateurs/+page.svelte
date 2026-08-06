<script lang="ts">
	import type { PageData } from './$types.js';
	import { adminApi } from '$lib/api.js';
	import { getAdminIdentity } from '$lib/auth.js';
	import type { AdminAccount, AdminAccountRole } from '$lib/types.js';

	let { data }: { data: PageData } = $props();

	let accounts = $state<AdminAccount[]>(data.accounts);
	let me = getAdminIdentity();

	let showCreateForm = $state(false);
	let formError = $state<string | null>(null);
	let submitting = $state(false);

	let newEmail = $state('');
	let newName = $state('');
	let newPassword = $state('');
	let newRole = $state<AdminAccountRole>('EDITOR');

	const roleLabel: Record<AdminAccountRole, string> = {
		SUPER_ADMIN: 'Super admin',
		ADMIN: 'Admin',
		EDITOR: 'Éditeur',
	};

	async function refresh() {
		accounts = await adminApi.listAdminAccounts();
	}

	async function handleCreate(e: SubmitEvent) {
		e.preventDefault();
		formError = null;
		submitting = true;
		try {
			await adminApi.createAdminAccount({
				email: newEmail,
				name: newName,
				password: newPassword,
				role: newRole,
			});
			newEmail = '';
			newName = '';
			newPassword = '';
			newRole = 'EDITOR';
			showCreateForm = false;
			await refresh();
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Erreur lors de la création';
		} finally {
			submitting = false;
		}
	}

	async function handleRoleChange(account: AdminAccount, role: AdminAccountRole) {
		try {
			await adminApi.updateAdminAccount(account.id, { role });
			await refresh();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
		}
	}

	async function handleToggleActive(account: AdminAccount) {
		try {
			await adminApi.updateAdminAccount(account.id, { active: !account.active });
			await refresh();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
		}
	}

	async function handleResetPassword(account: AdminAccount) {
		const password = prompt(`Nouveau mot de passe pour ${account.email} (min. 8 caractères) :`);
		if (!password) return;
		try {
			await adminApi.updateAdminAccount(account.id, { password });
			alert('Mot de passe mis à jour.');
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
		}
	}
</script>

<div class="page">
	<div class="page-header">
		<h1>Comptes backoffice</h1>
		<button class="btn-primary" onclick={() => (showCreateForm = !showCreateForm)}>
			{showCreateForm ? 'Annuler' : '+ Nouveau compte'}
		</button>
	</div>

	{#if showCreateForm}
		<form class="create-form" onsubmit={handleCreate}>
			{#if formError}<p class="form-error">{formError}</p>{/if}
			<div class="form-row">
				<label>
					Nom
					<input type="text" bind:value={newName} required />
				</label>
				<label>
					Email
					<input type="email" bind:value={newEmail} required />
				</label>
			</div>
			<div class="form-row">
				<label>
					Mot de passe
					<input type="password" bind:value={newPassword} minlength="8" required />
				</label>
				<label>
					Rôle
					<select bind:value={newRole}>
						<option value="EDITOR">Éditeur</option>
						<option value="ADMIN">Admin</option>
						<option value="SUPER_ADMIN">Super admin</option>
					</select>
				</label>
			</div>
			<button class="btn-primary" type="submit" disabled={submitting}>
				{submitting ? 'Création…' : 'Créer le compte'}
			</button>
		</form>
	{/if}

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Nom</th>
					<th>Email</th>
					<th>Rôle</th>
					<th>Statut</th>
					<th>Dernière connexion</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each accounts as account}
					<tr class:inactive={!account.active}>
						<td>{account.name}</td>
						<td class="muted">{account.email}</td>
						<td>
							{#if account.id === me?.sub}
								<span class="role-badge role-{account.role.toLowerCase()}">{roleLabel[account.role]}</span>
							{:else}
								<select
									value={account.role}
									onchange={(e) => handleRoleChange(account, (e.target as HTMLSelectElement).value as AdminAccountRole)}
								>
									<option value="EDITOR">Éditeur</option>
									<option value="ADMIN">Admin</option>
									<option value="SUPER_ADMIN">Super admin</option>
								</select>
							{/if}
						</td>
						<td>
							<span class="status-badge" class:status-active={account.active} class:status-inactive={!account.active}>
								{account.active ? 'Actif' : 'Désactivé'}
							</span>
						</td>
						<td class="muted">
							{account.lastLoginAt
								? new Date(account.lastLoginAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
								: 'Jamais'}
						</td>
						<td class="actions">
							<button class="btn-link" onclick={() => handleResetPassword(account)}>Réinitialiser mdp</button>
							{#if account.id !== me?.sub}
								<button class="btn-link" onclick={() => handleToggleActive(account)}>
									{account.active ? 'Désactiver' : 'Réactiver'}
								</button>
							{/if}
						</td>
					</tr>
				{/each}
				{#if accounts.length === 0}
					<tr><td colspan="6" class="empty">Aucun compte backoffice.</td></tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>

<style>
	.page { max-width: 960px; }

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}

	h1 { font-size: 1.5rem; font-weight: 700; }

	.btn-primary {
		background: #2b9964;
		color: #fff;
		border: none;
		border-radius: var(--radius-md);
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.btn-primary:hover:not(:disabled) { background: var(--color-green-dark); }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

	.create-form {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		margin-bottom: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.form-error {
		background: #fee2e2;
		color: #991b1b;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		font-size: 0.85rem;
		margin: 0;
	}

	.form-row {
		display: flex;
		gap: 1rem;
	}

	.form-row label {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.form-row input,
	.form-row select {
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		background: var(--color-bg);
		color: var(--color-text);
	}

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
		padding: 0.65rem 1rem;
		font-size: 0.875rem;
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}

	tbody tr:last-child td { border-bottom: none; }
	tbody tr.inactive { opacity: 0.55; }

	.muted { color: var(--color-text-muted); font-size: 0.8rem; }

	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.btn-link {
		background: none;
		border: none;
		color: #2b9964;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0;
	}
	.btn-link:hover { text-decoration: underline; }

	.role-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
	}
	.role-super_admin { background: #dbeafe; color: #1e40af; }
	.role-admin { background: var(--color-green-light); color: var(--color-green-dark); }
	.role-editor { background: #f3f4f6; color: #6b7280; }

	.status-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
	}
	.status-active { background: var(--color-green-light); color: var(--color-green-dark); }
	.status-inactive { background: #fee2e2; color: #991b1b; }

	.empty {
		text-align: center;
		color: var(--color-text-muted);
		padding: 2rem 1rem !important;
		font-size: 0.875rem;
	}
</style>
