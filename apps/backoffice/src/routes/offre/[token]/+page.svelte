<script lang="ts">
	import { page } from '$app/state'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	const offer = $derived(data.offer)
	const error = $derived(data.error)
	const accessLevel = $derived(data.accessLevel)
	const hasDirectSourceAccess = $derived(accessLevel === 'FULL')

	// Présent uniquement si on arrive via un short link (/s/{code}) — code de
	// parrainage de l'abonné qui a partagé l'offre, à faire voyager jusqu'à
	// l'inscription WhatsApp du destinataire (voir apps/bot/src/whatsapp/parser.ts).
	const ref = $derived(page.url.searchParams.get('ref'))

	const BOT_PHONE = '22645010707'
	const BOT_WA_LINK = $derived(
		`https://wa.me/${BOT_PHONE}?text=${encodeURIComponent(ref ? `OFFRES REF-${ref}` : 'OFFRES')}`
	)

	let shareCopied = $state(false)
	let shortUrl = $state<string | null>(null)

	function trackSourceClick() {
		fetch(`${data.apiBase}/api/offre/${data.jobId}/click?t=${data.jwt}`, {
			method: 'POST',
			keepalive: true,
		}).catch(() => {})
	}

	function trackLockedClick() {
		fetch(`${data.apiBase}/api/offre/${data.jobId}/click-locked?t=${data.jwt}`, {
			method: 'POST',
			keepalive: true,
		}).catch(() => {})
	}

	function trackShare() {
		fetch(`${data.apiBase}/api/offre/${data.jobId}/share?t=${data.jwt}`, {
			method: 'POST',
			keepalive: true,
		}).catch(() => {})
	}

	async function ensureShortUrl(): Promise<string> {
		if (shortUrl) return shortUrl
		try {
			const res = await fetch(`${data.apiBase}/api/offre/${data.jobId}/shortlink?t=${data.jwt}`, {
				method: 'POST',
			})
			if (res.ok) {
				const body: { shortUrl: string } = await res.json()
				shortUrl = body.shortUrl
				return shortUrl
			}
		} catch {
			// réseau indisponible — on retombe sur l'URL complète
		}
		return page.url.href
	}

	// Prépare le short link dès que l'offre est chargée, pour que le lien
	// "Partager sur WhatsApp" du footer (un <a href>, pas un clic asynchrone)
	// pointe déjà vers l'URL courte au moment où l'utilisateur clique dessus.
	$effect(() => {
		if (offer) ensureShortUrl()
	})

	const shareMessage = $derived(
		offer
			? `${offer.title} — ${offer.organization} (${offer.city})\n${shortUrl ?? page.url.href}\n\nTrouvé sur Tumaa 🤖 Pour recevoir des offres comme celle-ci sur WhatsApp, écris "OFFRES" au +226 45 01 07 07 : ${BOT_WA_LINK}`
			: ''
	)

	async function shareOffer() {
		if (!offer) return
		await ensureShortUrl()
		const shareData = {
			title: `${offer.title} — ${offer.organization}`,
			text: shareMessage,
		}
		if (navigator.share) {
			try {
				await navigator.share(shareData)
				trackShare()
			} catch {
				// annulé par l'utilisateur — rien à faire
			}
			return
		}
		try {
			await navigator.clipboard.writeText(shareMessage)
			shareCopied = true
			trackShare()
			setTimeout(() => { shareCopied = false }, 2000)
		} catch {
			window.open(waShareUrl, '_blank', 'noopener,noreferrer')
			trackShare()
		}
	}

	const CONTRACT_LABELS: Record<string, string> = {
		CDI: 'CDI', CDD: 'CDD', STAGE: 'Stage', ALTERNANCE: 'Alternance',
		FREELANCE: 'Freelance', BENEVOLE: 'Bénévolat', AUTRE: 'Autre',
	}

	const daysLeft = $derived(
		offer?.deadline
			? Math.ceil((new Date(offer.deadline).getTime() - Date.now()) / 86_400_000)
			: null
	)

	const isVerified = $derived(offer != null && offer.sourceTrustScore > 0.8)

	const waShareUrl = $derived(
		offer ? `https://wa.me/?text=${encodeURIComponent(shareMessage)}` : '#'
	)

	const requirements = $derived(
		offer?.requirements
			? offer.requirements.split('\n').filter(Boolean)
			: []
	)

	const sourceOrigin = $derived.by(() => {
		if (!offer?.sourceUrl) return null
		try {
			return new URL(offer.sourceUrl).origin
		} catch {
			return null
		}
	})

	const sourceHostname = $derived(
		sourceOrigin ? new URL(sourceOrigin).hostname.replace(/^www\./, '') : null
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
			href={BOT_WA_LINK}
			class="wa-back"
			target="_blank"
			rel="noopener noreferrer"
		>
			← Retour WhatsApp
		</a>
	</header>

	{#if offer}
		<div class="share-friend-bar">
			<button type="button" class="share-friend-btn" onclick={shareOffer}>
				{shareCopied ? '✓ Lien copié' : '📤 Envoyer Tumaa à un ami'}
			</button>
		</div>
	{/if}

	<div class="container">
		{#if error}
			<div class="error-state">
				<p class="error-icon">⚠️</p>
				<h1>Offre introuvable</h1>
				<p>{error}</p>
				<a href={BOT_WA_LINK} target="_blank" rel="noopener noreferrer" class="cta-btn">
					Voir d'autres offres sur WhatsApp
				</a>
			</div>
		{:else if offer}
			<div class="promo-zone promo-zone-top">
				<span class="promo-zone-label">Partenaire</span>
			</div>

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
					<div class="meta-item">
						<span class="meta-label">Date limite</span>
						<span>
							{offer.deadline
								? new Date(offer.deadline).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
								: '—'}
						</span>
					</div>
				</div>

				<!-- CORPS -->
				{#if offer.description}
					<section class="section">
						<h2>Aperçu du poste</h2>
						<p class="body-text">{offer.description}</p>
						{#if offer.sourceUrl}
							<p class="source-hint">Description complète sur le site source ↓</p>
						{/if}
					</section>
				{/if}

				<!-- SOURCE -->
				{#if hasDirectSourceAccess && offer.sourceUrl}
					<section class="section source-cta">
						<div class="cta-row">
							<a
								href={offer.sourceUrl}
								class="cta-btn cta-primary"
								target="_blank"
								rel="noopener noreferrer"
								onclick={trackSourceClick}
							>
								Cliquer pour voir l'offre complète
							</a>
							<button type="button" class="cta-btn cta-share" onclick={shareOffer}>
								{shareCopied ? '✓ Lien copié' : '📤 Partager avec un ami'}
							</button>
						</div>
						{#if sourceHostname}
							<p class="source-hint">
								Publiée par
								<a href={sourceOrigin} target="_blank" rel="noopener noreferrer">{sourceHostname}</a>
							</p>
						{/if}
					</section>
				{:else}
					<section class="section source-cta">
						<div class="cta-row">
							<a
								href="https://tumaa.bf/offres.html"
								class="cta-btn cta-primary"
								target="_blank"
								rel="noopener noreferrer"
								onclick={trackLockedClick}
							>
								Voir toutes les offres
							</a>
							<button type="button" class="cta-btn cta-share" onclick={shareOffer}>
								{shareCopied ? '✓ Lien copié' : '📤 Partager avec un ami'}
							</button>
						</div>
						<p class="source-hint">
							Passe en
							<a
								href={`https://wa.me/${BOT_PHONE}?text=${encodeURIComponent('PREMIUM')}`}
								target="_blank"
								rel="noopener noreferrer"
							>Premium</a>
							pour accéder directement à l'annonce complète.
						</p>
					</section>
				{/if}

				<!-- PARTENAIRE -->
				<div class="promo-zone promo-zone-inline">
					<span class="promo-zone-label">Partenaire</span>
				</div>

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

				<!-- FOOTER -->
				<footer class="offer-footer">
					{#if offer.sourceName}
						<span class="source-label">Source : {offer.sourceName}</span>
					{/if}
					<a
						href={waShareUrl}
						class="share-btn"
						target="_blank"
						rel="noopener noreferrer"
						onclick={trackShare}
					>
						📤 Partager sur WhatsApp
					</a>
				</footer>
			</article>
		{/if}
	</div>

	<footer class="site-footer">
		<div class="site-footer-inner">
			<a href="/" class="site-footer-brand">
				<img src="/logo.png" alt="Tumaa" class="site-footer-logo" />
			</a>
			<nav class="site-footer-links">
				<a href="https://tumaa.bf/cgu.html" target="_blank" rel="noopener noreferrer">CGU</a>
				<span class="site-footer-sep">·</span>
				<a href="https://tumaa.bf/mentions-legales.html" target="_blank" rel="noopener noreferrer">Mentions légales</a>
			</nav>
			<p class="site-footer-copy">© {new Date().getFullYear()} Tumaa — Burkina Faso</p>
		</div>
	</footer>
</div>

<style>
	.page { min-height: 100vh; background: var(--color-bg-subtle, #f5f7f5); }

	/* TOPBAR */
	.topbar {
		background: #fff;
		border-bottom: 1px solid var(--color-border, #e5e7e5);
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
		color: var(--color-green-dark, #0f5730);
		text-decoration: none;
		font-weight: 500;
	}
	.wa-back:hover { color: var(--color-green, #1a7c4a); }

	/* SHARE FRIEND BAR */
	.share-friend-bar {
		display: flex;
		justify-content: center;
		padding: 0.75rem 1rem;
		background: var(--color-green-light, #e8f5ee);
		border-bottom: 1px solid var(--color-border, #e5e7e5);
	}
	.share-friend-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		background: var(--color-green, #1a7c4a);
		color: #fff;
		border: none;
		padding: 0.55rem 1.25rem;
		border-radius: 20px;
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: background 0.15s;
	}
	.share-friend-btn:hover { background: var(--color-green-dark, #0f5730); }

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
		grid-template-columns: repeat(4, 1fr);
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

	/* SOURCE */
	.source-cta {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		text-align: center;
		background: var(--color-bg-subtle, #f5f7f5);
	}
	.source-hint { font-size: 0.8rem; color: var(--color-text-muted, #6b7280); }
	.source-hint a {
		color: var(--color-green-dark, #0f5730);
		font-weight: 600;
		text-decoration: none;
	}
	.source-hint a:hover { text-decoration: underline; }
	.cta-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.6rem;
	}
	.cta-share {
		background: var(--color-bg, #fff);
		color: var(--color-green, #1a7c4a);
		border: 1px solid var(--color-green, #1a7c4a);
		cursor: pointer;
	}
	.cta-share:hover { background: var(--color-green-light, #e8f5ee); }

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
		font-size: 1.05rem;
		padding: 0.85rem 1.75rem;
	}
	.cta-primary:hover { background: var(--color-green-dark, #0f5730); }

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

	/* PROMO ZONES */
	.promo-zone {
		max-width: 760px;
		margin: 0 auto 1rem;
		padding: 1.25rem 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: repeating-linear-gradient(
			45deg,
			var(--color-bg-subtle, #f5f7f5),
			var(--color-bg-subtle, #f5f7f5) 10px,
			#eceeec 10px,
			#eceeec 20px
		);
		border: 1px dashed var(--color-border, #d7dbd7);
		border-radius: 10px;
		min-height: 90px;
	}
	.promo-zone-top { margin-top: 2rem; }
	.promo-zone-inline { margin: 0 -1.5rem; max-width: none; border-radius: 0; border-left: none; border-right: none; }
	.promo-zone-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted, #6b7280);
	}

	/* SITE FOOTER */
	.site-footer {
		margin-top: 2.5rem;
		padding: 2rem 1.5rem 2.5rem;
		background: #fff;
		border-top: 1px solid var(--color-border, #e5e7e5);
	}
	.site-footer-inner {
		max-width: 760px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		text-align: center;
	}
	.site-footer-logo {
		height: 28px;
		width: auto;
		object-fit: contain;
		border-radius: 6px;
		opacity: 0.9;
	}
	.site-footer-links {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
	}
	.site-footer-links a {
		color: var(--color-green-dark, #0f5730);
		text-decoration: none;
		font-weight: 500;
	}
	.site-footer-links a:hover { color: var(--color-green, #1a7c4a); text-decoration: underline; }
	.site-footer-sep { color: var(--color-text-muted, #6b7280); }
	.site-footer-copy {
		font-size: 0.75rem;
		color: var(--color-text-muted, #6b7280);
	}

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
