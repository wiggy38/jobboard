<script lang="ts">
	import { employerApi } from '$lib/api.js';
	import { goto } from '$app/navigation';
	import type { ContractType } from '$lib/types.js';

	// Données du formulaire
	let title = $state('');
	let city = $state('');
	let contractType = $state<ContractType>('CDI');
	let sector = $state('');
	let educationLevel = $state('');
	let deadline = $state('');
	let contactEmail = $state('');
	let description = $state('');
	let contactPhone = $state('');
	let applicationUrl = $state('');
	let requirements = $state('');

	// État UI
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});
	let estimatedProfiles = $state<number | null>(null);
	let estimateLoading = $state(false);
	let estimateTimer: ReturnType<typeof setTimeout> | null = null;

	const CITIES = ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou', 'Autre'];
	const CONTRACT_TYPES: ContractType[] = ['CDI', 'CDD', 'STAGE', 'ALTERNANCE', 'FREELANCE'];
	const SECTORS = [
		'Informatique / Numérique',
		'Finance / Comptabilité',
		'Agriculture / Élevage',
		'Santé / Médical',
		'Éducation / Formation',
		'BTP / Génie Civil',
		'Commerce / Vente',
		'Humanitaire / ONG',
		'Administration / Secrétariat',
		'Communication / Marketing',
		'Droit / Juridique',
		'Logistique / Transport',
		'Environnement',
		'Autre',
	];
	const EDUCATION_LEVELS = [
		'Sans diplôme requis',
		'BEPC / Brevet',
		'BAC',
		'BAC+2 / BTS / DUT',
		'BAC+3 / Licence',
		'BAC+4 / Master 1',
		'BAC+5 / Master 2',
		'Doctorat',
	];

	const today = new Date().toISOString().split('T')[0];

	// Déclenche l'estimation en temps réel quand ville/secteur/niveau changent
	$effect(() => {
		if (!city || !sector || !educationLevel) {
			estimatedProfiles = null;
			return;
		}
		if (estimateTimer) clearTimeout(estimateTimer);
		estimateTimer = setTimeout(async () => {
			estimateLoading = true;
			try {
				const res = await employerApi.getEstimate(city, sector, educationLevel);
				estimatedProfiles = res.count;
			} catch {
				estimatedProfiles = null;
			} finally {
				estimateLoading = false;
			}
		}, 400);
	});

	function validate(): boolean {
		const errors: Record<string, string> = {};
		if (!title.trim()) errors.title = 'Le titre est requis.';
		if (!city) errors.city = 'La ville est requise.';
		if (!contractType) errors.contractType = 'Le type de contrat est requis.';
		if (!sector) errors.sector = 'Le secteur est requis.';
		if (!educationLevel) errors.educationLevel = 'Le niveau d'études est requis.';
		if (!deadline) {
			errors.deadline = 'La date de clôture est requise.';
		} else if (deadline <= today) {
			errors.deadline = 'La date de clôture doit être dans le futur.';
		}
		if (!contactEmail.trim()) {
			errors.contactEmail = 'L'email de contact est requis.';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
			errors.contactEmail = 'Email invalide.';
		}
		if (!description.trim()) errors.description = 'La description est requise.';
		fieldErrors = errors;
		return Object.keys(errors).length === 0;
	}

	async function handleSubmit(isSponsored: boolean) {
		if (!validate()) return;
		submitting = true;
		submitError = null;
		try {
			await employerApi.publishOffer({
				title: title.trim(),
				city,
				contractType,
				sector,
				level: educationLevel,
				deadline,
				contactEmail: contactEmail.trim(),
				description: description.trim(),
				contactPhone: contactPhone.trim() || undefined,
				applicationUrl: applicationUrl.trim() || undefined,
				requirements: requirements.trim() || undefined,
				isSponsored,
			});
			await goto('/employer/offres');
		} catch (e) {
			submitError = e instanceof Error ? e.message : 'Erreur lors de la publication.';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="page">
	<div class="page-header">
		<h1>Publier une offre</h1>
		<a href="/employer" class="btn-cancel">Annuler</a>
	</div>

	{#if submitError}
		<div class="alert-error">{submitError}</div>
	{/if}

	<div class="form-layout">
		<form class="form" onsubmit={(e) => { e.preventDefault(); }}>

			<!-- Titre -->
			<div class="field" class:has-error={fieldErrors.title}>
				<label for="title">Titre du poste <span class="req">*</span></label>
				<input id="title" type="text" bind:value={title} placeholder="Ex : Développeur Full Stack Junior" />
				{#if fieldErrors.title}<span class="field-error">{fieldErrors.title}</span>{/if}
			</div>

			<div class="form-row">
				<!-- Ville -->
				<div class="field" class:has-error={fieldErrors.city}>
					<label for="city">Ville <span class="req">*</span></label>
					<select id="city" bind:value={city}>
						<option value="">— Choisir —</option>
						{#each CITIES as c}
							<option value={c}>{c}</option>
						{/each}
					</select>
					{#if fieldErrors.city}<span class="field-error">{fieldErrors.city}</span>{/if}
				</div>

				<!-- Type de contrat -->
				<div class="field" class:has-error={fieldErrors.contractType}>
					<label for="contractType">Type de contrat <span class="req">*</span></label>
					<select id="contractType" bind:value={contractType}>
						{#each CONTRACT_TYPES as ct}
							<option value={ct}>{ct}</option>
						{/each}
					</select>
					{#if fieldErrors.contractType}<span class="field-error">{fieldErrors.contractType}</span>{/if}
				</div>
			</div>

			<div class="form-row">
				<!-- Secteur -->
				<div class="field" class:has-error={fieldErrors.sector}>
					<label for="sector">Secteur <span class="req">*</span></label>
					<select id="sector" bind:value={sector}>
						<option value="">— Choisir —</option>
						{#each SECTORS as s}
							<option value={s}>{s}</option>
						{/each}
					</select>
					{#if fieldErrors.sector}<span class="field-error">{fieldErrors.sector}</span>{/if}
				</div>

				<!-- Niveau d'études -->
				<div class="field" class:has-error={fieldErrors.educationLevel}>
					<label for="educationLevel">Niveau requis <span class="req">*</span></label>
					<select id="educationLevel" bind:value={educationLevel}>
						<option value="">— Choisir —</option>
						{#each EDUCATION_LEVELS as lvl}
							<option value={lvl}>{lvl}</option>
						{/each}
					</select>
					{#if fieldErrors.educationLevel}<span class="field-error">{fieldErrors.educationLevel}</span>{/if}
				</div>
			</div>

			<div class="form-row">
				<!-- Date de clôture -->
				<div class="field" class:has-error={fieldErrors.deadline}>
					<label for="deadline">Date de clôture <span class="req">*</span></label>
					<input id="deadline" type="date" bind:value={deadline} min={today} />
					{#if fieldErrors.deadline}<span class="field-error">{fieldErrors.deadline}</span>{/if}
				</div>

				<!-- Email de contact -->
				<div class="field" class:has-error={fieldErrors.contactEmail}>
					<label for="contactEmail">Email de contact <span class="req">*</span></label>
					<input id="contactEmail" type="email" bind:value={contactEmail} placeholder="recrutement@entreprise.bf" />
					{#if fieldErrors.contactEmail}<span class="field-error">{fieldErrors.contactEmail}</span>{/if}
				</div>
			</div>

			<!-- Description -->
			<div class="field" class:has-error={fieldErrors.description}>
				<label for="description">Description du poste <span class="req">*</span></label>
				<textarea id="description" rows="6" bind:value={description} placeholder="Missions, profil recherché, avantages offerts…"></textarea>
				{#if fieldErrors.description}<span class="field-error">{fieldErrors.description}</span>{/if}
			</div>

			<hr class="divider" />
			<p class="optional-label">Champs optionnels</p>

			<div class="form-row">
				<!-- Téléphone -->
				<div class="field">
					<label for="contactPhone">Téléphone de contact</label>
					<input id="contactPhone" type="tel" bind:value={contactPhone} placeholder="+226 70 00 00 00" />
				</div>

				<!-- Lien candidature -->
				<div class="field">
					<label for="applicationUrl">Lien de candidature</label>
					<input id="applicationUrl" type="url" bind:value={applicationUrl} placeholder="https://…" />
				</div>
			</div>

			<!-- Exigences -->
			<div class="field">
				<label for="requirements">Exigences spécifiques</label>
				<textarea id="requirements" rows="3" bind:value={requirements} placeholder="Langues, logiciels, expériences…"></textarea>
			</div>

			<!-- Estimation profils -->
			<div class="estimate-box" class:estimate-loaded={estimatedProfiles !== null}>
				{#if estimateLoading}
					<span class="estimate-text loading">Calcul en cours…</span>
				{:else if estimatedProfiles !== null}
					<span class="estimate-icon">👤</span>
					<span class="estimate-text">
						<strong>{estimatedProfiles.toLocaleString('fr-FR')} profil{estimatedProfiles !== 1 ? 's' : ''}</strong>
						correspondant{estimatedProfiles !== 1 ? 's' : ''} à cette offre sur Tumaa
					</span>
				{:else}
					<span class="estimate-text muted">Renseignez la ville, le secteur et le niveau pour voir les profils estimés.</span>
				{/if}
			</div>

			<!-- Actions -->
			<div class="form-actions">
				<button
					type="button"
					class="btn-publish"
					disabled={submitting}
					onclick={() => handleSubmit(false)}
				>
					{submitting ? 'Publication…' : 'Publier · 5 000 FCFA'}
				</button>
				<button
					type="button"
					class="btn-sponsor"
					disabled={submitting}
					onclick={() => handleSubmit(true)}
				>
					Sponsoriser cette offre · +15 000 FCFA
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.page { max-width: 760px; }

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	h1 { font-size: 1.5rem; font-weight: 700; }

	.btn-cancel {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		padding: 0.4rem 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		transition: background 0.12s;
	}

	.btn-cancel:hover { background: var(--color-bg-subtle); text-decoration: none; }

	.alert-error {
		background: #fee2e2;
		color: #991b1b;
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}

	.form {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.75rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.field { display: flex; flex-direction: column; gap: 0.35rem; }
	.field.has-error input,
	.field.has-error select,
	.field.has-error textarea {
		border-color: #f87171;
	}

	label {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.req { color: #ef4444; }

	input, select, textarea {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 0.6rem 0.75rem;
		font-size: 0.9rem;
		font-family: inherit;
		color: var(--color-text);
		background: var(--color-bg);
		transition: border-color 0.15s;
	}

	input:focus, select:focus, textarea:focus {
		outline: none;
		border-color: var(--color-green);
	}

	textarea { resize: vertical; }

	.field-error {
		font-size: 0.75rem;
		color: #dc2626;
		margin-top: 0.1rem;
	}

	.optional-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0;
	}

	.divider {
		border: none;
		border-top: 1px solid var(--color-border);
		margin: 0.25rem 0;
	}

	/* ── Estimation ───────────────────────────────────── */
	.estimate-box {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
		font-size: 0.85rem;
		min-height: 48px;
		transition: border-color 0.2s, background 0.2s;
	}

	.estimate-box.estimate-loaded {
		background: var(--color-green-light);
		border-color: var(--color-green-mid);
	}

	.estimate-icon { font-size: 1.1rem; }

	.estimate-text { color: var(--color-text); }
	.estimate-text.muted { color: var(--color-text-muted); }
	.estimate-text.loading { color: var(--color-text-muted); font-style: italic; }

	/* ── Actions ──────────────────────────────────────── */
	.form-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding-top: 0.5rem;
	}

	.btn-publish {
		background: var(--color-green);
		color: #fff;
		border: none;
		padding: 0.7rem 1.5rem;
		border-radius: var(--radius-md);
		font-weight: 700;
		font-size: 0.9rem;
		transition: background 0.15s;
		flex: 1;
		min-width: 180px;
	}

	.btn-publish:hover:not(:disabled) { background: var(--color-green-dark); }
	.btn-publish:disabled { opacity: 0.6; cursor: not-allowed; }

	.btn-sponsor {
		background: #fff8eb;
		color: #92400e;
		border: 2px solid #ffbd59;
		padding: 0.7rem 1.5rem;
		border-radius: var(--radius-md);
		font-weight: 700;
		font-size: 0.9rem;
		transition: background 0.15s;
		flex: 1;
		min-width: 220px;
	}

	.btn-sponsor:hover:not(:disabled) { background: #ffbd59; color: #1a1a1a; }
	.btn-sponsor:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
