<script lang="ts">
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
	let u = $derived(data.user);
	let channel = $derived(u.channelJoins[0] ?? null);

	function formatDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('fr-FR', { dateStyle: 'long' });
	}
</script>

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

<style>
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

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.badge-channel-joined { background: var(--color-green-light); color: var(--color-green-dark); }
	.badge-channel-pending { background: #fef9c3; color: #854d0e; }

	.empty { color: var(--color-text-muted); font-size: 0.875rem; margin: 0; }
</style>
