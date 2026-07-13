<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	const offer = $derived(data.offer)
	const error = $derived(data.error)

	const CONTRACT_LABELS: Record<string, string> = {
		CDI: 'CDI', CDD: 'CDD', STAGE: 'Stage', ALTERNANCE: 'Alternance',
		FREELANCE: 'Freelance', BENEVOLE: 'Bénévolat', AUTRE: 'Autre',
	}

	const daysLeft = $derived(
		offer?.deadline
			? Math.ceil((new Date(offer.deadline).getTime() - Date.now()) / 86_400_000)
			: null
	)

	const isVerified = $derived(offer?.source != null && offer!.source!.trustScore > 0.8)

	const waShareUrl = $derived(
		offer
			? `https://wa.me/?text=${encodeURIComponent(`${offer.title} — ${offer.organization}`)}`
			: '#'
	)

	const requirements = $derived(
		offer?.requirements
			? offer.requirements.split('\n').filter(Boolean)
			: []
	)
</script>

<svelte:head>
	{#if offer}
		<title>{offer.title} — {offer.organization} | Tumaa</title>
		<meta name="description" content="{offer.title} · {offer.organization} · {offer.city}" />
		<meta property="og:title" content="{offer.title} — {offer.organization}" />
		<meta property="og:description" content="Offre d'emploi à {offer.city} — {offer.organization}. Trouvée par Tumaa, votre assistant emploi WhatsApp au Burkina Faso." />
		<meta property="og:image" content="https://tumaa.bf/og-default.png" />
		<meta property="og:type" content="article" />
	{:else}
		<title>Offre d'emploi | Tumaa</title>
	{/if}
</svelte:head>

<div class="page">
	<!-- TOPBAR -->
	<header class="topbar">
		<a href="/" class="brand">
			<img src="/logo.png" alt="Tumaa" class="brand-logo" />
		</a>
		<a
			href="https://wa.me/+22600000000?text=OFFRES"
			class="wa-back"
			target="_blank"
			rel="noopener noreferrer"
		>
			← Retour WhatsApp
		</a>
	</header>

	<div class="container">
		{#if error}
			<div class="error-state">
				<p class="error-icon">⚠️</p>
				<h1>Offre introuvable</h1>
				<p>{error}</p>
				<a href="https://wa.me/+22600000000?text=OFFRES" target="_blank" rel="noopener noreferrer" class="cta-btn">
					Voir d'autres offres sur WhatsApp
				</a>
			</div>
		{:else if offer}
			<article class="offer">

				<!-- TAGS -->
				<div class="tags-bar">
					<span class="tag">{CONTRACT_LABELS[offer.contractType] ?? offer.contractType}</span>
					<span class="tag">{offer.sector}</span>
					<span class="tag">{offer.city}</span>
					{#if daysLeft !== null}
						<span class="tag tag-expiry" class:tag-urgent={daysLeft < 3}>
							⏱ Expire dans {daysLeft}j
						</span>
					{/if}
				</div>

				<!-- TITRE + ORG -->
				<div class="offer-header">
					<h1 class="offer-title">{offer.title}</h1>
					<p class="offer-org">
						{offer.organization}
						{#if isVerified}
							<span class="verified-badge">✓ Vérifié Tumaa</span>
						{/if}
					</p>
				</div>

				<!-- META -->
				<div class="meta-grid">
					<div class="meta-item">
						<span class="meta-label">Ville</span>
						<span>{offer.city}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Niveau</span>
						<span>{offer.level}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Publication</span>
						<span>
							{offer.publishedAt
								? new Date(offer.publishedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
								: '—'}
						</span>
					</div>
				</div>

				<!-- CORPS -->
				{#if offer.description}
					<section class="section">
						<h2>Description du poste</h2>
						<p class="body-text">{offer.description}</p>
					</section>
				{/if}

				<!-- EXIGENCES -->
				{#if requirements.length > 0}
					<section class="section">
						<h2>Exigences</h2>
						<ul class="requirements-list">
							{#each requirements as req}
								<li>{req}</li>
							{/each}
						</ul>
					</section>
				{/if}

				<!-- CONTACTS -->
				{#if !offer.isUnlocked}
					<section class="section contacts-locked">
						<div class="lock-banner">🔒 Contacts réservés aux abonnés</div>
						<div class="lock-body">
							<span class="lock-icon">🔒</span>
							<h2>Contacts masqués — réservés aux abonnés Premium</h2>
							<p>Abonnez-vous pour accéder à l'email, téléphone et adresse de contact.</p>
							<a
								href="https://wa.me/+22600000000?text=PREMIUM"
								class="cta-btn cta-primary"
								target="_blank"
								rel="noopener noreferrer"
							>
								S'abonner · 650 FCFA/mois
							</a>
							<a
								href="https://wa.me/+22600000000?text=ESSAI"
								class="cta-secondary"
								target="_blank"
								rel="noopener noreferrer"
							>
								Essai 48h gratuit → tape ESSAI sur WhatsApp
							</a>
						</div>
					</section>
				{:else}
					<section class="section contacts-unlocked">
						<h2>Coordonnées de contact</h2>
						<ul class="contact-list">
							{#if offer.contactEmail}
								<li>
									<span class="contact-label">Email</span>
									<a href="mailto:{offer.contactEmail}">{offer.contactEmail}</a>
								</li>
							{/if}
							{#if offer.contactPhone}
								<li>
									<span class="contact-label">Téléphone</span>
									<a href="tel:{offer.contactPhone}">{offer.contactPhone}</a>
								</li>
							{/if}
							{#if offer.contactAddress}
								<li>
									<span class="contact-label">Adresse</span>
									<span>{offer.contactAddress}</span>
								</li>
							{/if}
						</ul>
						<a
							href={offer.sourceUrl}
							class="cta-btn cta-primary"
							target="_blank"
							rel="noopener noreferrer"
						>
							Voir l'offre originale →
						</a>
					</section>
				{/if}

				<!-- FOOTER -->
				<footer class="offer-footer">
					{#if offer.source}
						<span class="source-label">Source : {offer.source.name}</span>
					{/if}
					<a
						href={waShareUrl}
						class="share-btn"
						target="_blank"
						rel="noopener noreferrer"
					>
						📤 Partager sur WhatsApp
					</a>
				</footer>
			</article>
		{/if}
	</div>
</div>

<style>
	.page { min-height: 100vh; background: var(--color-bg-subtle, #f5f7f5); }

	/* TOPBAR */
	.topbar {
		background: var(--color-green, #1a7c4a);
		padding: 0.875rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.brand {
		text-decoration: none;
		line-height: 0;
	}
	.brand-logo {
		height: 36px;
		width: auto;
		object-fit: contain;
		border-radius: 6px;
	}
	.wa-back {
		font-size: 0.85rem;
		color: rgba(255,255,255,0.88);
		text-decoration: none;
		font-weight: 500;
	}
	.wa-back:hover { color: #fff; }

	/* LAYOUT */
	.container {
		max-width: 760px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.offer {
		background: var(--color-bg, #fff);
		border: 1px solid var(--color-border, #e5e7e5);
		border-radius: 12px;
		overflow: hidden;
	}

	/* TAGS */
	.tags-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 1rem 1.5rem 0;
	}
	.tag {
		background: var(--color-green-light, #e8f5ee);
		color: var(--color-green-dark, #0f5730);
		padding: 3px 10px;
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.tag-expiry { background: #fff8e8; color: #7a5c00; }
	.tag-urgent { background: #ffbd59; color: #5c3800; }

	/* HEADER */
	.offer-header {
		padding: 1rem 1.5rem 0.5rem;
		border-bottom: 1px solid var(--color-border, #e5e7e5);
	}
	.offer-title {
		font-size: 1.5rem;
		font-weight: 500;
		color: var(--color-text, #111);
		margin-bottom: 0.35rem;
		line-height: 1.3;
	}
	.offer-org {
		font-size: 0.9rem;
		color: var(--color-text-muted, #6b7280);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.verified-badge {
		background: var(--color-green, #1a7c4a);
		color: #fff;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 20px;
	}

	/* META GRID */
	.meta-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--color-border, #e5e7e5);
	}
	@media (max-width: 480px) { .meta-grid { grid-template-columns: repeat(2, 1fr); } }
	.meta-item { display: flex; flex-direction: column; gap: 0.15rem; }
	.meta-label {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted, #6b7280);
	}

	/* SECTIONS */
	.section {
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-border, #e5e7e5);
	}
	.section h2 {
		font-size: 0.95rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
		color: var(--color-text, #111);
	}
	.body-text {
		font-size: 0.9rem;
		line-height: 1.75;
		color: var(--color-text, #111);
		white-space: pre-line;
	}

	/* REQUIREMENTS */
	.requirements-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.requirements-list li {
		font-size: 0.9rem;
		color: var(--color-text, #111);
		padding-left: 1.25rem;
		position: relative;
	}
	.requirements-list li::before {
		content: '•';
		position: absolute;
		left: 0;
		color: var(--color-green, #1a7c4a);
		font-weight: 700;
	}

	/* CONTACTS — LOCKED */
	.contacts-locked { background: #fffbf0; border-color: #ffe29a; }

	.lock-banner {
		background: #ffbd59;
		color: #5c3800;
		font-size: 0.8rem;
		font-weight: 700;
		padding: 0.4rem 1rem;
		margin: -1.25rem -1.5rem 1.25rem;
		text-align: center;
	}
	.lock-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		text-align: center;
		padding: 0.5rem 0;
	}
	.lock-icon { font-size: 2rem; }
	.lock-body h2 { font-size: 1rem; font-weight: 700; }
	.lock-body p { font-size: 0.85rem; color: var(--color-text-muted, #6b7280); max-width: 380px; }

	/* CONTACTS — UNLOCKED */
	.contact-list {
		list-style: none;
		padding: 0;
		margin: 0 0 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.contact-list li { display: flex; gap: 0.75rem; align-items: baseline; font-size: 0.9rem; }
	.contact-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted, #6b7280);
		min-width: 70px;
	}

	/* CTAs */
	.cta-btn {
		display: inline-block;
		padding: 0.7rem 1.5rem;
		border-radius: 8px;
		font-weight: 700;
		font-size: 0.9rem;
		text-decoration: none;
		transition: background 0.15s;
	}
	.cta-primary {
		background: var(--color-green, #1a7c4a);
		color: #fff;
	}
	.cta-primary:hover { background: var(--color-green-dark, #0f5730); }
	.cta-secondary {
		font-size: 0.85rem;
		color: var(--color-green, #1a7c4a);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	/* FOOTER */
	.offer-footer {
		padding: 1rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		background: var(--color-bg-subtle, #f5f7f5);
	}
	.source-label { font-size: 0.8rem; color: var(--color-text-muted, #6b7280); }
	.share-btn {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-green, #1a7c4a);
		text-decoration: none;
		background: var(--color-green-light, #e8f5ee);
		padding: 0.4rem 0.9rem;
		border-radius: 6px;
	}
	.share-btn:hover { background: #d0ecda; }

	/* ERROR */
	.error-state {
		text-align: center;
		padding: 4rem 2rem;
		background: var(--color-bg, #fff);
		border-radius: 12px;
		border: 1px solid var(--color-border, #e5e7e5);
	}
	.error-icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
	.error-state h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
	.error-state p { color: var(--color-text-muted, #6b7280); margin-bottom: 1.5rem; }
</style>
