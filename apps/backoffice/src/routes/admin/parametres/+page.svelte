<script lang="ts">
	import type { PageData } from './$types.js';
	import { adminApi } from '$lib/api.js';
	import { SETTING_KEYS, SCRAPER_REGISTRY, UNLIMITED, type UserPlan, type ProfileOption } from '@tumaa/shared';

	let { data }: { data: PageData } = $props();

	const COUNTRY_LABEL: Record<string, string> = {
		BF: '🇧🇫 Burkina Faso',
		BJ: '🇧🇯 Bénin',
		TG: '🇹🇬 Togo',
		CI: "🇨🇮 Côte d'Ivoire",
		SN: '🇸🇳 Sénégal',
	};

	const PLANS: UserPlan[] = ['FREEMIUM', 'PREMIUM', 'ELITE'];
	const PLAN_LABEL: Record<UserPlan, string> = { FREEMIUM: 'Freemium', PREMIUM: 'Premium', ELITE: 'Elite' };

	const SECTIONS = [
		{ id: 'scrapers', label: 'Scrapers', icon: '🕷️' },
		{ id: 'templates', label: 'Templates payants', icon: '💬' },
		{ id: 'pull', label: 'Pull WhatsApp', icon: '📲' },
		{ id: 'plans', label: "Formules d'abonnement", icon: '💳' },
		{ id: 'pricing', label: 'Tarifs', icon: '🏷️' },
		{ id: 'fullAccess', label: 'Full access', icon: '🔓' },
		{ id: 'levels', label: "Niveaux d'études", icon: '🎓' },
		{ id: 'sectors', label: "Secteurs d'activité", icon: '🏢' },
		{ id: 'cities', label: 'Villes par pays', icon: '📍' },
		{ id: 'channels', label: 'Canaux & Scouts', icon: '📡' },
		{ id: 'whatsappBotNumbers', label: 'Numéro du bot', icon: '☎️' },
		{ id: 'scraperMisc', label: 'Scraper — divers', icon: '⚙️' },
		{ id: 'payments', label: 'Paiements', icon: '💰' },
	] as const;
	type SectionId = (typeof SECTIONS)[number]['id'];
	let activeSection = $state<SectionId>('scrapers');

	// ── État local par section (clonage profond depuis data.settings) ──────
	let alertThreshold = $state(data.settings[SETTING_KEYS.SCRAPER_ALERT_THRESHOLD]);
	let retryAttempts = $state(data.settings[SETTING_KEYS.SCRAPER_RETRY_ATTEMPTS]);
	// Les entrées enregistrées avant l'ajout du champ `country` n'en ont pas —
	// on les traite comme BF (comportement historique, un seul pays desservi).
	let schedule = $state(
		structuredClone(data.settings[SETTING_KEYS.SCRAPER_SCHEDULE]).map((j) => ({ ...j, country: j.country ?? 'BF' }))
	);
	const SCRAPER_COUNTRIES = ['BF', 'BJ', 'TG', 'CI', 'SN'];
	let activeScraperCountry = $state(SCRAPER_COUNTRIES.find((c) => schedule.some((j) => j.country === c)) ?? 'BF');
	const visibleSchedule = $derived(schedule.filter((j) => j.country === activeScraperCountry));
	// Scrapers du registre pour le pays actif pas encore programmés — évite de
	// laisser l'admin taper une scraperKey libre (typo = job silencieusement
	// ignoré par apps/scraper/src/scheduler.ts).
	const addableScrapers = $derived(
		SCRAPER_REGISTRY.filter((r) => r.country === activeScraperCountry && !schedule.some((j) => j.scraperKey === r.key))
	);
	let scraperToAdd = $state('');
	$effect(() => {
		if (!addableScrapers.some((r) => r.key === scraperToAdd)) {
			scraperToAdd = addableScrapers[0]?.key ?? '';
		}
	});
	function addScheduleEntry() {
		if (!scraperToAdd) return;
		schedule = [
			...schedule,
			{ name: `${scraperToAdd}-daily`, scraperKey: scraperToAdd, pattern: '0 12 * * *', country: activeScraperCountry },
		];
	}

	let templateCaps = $state(structuredClone(data.settings[SETTING_KEYS.TEMPLATE_CAPS]));

	let pullBatchSize = $state(data.settings[SETTING_KEYS.PULL_BATCH_SIZE]);

	let planLimits = $state(structuredClone(data.settings[SETTING_KEYS.PLAN_LIMITS]));

	let levels = $state<ProfileOption[]>(structuredClone(data.settings[SETTING_KEYS.REFERENCE_LEVELS]));
	let sectors = $state<ProfileOption[]>(structuredClone(data.settings[SETTING_KEYS.REFERENCE_SECTORS]));
	let citiesByCountry = $state<Record<string, ProfileOption[]>>(
		structuredClone(data.settings[SETTING_KEYS.REFERENCE_CITIES_BY_COUNTRY])
	);
	let activeCityCountry = $state(Object.keys(citiesByCountry)[0] ?? 'BF');

	let inviteLinks = $state<Record<string, string>>(structuredClone(data.settings[SETTING_KEYS.CHANNEL_INVITE_LINKS]));
	let botNumbers = $state<Record<string, string>>(structuredClone(data.settings[SETTING_KEYS.WHATSAPP_BOT_NUMBERS]));
	let captureRate = $state(data.settings[SETTING_KEYS.SCOUTS_CAPTURE_RATE]);

	let reportEmailTo = $state(data.settings[SETTING_KEYS.SCRAPER_REPORT_EMAIL_TO]);
	let careerjetAffid = $state(data.settings[SETTING_KEYS.SCRAPER_CAREERJET_AFFID]);

	let fullAccess = $state(data.settings[SETTING_KEYS.OFFER_FULL_ACCESS]);

	// Nb de profils référençant chaque valeur de secteur/ville/niveau — sert à
	// désactiver la suppression d'une valeur encore utilisée (le backend rejette
	// aussi cette suppression via PATCH /admin/settings/:key, ceci n'est qu'un
	// indicateur pour éviter à l'admin une manip pour rien).
	const referenceUsage = data.referenceUsage;

	const PAID_PLANS = ['PREMIUM', 'ELITE'] as const;
	// Repli défensif si l'API tourne encore sur un ancien build de @tumaa/shared
	// (avant l'ajout de PLAN_PRICING) — évite un crash de composant (page blanche)
	// tant que le serveur n'a pas été redémarré.
	const DEFAULT_PRICING = { PREMIUM: { barredPrice: 650, price: 650 }, ELITE: { barredPrice: 1250, price: 1250 } };
	let pricing = $state(structuredClone(data.settings[SETTING_KEYS.PLAN_PRICING] ?? DEFAULT_PRICING));

	let paydunyaMode = $state(data.settings[SETTING_KEYS.PAYMENTS_PAYDUNYA_MODE]);
	let paydunyaConfirmOpen = $state(false);
	let pendingPaydunyaMode = $state<'test' | 'live' | null>(null);

	// ── Sauvegarde générique par section ────────────────────────────────
	type SectionStatus = 'idle' | 'saving' | 'saved' | 'error';
	let status = $state<Record<string, SectionStatus>>({});
	let errorMsg = $state<Record<string, string>>({});

	async function saveSection(section: string, key: (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS], value: unknown) {
		status = { ...status, [section]: 'saving' };
		try {
			const res = await adminApi.updateSetting(key, value as never);
			status = { ...status, [section]: 'saved' };
			errorMsg = { ...errorMsg, [section]: res.warning ?? '' };
			setTimeout(() => { if (status[section] === 'saved') status = { ...status, [section]: 'idle' }; }, 3000);
		} catch (e) {
			status = { ...status, [section]: 'error' };
			errorMsg = { ...errorMsg, [section]: e instanceof Error ? e.message : 'Erreur inconnue' };
		}
	}

	function addOption(list: ProfileOption[]): ProfileOption[] {
		return [...list, { value: '', label: '' }];
	}
	function removeOption(list: ProfileOption[], index: number): ProfileOption[] {
		return list.filter((_, i) => i !== index);
	}

	function requestPaydunyaMode(mode: 'test' | 'live') {
		if (mode === 'live' && paydunyaMode !== 'live') {
			pendingPaydunyaMode = mode;
			paydunyaConfirmOpen = true;
			return;
		}
		paydunyaMode = mode;
	}
	function confirmPaydunyaLive() {
		if (pendingPaydunyaMode) paydunyaMode = pendingPaydunyaMode;
		paydunyaConfirmOpen = false;
		pendingPaydunyaMode = null;
	}
	function cancelPaydunyaLive() {
		paydunyaConfirmOpen = false;
		pendingPaydunyaMode = null;
	}
</script>

<!-- Modal confirmation Paydunya LIVE -->
{#if paydunyaConfirmOpen}
	<div class="overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-header"><h2>⚠️ Bascule en mode LIVE</h2></div>
			<div class="modal-body">
				<p>Les paiements Paydunya seront désormais des <strong>transactions réelles</strong>. Confirme uniquement si les clés API live sont bien configurées côté serveur.</p>
			</div>
			<div class="modal-footer">
				<button class="btn-secondary" onclick={cancelPaydunyaLive}>Annuler</button>
				<button class="btn-danger" onclick={confirmPaydunyaLive}>Confirmer le mode LIVE</button>
			</div>
		</div>
	</div>
{/if}

<div class="page">
	<h1>Paramètres</h1>
	<p class="page-subtitle">Réservé aux comptes SUPER_ADMIN — ces réglages s'appliquent immédiatement, sans redéploiement.</p>

	<div class="layout">
		<nav class="section-nav">
			{#each SECTIONS as s}
				<button
					class="section-btn"
					class:section-btn-active={activeSection === s.id}
					onclick={() => (activeSection = s.id)}
				>
					<span class="section-icon">{s.icon}</span>
					{s.label}
				</button>
			{/each}
		</nav>

		<div class="section-content">

	<!-- ── Scrapers ─────────────────────────────────────────────────── -->
	{#if activeSection === 'scrapers'}
	<section class="card">
		<div class="card-header">
			<h2>Scrapers</h2>
			{#if status.scrapers === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.scrapers === 'error'}<span class="status-error">{errorMsg.scrapers}</span>{/if}
		</div>

		<div class="field-row">
			<div class="field">
				<label for="alertThreshold">Nb d'échecs avant alerte</label>
				<input id="alertThreshold" type="number" min="1" bind:value={alertThreshold} />
			</div>
			<div class="field">
				<label for="retryAttempts">Nb de tentatives (retry)</label>
				<input id="retryAttempts" type="number" min="1" bind:value={retryAttempts} />
			</div>
			<button
				class="btn-primary"
				disabled={status.scrapers === 'saving'}
				onclick={async () => {
					await saveSection('scrapers', SETTING_KEYS.SCRAPER_ALERT_THRESHOLD, Number(alertThreshold));
					await saveSection('scrapers', SETTING_KEYS.SCRAPER_RETRY_ATTEMPTS, Number(retryAttempts));
				}}
			>
				Enregistrer
			</button>
		</div>

		<h3 class="subheading">Programmation (cron) — par pays</h3>
		<div class="tabs">
			{#each SCRAPER_COUNTRIES as country}
				<button class="tab" class:tab-active={activeScraperCountry === country} onclick={() => (activeScraperCountry = country)}>
					{COUNTRY_LABEL[country] ?? country}
					<span class="tab-count">{schedule.filter((j) => j.country === country).length}</span>
				</button>
			{/each}
		</div>
		<div class="table-wrap">
			<table>
				<thead><tr><th>Nom du job</th><th>Scraper</th><th>Pattern cron</th></tr></thead>
				<tbody>
					{#each visibleSchedule as job}
						<tr>
							<td class="mono">{job.name}</td>
							<td class="mono">{job.scraperKey}</td>
							<td><input type="text" class="cron-input" bind:value={job.pattern} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if visibleSchedule.length === 0}
				<p class="empty-hint">Aucun scraper programmé pour ce pays.</p>
			{/if}
		</div>
		<p class="hint">Un scraper programmé ne peut pas être retiré d'ici — utilise "Désactiver" sur <a href="/admin/scrapers">/admin/scrapers</a> pour l'arrêter sans perdre sa programmation.</p>
		<div class="list-actions">
			{#if addableScrapers.length > 0}
				<div class="add-scraper-row">
					<select bind:value={scraperToAdd} aria-label="Scraper à ajouter">
						{#each addableScrapers as r}
							<option value={r.key}>{r.key}</option>
						{/each}
					</select>
					<button class="btn-secondary" onclick={addScheduleEntry}>
						+ Ajouter ({COUNTRY_LABEL[activeScraperCountry] ?? activeScraperCountry})
					</button>
				</div>
			{:else}
				<p class="hint">Tous les scrapers connus pour ce pays sont déjà programmés.</p>
			{/if}
			<button
				class="btn-primary"
				disabled={status.schedule === 'saving'}
				onclick={() => saveSection('schedule', SETTING_KEYS.SCRAPER_SCHEDULE, schedule)}
			>
				Enregistrer la programmation
			</button>
		</div>
		{#if status.schedule === 'saved'}<span class="status-ok">✓ Appliqué à la queue</span>{/if}
		{#if status.schedule === 'error'}<span class="status-error">{errorMsg.schedule}</span>{/if}
		{#if errorMsg.schedule && status.schedule === 'saved'}<p class="hint-warning">{errorMsg.schedule}</p>{/if}
	</section>
	{/if}

	<!-- ── Templates payants ────────────────────────────────────────── -->
	{#if activeSection === 'templates'}
	<section class="card">
		<div class="card-header">
			<h2>Templates payants (par abonné / mois)</h2>
			{#if status.templates === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.templates === 'error'}<span class="status-error">{errorMsg.templates}</span>{/if}
		</div>
		<div class="field-row">
			<div class="field">
				<label for="capRelance">Relance</label>
				<input id="capRelance" type="number" min="0" bind:value={templateCaps.RELANCE} />
			</div>
			<div class="field">
				<label for="capMatch">Match parfait</label>
				<input id="capMatch" type="number" min="0" bind:value={templateCaps.MATCH_PARFAIT} />
			</div>
			<div class="field">
				<label for="capNudge">Nudge Premium</label>
				<input id="capNudge" type="number" min="0" bind:value={templateCaps.NUDGE_PREMIUM} />
			</div>
			<div class="field">
				<label for="capGlobal">Plafond global</label>
				<input id="capGlobal" type="number" min="0" bind:value={templateCaps.GLOBAL_CAP} />
			</div>
		</div>
		<button
			class="btn-primary"
			disabled={status.templates === 'saving'}
			onclick={() => saveSection('templates', SETTING_KEYS.TEMPLATE_CAPS, templateCaps)}
		>
			Enregistrer
		</button>
	</section>
	{/if}

	<!-- ── Pull ─────────────────────────────────────────────────────── -->
	{#if activeSection === 'pull'}
	<section class="card">
		<div class="card-header">
			<h2>Pull WhatsApp</h2>
			{#if status.pull === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.pull === 'error'}<span class="status-error">{errorMsg.pull}</span>{/if}
		</div>
		<div class="field-row">
			<div class="field">
				<label for="pullBatchSize">Nb max d'offres envoyées par pull (OFFRES/SUITE)</label>
				<input id="pullBatchSize" type="number" min="1" bind:value={pullBatchSize} />
			</div>
			<button
				class="btn-primary"
				disabled={status.pull === 'saving'}
				onclick={() => saveSection('pull', SETTING_KEYS.PULL_BATCH_SIZE, Number(pullBatchSize))}
			>
				Enregistrer
			</button>
		</div>
	</section>
	{/if}

	<!-- ── Formules d'abonnement ────────────────────────────────────── -->
	{#if activeSection === 'plans'}
	<section class="card">
		<div class="card-header">
			<h2>Formules d'abonnement</h2>
			{#if status.plans === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.plans === 'error'}<span class="status-error">{errorMsg.plans}</span>{/if}
		</div>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Formule</th>
						<th>Villes</th>
						<th>Secteurs</th>
						<th>Niveaux</th>
						<th>Contrats</th>
						<th>Pays</th>
						<th>Alertes mots-clés</th>
					</tr>
				</thead>
				<tbody>
					{#each PLANS as plan}
						<tr>
							<td class="plan-name">{PLAN_LABEL[plan]}</td>
							<td><input type="number" min="0" class="num-input" bind:value={planLimits[plan].maxCities} /></td>
							<td><input type="number" min="0" class="num-input" bind:value={planLimits[plan].maxSectors} /></td>
							<td><input type="number" min="0" class="num-input" bind:value={planLimits[plan].maxLevels} /></td>
							<td><input type="number" min="0" class="num-input" bind:value={planLimits[plan].maxContractGroups} /></td>
							<td><input type="number" min="0" class="num-input" bind:value={planLimits[plan].maxCountries} /></td>
							<td><input type="checkbox" bind:checked={planLimits[plan].keywordAlertsEnabled} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="hint">Astuce : {UNLIMITED} = illimité (utilisé par ELITE).</p>
		<button
			class="btn-primary"
			disabled={status.plans === 'saving'}
			onclick={() => saveSection('plans', SETTING_KEYS.PLAN_LIMITS, planLimits)}
		>
			Enregistrer
		</button>
	</section>
	{/if}

	<!-- ── Tarifs ───────────────────────────────────────────────────── -->
	{#if activeSection === 'pricing'}
	<section class="card">
		<div class="card-header">
			<h2>Tarifs</h2>
			{#if status.pricing === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.pricing === 'error'}<span class="status-error">{errorMsg.pricing}</span>{/if}
		</div>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Formule</th>
						<th>Prix barré (FCFA)</th>
						<th>Prix réel (FCFA)</th>
					</tr>
				</thead>
				<tbody>
					{#each PAID_PLANS as plan}
						<tr>
							<td class="plan-name">{PLAN_LABEL[plan]}</td>
							<td><input type="number" min="0" class="num-input" bind:value={pricing[plan].barredPrice} /></td>
							<td><input type="number" min="0" class="num-input" bind:value={pricing[plan].price} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="hint">Le prix barré n'est qu'un affichage marketing — seul le prix réel est facturé (PayDunya). Laissez les deux valeurs égales pour ne pas afficher de réduction.</p>
		<button
			class="btn-primary"
			disabled={status.pricing === 'saving'}
			onclick={() => saveSection('pricing', SETTING_KEYS.PLAN_PRICING, pricing)}
		>
			Enregistrer
		</button>
	</section>
	{/if}

	<!-- ── Full access ──────────────────────────────────────────────── -->
	{#if activeSection === 'fullAccess'}
	<section class="card">
		<div class="card-header">
			<h2>Full access</h2>
			{#if status.fullAccess === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.fullAccess === 'error'}<span class="status-error">{errorMsg.fullAccess}</span>{/if}
		</div>
		<div class="field-row">
			<div class="field">
				<label>
					<input type="checkbox" bind:checked={fullAccess} />
					Full access — les Freemium ont aussi accès à la source des offres
				</label>
			</div>
			<button
				class="btn-primary"
				disabled={status.fullAccess === 'saving'}
				onclick={() => saveSection('fullAccess', SETTING_KEYS.OFFER_FULL_ACCESS, fullAccess)}
			>
				Enregistrer
			</button>
		</div>
		<p class="hint">N'affecte que la page web tokenisée `/offre/[token]` — le comportement des liens WhatsApp reste inchangé.</p>
	</section>
	{/if}

	<!-- ── Référentiels ─────────────────────────────────────────────── -->
	{#if activeSection === 'levels'}
	<section class="card">
		<div class="card-header">
			<h2>Niveaux d'études</h2>
			{#if status.levels === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.levels === 'error'}<span class="status-error">{errorMsg.levels}</span>{/if}
		</div>
		<div class="option-list">
			{#each levels as opt, i}
				<div class="option-row">
					<input type="text" placeholder="Valeur" bind:value={opt.value} oninput={() => (opt.label = opt.value)} />
					{#if referenceUsage.levels[opt.value] > 0}
						<span class="tab-count" title={`Utilisé par ${referenceUsage.levels[opt.value]} profil(s) — impossible à supprimer`}>🔒 {referenceUsage.levels[opt.value]}</span>
					{/if}
					<button
						class="btn-remove"
						disabled={referenceUsage.levels[opt.value] > 0}
						onclick={() => (levels = removeOption(levels, i))}
						aria-label="Supprimer"
						title={referenceUsage.levels[opt.value] > 0 ? `Utilisé par ${referenceUsage.levels[opt.value]} profil(s) — impossible à supprimer` : 'Supprimer'}
					>✕</button>
				</div>
			{/each}
		</div>
		<div class="list-actions">
			<button class="btn-secondary" onclick={() => (levels = addOption(levels))}>+ Ajouter un niveau</button>
			<button class="btn-primary" disabled={status.levels === 'saving'} onclick={() => saveSection('levels', SETTING_KEYS.REFERENCE_LEVELS, levels.filter(o => o.value.trim()))}>Enregistrer</button>
		</div>
	</section>
	{/if}

	{#if activeSection === 'sectors'}
	<section class="card">
		<div class="card-header">
			<h2>Secteurs d'activité</h2>
			{#if status.sectors === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.sectors === 'error'}<span class="status-error">{errorMsg.sectors}</span>{/if}
		</div>
		<div class="option-list">
			{#each sectors as opt, i}
				<div class="option-row">
					<input type="text" placeholder="Valeur" bind:value={opt.value} oninput={() => (opt.label = opt.value)} />
					{#if referenceUsage.sectors[opt.value] > 0}
						<span class="tab-count" title={`Utilisé par ${referenceUsage.sectors[opt.value]} profil(s) — impossible à supprimer`}>🔒 {referenceUsage.sectors[opt.value]}</span>
					{/if}
					<button
						class="btn-remove"
						disabled={referenceUsage.sectors[opt.value] > 0}
						onclick={() => (sectors = removeOption(sectors, i))}
						aria-label="Supprimer"
						title={referenceUsage.sectors[opt.value] > 0 ? `Utilisé par ${referenceUsage.sectors[opt.value]} profil(s) — impossible à supprimer` : 'Supprimer'}
					>✕</button>
				</div>
			{/each}
		</div>
		<div class="list-actions">
			<button class="btn-secondary" onclick={() => (sectors = addOption(sectors))}>+ Ajouter un secteur</button>
			<button class="btn-primary" disabled={status.sectors === 'saving'} onclick={() => saveSection('sectors', SETTING_KEYS.REFERENCE_SECTORS, sectors.filter(o => o.value.trim()))}>Enregistrer</button>
		</div>
	</section>
	{/if}

	{#if activeSection === 'cities'}
	<section class="card">
		<div class="card-header">
			<h2>Villes par pays</h2>
			{#if status.cities === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.cities === 'error'}<span class="status-error">{errorMsg.cities}</span>{/if}
		</div>
		<div class="tabs">
			{#each Object.keys(citiesByCountry) as country}
				<button class="tab" class:tab-active={activeCityCountry === country} onclick={() => (activeCityCountry = country)}>
					{COUNTRY_LABEL[country] ?? country}
					<span class="tab-count">{citiesByCountry[country].length}</span>
				</button>
			{/each}
		</div>
		<div class="option-list">
			{#each citiesByCountry[activeCityCountry] as opt, i}
				<div class="option-row">
					<input type="text" placeholder="Ville" bind:value={opt.value} oninput={() => (opt.label = opt.value)} />
					{#if referenceUsage.cities[opt.value] > 0}
						<span class="tab-count" title={`Utilisé par ${referenceUsage.cities[opt.value]} profil(s) — impossible à supprimer`}>🔒 {referenceUsage.cities[opt.value]}</span>
					{/if}
					<button
						class="btn-remove"
						disabled={referenceUsage.cities[opt.value] > 0}
						onclick={() => (citiesByCountry[activeCityCountry] = removeOption(citiesByCountry[activeCityCountry], i))}
						aria-label="Supprimer"
						title={referenceUsage.cities[opt.value] > 0 ? `Utilisé par ${referenceUsage.cities[opt.value]} profil(s) — impossible à supprimer` : 'Supprimer'}
					>✕</button>
				</div>
			{/each}
			{#if citiesByCountry[activeCityCountry].length === 0}
				<p class="empty-hint">Aucune ville pour ce pays.</p>
			{/if}
		</div>
		<div class="list-actions">
			<button class="btn-secondary" onclick={() => (citiesByCountry[activeCityCountry] = addOption(citiesByCountry[activeCityCountry]))}>+ Ajouter une ville</button>
			<button
				class="btn-primary"
				disabled={status.cities === 'saving'}
				onclick={() => {
					const cleaned = Object.fromEntries(
						Object.entries(citiesByCountry).map(([c, opts]) => [c, opts.filter(o => o.value.trim())])
					);
					citiesByCountry = cleaned;
					saveSection('cities', SETTING_KEYS.REFERENCE_CITIES_BY_COUNTRY, cleaned);
				}}
			>
				Enregistrer
			</button>
		</div>
	</section>
	{/if}

	<!-- ── Canaux & Scouts ──────────────────────────────────────────── -->
	{#if activeSection === 'channels'}
	<section class="card">
		<div class="card-header">
			<h2>Canaux WhatsApp & Scouts</h2>
			{#if status.channels === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.channels === 'error'}<span class="status-error">{errorMsg.channels}</span>{/if}
		</div>
		<div class="field-row">
			{#each ['BF', 'BJ', 'TG', 'CI'] as country}
				<div class="field">
					<label for={`invite-${country}`}>Lien d'invitation {COUNTRY_LABEL[country]}</label>
					<input id={`invite-${country}`} type="text" placeholder="https://wa.me/channel/…" bind:value={inviteLinks[country]} />
				</div>
			{/each}
		</div>
		<div class="field-row">
			<div class="field">
				<label for="captureRate">Taux de capture Scouts (FCFA)</label>
				<input id="captureRate" type="number" min="0" bind:value={captureRate} />
			</div>
			<button
				class="btn-primary"
				disabled={status.channels === 'saving'}
				onclick={async () => {
					await saveSection('channels', SETTING_KEYS.CHANNEL_INVITE_LINKS, inviteLinks);
					await saveSection('channels', SETTING_KEYS.SCOUTS_CAPTURE_RATE, Number(captureRate));
				}}
			>
				Enregistrer
			</button>
		</div>
	</section>
	{/if}

	<!-- ── Numéro du bot WhatsApp ───────────────────────────────────── -->
	{#if activeSection === 'whatsappBotNumbers'}
	<section class="card">
		<div class="card-header">
			<h2>Numéro du bot WhatsApp</h2>
		</div>
		<p class="hint">Numéro affiché dans les liens wa.me sur le site vitrine et l'app d'abonnement (format international sans "+", ex. 22600000000).</p>
		<div class="field-list">
			{#each ['BF', 'BJ', 'TG', 'CI'] as country}
				<div class="field-line">
					<div class="field">
						<label for={`bot-number-${country}`}>{COUNTRY_LABEL[country]}</label>
						<input id={`bot-number-${country}`} type="text" placeholder="22600000000" bind:value={botNumbers[country]} />
					</div>
					<button
						class="btn-primary"
						disabled={status[`whatsappBotNumbers-${country}`] === 'saving'}
						onclick={() => saveSection(`whatsappBotNumbers-${country}`, SETTING_KEYS.WHATSAPP_BOT_NUMBERS, botNumbers)}
					>
						Enregistrer
					</button>
					{#if status[`whatsappBotNumbers-${country}`] === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
					{#if status[`whatsappBotNumbers-${country}`] === 'error'}<span class="status-error">{errorMsg[`whatsappBotNumbers-${country}`]}</span>{/if}
				</div>
			{/each}
		</div>
	</section>
	{/if}

	<!-- ── Scraper — divers ─────────────────────────────────────────── -->
	{#if activeSection === 'scraperMisc'}
	<section class="card">
		<div class="card-header">
			<h2>Scraper — divers</h2>
			{#if status.scraperMisc === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.scraperMisc === 'error'}<span class="status-error">{errorMsg.scraperMisc}</span>{/if}
		</div>
		<div class="field-row">
			<div class="field">
				<label for="reportEmailTo">Email destinataire du rapport quotidien</label>
				<input id="reportEmailTo" type="email" bind:value={reportEmailTo} />
			</div>
			<div class="field">
				<label for="careerjetAffid">ID affilié Careerjet</label>
				<input id="careerjetAffid" type="text" bind:value={careerjetAffid} />
			</div>
			<button
				class="btn-primary"
				disabled={status.scraperMisc === 'saving'}
				onclick={async () => {
					await saveSection('scraperMisc', SETTING_KEYS.SCRAPER_REPORT_EMAIL_TO, reportEmailTo);
					await saveSection('scraperMisc', SETTING_KEYS.SCRAPER_CAREERJET_AFFID, careerjetAffid);
				}}
			>
				Enregistrer
			</button>
		</div>
	</section>
	{/if}

	<!-- ── Paiements ────────────────────────────────────────────────── -->
	{#if activeSection === 'payments'}
	<section class="card">
		<div class="card-header">
			<h2>Paiements</h2>
			{#if status.payments === 'saved'}<span class="status-ok">✓ Enregistré</span>{/if}
			{#if status.payments === 'error'}<span class="status-error">{errorMsg.payments}</span>{/if}
		</div>
		<div class="field-row">
			<div class="field">
				<label for="paydunyaMode">Mode Paydunya</label>
				<select id="paydunyaMode" value={paydunyaMode} onchange={(e) => requestPaydunyaMode((e.target as HTMLSelectElement).value as 'test' | 'live')}>
					<option value="test">Test</option>
					<option value="live">Live</option>
				</select>
			</div>
			<button
				class="btn-primary"
				disabled={status.payments === 'saving'}
				onclick={() => saveSection('payments', SETTING_KEYS.PAYMENTS_PAYDUNYA_MODE, paydunyaMode)}
			>
				Enregistrer
			</button>
		</div>
		<p class="hint">Informatif pour l'instant — PayDunya distingue test/live par le jeu de clés API configuré côté serveur, pas par ce champ.</p>
	</section>
	{/if}

		</div>
	</div>
</div>

<style>
	.page { max-width: 1100px; display: flex; flex-direction: column; gap: 1.5rem; padding-bottom: 3rem; }

	h1 { font-size: 1.5rem; font-weight: 700; margin: 0; }
	.page-subtitle { color: var(--color-text-muted); font-size: 0.85rem; margin: 0.25rem 0 0; }

	.layout { display: flex; gap: 1.5rem; align-items: flex-start; }

	.section-nav {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		width: 220px;
		flex-shrink: 0;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 0.5rem;
		position: sticky;
		top: 1rem;
	}

	.section-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-align: left;
		padding: 0.55rem 0.7rem;
		border-radius: var(--radius-md);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-muted);
		background: none;
		border: none;
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}
	.section-btn:hover { background: var(--color-bg-subtle); color: var(--color-text); }
	.section-btn-active { background: var(--color-green-light); color: #2b9964; }

	.section-icon { font-size: 0.95rem; flex-shrink: 0; }

	.section-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	@media (max-width: 800px) {
		.layout { flex-direction: column; }
		.section-nav {
			width: 100%;
			flex-direction: row;
			flex-wrap: wrap;
			position: static;
		}
	}

	.card {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.card-header { display: flex; align-items: center; gap: 0.75rem; }
	.card-header h2 { font-size: 1.05rem; font-weight: 700; margin: 0; }

	.subheading { font-size: 0.85rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 0.5rem 0 0; }

	.status-ok { color: #2b9964; font-size: 0.8rem; font-weight: 600; }
	.status-error { color: #dc2626; font-size: 0.8rem; font-weight: 600; }
	.hint { font-size: 0.78rem; color: var(--color-text-muted); margin: 0; }
	.hint-warning { font-size: 0.78rem; color: #b45309; margin: 0; }

	.field-row { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end; }
	.field { display: flex; flex-direction: column; gap: 0.35rem; min-width: 160px; flex: 1; }

	.field-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.field-line { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end; }
	.field-line .field { max-width: 320px; }
	.field label { font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.03em; }

	input[type="text"], input[type="number"], input[type="email"], select {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.7rem;
		font-size: 0.875rem;
		background: var(--color-bg);
		color: var(--color-text);
	}
	input:focus, select:focus { outline: none; border-color: var(--color-green, #2b9964); }

	.btn-primary {
		background: #2b9964; color: #fff; border: none; border-radius: var(--radius-md);
		padding: 0.55rem 1.1rem; font-size: 0.85rem; font-weight: 600; cursor: pointer;
		white-space: nowrap;
	}
	.btn-primary:hover:not(:disabled) { background: var(--color-green-dark, #1f7a4f); }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

	.btn-secondary {
		background: transparent; color: var(--color-text); border: 1px solid var(--color-border);
		border-radius: var(--radius-md); padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 600; cursor: pointer;
	}
	.btn-secondary:hover { background: var(--color-bg-subtle); }

	.btn-danger {
		background: #dc2626; color: #fff; border: none; border-radius: var(--radius-md);
		padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 600; cursor: pointer;
	}
	.btn-danger:hover { background: #b91c1c; }

	.table-wrap { border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
	table { width: 100%; border-collapse: collapse; }
	thead th {
		background: var(--color-bg-subtle); padding: 0.6rem 0.85rem; text-align: left;
		font-size: 0.7rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase;
		letter-spacing: 0.04em; border-bottom: 1px solid var(--color-border);
	}
	tbody td { padding: 0.5rem 0.85rem; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
	tbody tr:last-child td { border-bottom: none; }
	.mono { font-family: monospace; font-size: 0.82rem; }
	.plan-name { font-weight: 600; }

	.cron-input { width: 140px; font-family: monospace; }
	.num-input { width: 70px; text-align: center; }

	.option-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.option-row { display: flex; gap: 0.5rem; align-items: center; }
	.option-row input { flex: 1; }
	.btn-remove {
		background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
		color: var(--color-text-muted); width: 28px; height: 28px; cursor: pointer;
	}
	.btn-remove:hover { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }

	.list-actions { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
	.add-scraper-row { display: flex; gap: 0.5rem; align-items: center; }
	.empty-hint { font-size: 0.82rem; color: var(--color-text-muted); margin: 0; }

	.tabs { display: flex; gap: 0.4rem; border-bottom: 1px solid var(--color-border); overflow-x: auto; }
	.tab {
		display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.8rem; font-size: 0.82rem;
		font-weight: 600; color: var(--color-text-muted); background: none; border: none;
		border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap;
	}
	.tab:hover { color: var(--color-text); }
	.tab-active { color: var(--color-text); border-bottom-color: #2b9964; }
	.tab-count {
		font-size: 0.68rem; font-weight: 700; padding: 1px 6px; border-radius: 999px;
		background: var(--color-bg-subtle); color: var(--color-text-muted);
	}

	/* ── Modal confirmation ── */
	.overlay {
		position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
		display: flex; align-items: center; justify-content: center; z-index: 100;
	}
	.modal {
		background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
		width: 420px; max-width: calc(100vw - 2rem); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
	}
	.modal-header { padding: 1.1rem 1.25rem 0.5rem; }
	.modal-header h2 { font-size: 1rem; font-weight: 700; margin: 0; }
	.modal-body { padding: 0.5rem 1.25rem 1rem; }
	.modal-body p { font-size: 0.875rem; color: var(--color-text); margin: 0; line-height: 1.5; }
	.modal-footer {
		padding: 0.75rem 1.25rem 1rem; display: flex; justify-content: flex-end; gap: 0.5rem;
		border-top: 1px solid var(--color-border);
	}
</style>
