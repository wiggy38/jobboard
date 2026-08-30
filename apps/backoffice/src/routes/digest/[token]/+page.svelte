<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	const offers = $derived(data.offers)
	const error = $derived(data.error)

	const BOT_PHONE = '22645010707'
	const BOT_WA_LINK = `https://wa.me/${BOT_PHONE}?text=${encodeURIComponent('OFFRES')}`

	const CONTRACT_LABELS: Record<string, string> = {
		CDI: 'CDI', CDD: 'CDD', STAGE: 'Stage', ALTERNANCE: 'Alternance',
		FREELANCE: 'Freelance', BENEVOLE: 'Bénévolat', AUTRE: 'Autre',
	}
</script>

<svelte:head>
	<title>Votre sélection du jour | Tumaa</title>
</svelte:head>

<div class="page">
	<header class="topbar">
		<a href="/" class="brand">
			<img src="/logo.png" alt="Tumaa" class="brand-logo" />
		</a>
		<a href={BOT_WA_LINK} class="wa-back" target="_blank" rel="noopener noreferrer">
			← Retour WhatsApp
		</a>
	</header>

	<div class="container">
		{#if error}
			<div class="error-state">
				<p class="error-icon">⚠️</p>
				<h1>Sélection introuvable</h1>
				<p>{error}</p>
				<a href={BOT_WA_LINK} target="_blank" rel="noopener noreferrer" class="cta-btn">
					Voir mes offres sur WhatsApp
				</a>
			</div>
		{:else if offers}
			<h1 class="page-title">🎯 Votre sélection du jour</h1>
			<p class="page-subtitle">{offers.length} offre{offers.length > 1 ? 's' : ''} correspondant à votre profil</p>

			<div class="offer-list">
				{#each offers as offer (offer.id)}
					<article class="offer-card">
						<div class="tags-bar">
							<span class="tag">{CONTRACT_LABELS[offer.contractType] ?? offer.contractType}</span>
							<span class="tag">{offer.sector}</span>
							<span class="tag">{offer.city}</span>
						</div>
						<h2 class="offer-title">{offer.title}</h2>
						<p class="offer-org">{offer.organization}</p>
						{#if offer.sourceUrl}
							<a href={offer.sourceUrl} class="cta-btn cta-primary" target="_blank" rel="noopener noreferrer">
								Voir l'offre complète
							</a>
						{/if}
						{#if offer.sourceName}
							<span class="source-label">Source : {offer.sourceName}</span>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.page { min-height: 100vh; background: var(--color-bg-subtle, #f5f7f5); }

	.topbar {
		background: #fff;
		border-bottom: 1px solid var(--color-border, #e5e7e5);
		padding: 0.875rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.brand { text-decoration: none; line-height: 0; }
	.brand-logo { height: 36px; width: auto; object-fit: contain; border-radius: 6px; }
	.wa-back { font-size: 0.85rem; color: var(--color-green-dark, #0f5730); text-decoration: none; font-weight: 500; }
	.wa-back:hover { color: var(--color-green, #1a7c4a); }

	.container { max-width: 760px; margin: 2rem auto; padding: 0 1rem; }

	.page-title { font-size: 1.4rem; margin-bottom: 0.25rem; }
	.page-subtitle { font-size: 0.9rem; color: var(--color-text-muted, #6b7280); margin-bottom: 1.25rem; }

	.offer-list { display: flex; flex-direction: column; gap: 1rem; }

	.offer-card {
		background: var(--color-bg, #fff);
		border: 1px solid var(--color-border, #e5e7e5);
		border-radius: 12px;
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.tags-bar { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.tag {
		background: var(--color-green-light, #e8f5ee);
		color: var(--color-green-dark, #0f5730);
		padding: 3px 10px;
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.offer-title { font-size: 1.1rem; font-weight: 600; color: var(--color-text, #111); margin: 0; }
	.offer-org { font-size: 0.85rem; color: var(--color-text-muted, #6b7280); margin: 0; }

	.cta-btn {
		display: inline-block;
		padding: 0.55rem 1.1rem;
		border-radius: 8px;
		font-weight: 700;
		font-size: 0.85rem;
		text-decoration: none;
		transition: background 0.15s;
	}
	.cta-primary { background: var(--color-green, #1a7c4a); color: #fff; }
	.cta-primary:hover { background: var(--color-green-dark, #0f5730); }

	.source-label { font-size: 0.75rem; color: var(--color-text-muted, #6b7280); }

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
