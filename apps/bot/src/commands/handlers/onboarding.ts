import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText, sendInteractiveButtons, sendInteractiveList } from '../../services/whatsapp';
import { getState, setState, clearState, SessionState } from '../../session/state';
import { openWindow } from '../../session/window';
import { resetOffset } from '../../session/pagination';
import { handleAide } from './aide';
import { handleStop } from './stop';
import { handlePremium } from './premium';
import { getCountryFromPhone, NATIONAL_CHANNELS } from '../../lib/country';

// Prisma ContractType enum values
type ContractType = 'CDI' | 'CDD' | 'STAGE' | 'ALTERNANCE' | 'FREELANCE' | 'BENEVOLE' | 'AUTRE';

// Button IDs are uppercased by the parser before reaching here
const CONTRACT_MAP: Record<string, ContractType[]> = {
  CONTRACT_CDI: ['CDI'],
  CONTRACT_CDD: ['CDD', 'STAGE'],
  CONTRACT_ALL: ['CDI', 'CDD', 'STAGE', 'FREELANCE'],
};

const CONTRACT_ROWS = [
  { id: 'contract_cdi', title: 'CDI' },
  { id: 'contract_cdd', title: 'CDD / Stage' },
  { id: 'contract_all', title: 'Tous types' },
];

// ── Options des listes WhatsApp — villes & secteurs ────────────────────────────
// Row title WhatsApp = 24 caractères max, id volontairement en minuscules
// (le parser les remonte en majuscules, comme pour les boutons CONTRACT_*).

type Option = { id: string; label: string };

const CITY_OPTIONS: Option[] = [
  { id: 'city_ouagadougou', label: 'Ouagadougou' },
  { id: 'city_bobo_dioulasso', label: 'Bobo-Dioulasso' },
  { id: 'city_koudougou', label: 'Koudougou' },
  { id: 'city_ouahigouya', label: 'Ouahigouya' },
  { id: 'city_banfora', label: 'Banfora' },
  { id: 'city_kaya', label: 'Kaya' },
  { id: 'city_tenkodogo', label: 'Tenkodogo' },
  { id: 'city_fada_ngourma', label: "Fada N'Gourma" },
  { id: 'city_dedougou', label: 'Dédougou' },
];
const CITY_DONE = 'CITY_DONE';

const SECTOR_OPTIONS: Option[] = [
  { id: 'sector_informatique', label: 'Informatique' },
  { id: 'sector_finance', label: 'Finance' },
  { id: 'sector_comptabilite', label: 'Comptabilité' },
  { id: 'sector_sante', label: 'Santé' },
  { id: 'sector_agriculture', label: 'Agriculture' },
  { id: 'sector_education', label: 'Éducation' },
  { id: 'sector_ong_humanitaire', label: 'ONG/Humanitaire' },
  { id: 'sector_btp_construction', label: 'BTP/Construction' },
  { id: 'sector_transport_logistique', label: 'Transport/Logistique' },
  { id: 'sector_droit_juridique', label: 'Droit/Juridique' },
  { id: 'sector_communication_marketing', label: 'Communication/Marketing' },
  { id: 'sector_ressources_humaines', label: 'Ressources Humaines' },
  { id: 'sector_commerce_vente', label: 'Commerce/Vente' },
];
const SECTOR_PAGE_SIZE = 8; // page 1 = 8 secteurs + "suivant" + "terminé" = 10 lignes (max WhatsApp)
const SECTOR_NEXT_PAGE = 'SECTOR_NEXT_PAGE';
const SECTOR_PREV_PAGE = 'SECTOR_PREV_PAGE';
const SECTOR_DONE = 'SECTOR_DONE';

function findOption(options: Option[], id: string): Option | undefined {
  return options.find((o) => o.id.toUpperCase() === id);
}

function optionRows(options: Option[], selected: string[]): Array<{ id: string; title: string; description?: string }> {
  return options.map((o) => ({
    id: o.id,
    title: o.label,
    description: selected.includes(o.label) ? '✅ Sélectionné' : undefined,
  }));
}

async function sendCityList(userId: string, selectedCities: string[]): Promise<void> {
  const header =
    selectedCities.length > 0 ? `Villes sélectionnées : *${selectedCities.join(', ')}*\n\n` : '';

  const rows = optionRows(CITY_OPTIONS, selectedCities);
  rows.push({
    id: 'city_done',
    title: '✅ Terminé',
    description:
      selectedCities.length > 0 ? `${selectedCities.length} ville(s) choisie(s)` : 'Choisissez au moins 1 ville',
  });

  await sendInteractiveList(
    userId,
    `${header}Choisissez une ou plusieurs *villes* de recherche, puis validez avec *Terminé*.`,
    'Choisir une ville',
    [{ title: 'Villes', rows }],
  );
}

async function sendSectorList(userId: string, selectedSectors: string[], page: 1 | 2): Promise<void> {
  const pageOptions =
    page === 1 ? SECTOR_OPTIONS.slice(0, SECTOR_PAGE_SIZE) : SECTOR_OPTIONS.slice(SECTOR_PAGE_SIZE);

  const header =
    selectedSectors.length > 0 ? `Secteurs sélectionnés : *${selectedSectors.join(', ')}*\n\n` : '';

  const rows = optionRows(pageOptions, selectedSectors);
  if (page === 1) {
    rows.push({ id: 'sector_next_page', title: '➡️ Page suivante', description: 'Voir plus de secteurs' });
  } else {
    rows.push({ id: 'sector_prev_page', title: '⬅️ Page précédente', description: 'Revenir en arrière' });
  }
  rows.push({
    id: 'sector_done',
    title: '✅ Terminé',
    description:
      selectedSectors.length > 0
        ? `${selectedSectors.length} secteur(s) choisi(s)`
        : 'Choisissez au moins 1 secteur',
  });

  await sendInteractiveList(
    userId,
    `${header}Choisissez un ou plusieurs *secteurs d'activité* (page ${page}/2), puis validez avec *Terminé*.`,
    'Choisir un secteur',
    [{ title: `Secteurs — page ${page}/2`, rows }],
  );
}

// ── Step 0 — initial trigger for a new user ──────────────────────────────────

export async function startOnboarding(cmd: ParsedCommand): Promise<void> {
  await sendText(
    cmd.userId,
    '👋 Bienvenue sur *Tumaa* !\n' +
      'Je vous envoie les meilleures offres d\'emploi directement sur WhatsApp.\n\n' +
      'Pour commencer, choisissez vos *villes* de recherche.',
  );
  await setState(cmd.userId, { step: 'ONBOARDING_CITY', data: { cities: [] } });
  await sendCityList(cmd.userId, []);
}

// ── Main dispatcher — called when session has an ONBOARDING_* step ────────────

export async function handleOnboarding(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const state = await getState(cmd.userId);
  if (!state) return;

  const command = cmd.command.trim().toUpperCase();

  // Interruptions handled at every onboarding step
  if (command === 'STOP') {
    await handleStop(cmd, db);
    return;
  }

  if (command === 'AIDE') {
    await handleAide(cmd, db);
    await askCurrentQuestion(cmd.userId, state);
    return;
  }

  if (command === 'PREMIUM') {
    // Preserve onboarding resume data inside the premium state so the payment
    // flow can return the user to the right step after subscription.
    const resumeData = { ...state.data, _resumeStep: state.step };
    await handlePremium(cmd, db);
    // Overwrite the state set by handlePremium to embed the onboarding context
    await setState(cmd.userId, { step: 'PREMIUM_CHOICE', data: resumeData });
    return;
  }

  switch (state.step) {
    case 'ONBOARDING_CITY':
      await handleCityStep(cmd, state.data);
      break;
    case 'ONBOARDING_SECTOR':
      await handleSectorStep(cmd, state.data);
      break;
    case 'ONBOARDING_CONTRACT':
      await handleContractStep(cmd, state.data, db);
      break;
  }
}

// ── Step 1 — cities (choix multiple) ───────────────────────────────────────────

async function handleCityStep(cmd: ParsedCommand, prevData: Record<string, unknown>): Promise<void> {
  const cities = (prevData.cities as string[]) ?? [];
  const id = cmd.command.trim().toUpperCase();

  if (id === CITY_DONE) {
    if (cities.length === 0) {
      await sendText(cmd.userId, '⚠️ Sélectionnez au moins une ville avant de continuer.');
      await sendCityList(cmd.userId, cities);
      return;
    }

    await setState(cmd.userId, { step: 'ONBOARDING_SECTOR', data: { cities, sectors: [], sectorPage: 1 } });
    await sendSectorList(cmd.userId, [], 1);
    return;
  }

  const option = findOption(CITY_OPTIONS, id);
  if (!option) {
    await sendText(cmd.userId, 'Merci de choisir une ville dans la liste ci-dessous.');
    await sendCityList(cmd.userId, cities);
    return;
  }

  const updated = cities.includes(option.label)
    ? cities.filter((c) => c !== option.label)
    : [...cities, option.label];

  await setState(cmd.userId, { step: 'ONBOARDING_CITY', data: { cities: updated } });
  await sendCityList(cmd.userId, updated);
}

// ── Step 2 — sectors (choix multiple, paginé) ──────────────────────────────────

async function handleSectorStep(cmd: ParsedCommand, prevData: Record<string, unknown>): Promise<void> {
  const cities = prevData.cities as string[];
  const sectors = (prevData.sectors as string[]) ?? [];
  const page = ((prevData.sectorPage as 1 | 2) ?? 1) as 1 | 2;
  const id = cmd.command.trim().toUpperCase();

  if (id === SECTOR_NEXT_PAGE) {
    await setState(cmd.userId, { step: 'ONBOARDING_SECTOR', data: { cities, sectors, sectorPage: 2 } });
    await sendSectorList(cmd.userId, sectors, 2);
    return;
  }

  if (id === SECTOR_PREV_PAGE) {
    await setState(cmd.userId, { step: 'ONBOARDING_SECTOR', data: { cities, sectors, sectorPage: 1 } });
    await sendSectorList(cmd.userId, sectors, 1);
    return;
  }

  if (id === SECTOR_DONE) {
    if (sectors.length === 0) {
      await sendText(cmd.userId, '⚠️ Sélectionnez au moins un secteur avant de continuer.');
      await sendSectorList(cmd.userId, sectors, page);
      return;
    }

    await sendInteractiveButtons(
      cmd.userId,
      `✅ Secteurs : *${sectors.join(', ')}*\n\nQuel type de contrat recherchez-vous ?`,
      CONTRACT_ROWS,
    );
    await setState(cmd.userId, { step: 'ONBOARDING_CONTRACT', data: { cities, sectors } });
    return;
  }

  const option = findOption(SECTOR_OPTIONS, id);
  if (!option) {
    await sendText(cmd.userId, 'Merci de choisir un secteur dans la liste ci-dessous.');
    await sendSectorList(cmd.userId, sectors, page);
    return;
  }

  const updated = sectors.includes(option.label)
    ? sectors.filter((s) => s !== option.label)
    : [...sectors, option.label];

  await setState(cmd.userId, { step: 'ONBOARDING_SECTOR', data: { cities, sectors: updated, sectorPage: page } });
  await sendSectorList(cmd.userId, updated, page);
}

// ── Step 3 — contract type + DB creation ──────────────────────────────────────

async function handleContractStep(
  cmd: ParsedCommand,
  prevData: Record<string, unknown>,
  db: PrismaClient,
): Promise<void> {
  const contractTypes = CONTRACT_MAP[cmd.command];

  if (!contractTypes) {
    // User typed free text instead of pressing a button — re-ask
    await sendInteractiveButtons(
      cmd.userId,
      'Merci de choisir l\'un des types de contrat ci-dessous :',
      CONTRACT_ROWS,
    );
    return;
  }

  const { cities, sectors } = prevData as { cities: string[]; sectors: string[] };
  const contractLabel = contractTypes.join(', ');
  const country = getCountryFromPhone(cmd.userId);
  const channel = NATIONAL_CHANNELS[country] ?? NATIONAL_CHANNELS.BF;

  await sendText(
    cmd.userId,
    `✅ Parfait ! Voici votre profil Tumaa :\n` +
      `📍 Villes : *${cities.join(', ')}*\n` +
      `💼 Secteurs : *${sectors.join(', ')}*\n` +
      `📋 Contrats : *${contractLabel}*\n\n` +
      '*Tumaa est gratuit.* Chaque matin, tapez *OFFRES*\n' +
      'pour recevoir vos opportunités du jour.\n\n' +
      '👉 Tapez *OFFRES* maintenant pour voir les premières offres !',
  );

  await db.user.upsert({
    where: { phone: cmd.userId },
    create: {
      phone: cmd.userId,
      plan: 'FREEMIUM',
      status: 'ACTIVE',
      countries: [country],
      profile: {
        create: {
          cities,
          sectors,
          levels: [],
          contractTypes,
          keywords: [],
        },
      },
    },
    update: {},
  });

  await clearState(cmd.userId);
  await openWindow(cmd.userId);
  await resetOffset(cmd.userId);

  await sendInteractiveButtons(
    cmd.userId,
    `📢 Rejoins ${channel} pour un teaser des offres chaque matin à 08:00.`,
    [{ id: 'join_channel', title: '📢 Rejoindre' }],
  );

  // Laisse le temps de rejoindre le canal avant de proposer Premium/Elite (CTA après 10s)
  setTimeout(() => {
    handlePremium(cmd, db).catch((err) => console.error('[Onboarding] Échec CTA Premium/Elite:', err));
  }, 10_000).unref();
}

// ── Helper: re-ask the current onboarding question after an interruption ──────

async function askCurrentQuestion(userId: string, state: SessionState): Promise<void> {
  const { step, data } = state;

  if (step === 'ONBOARDING_CITY') {
    const cities = (data.cities as string[]) ?? [];
    await sendCityList(userId, cities);
    return;
  }

  if (step === 'ONBOARDING_SECTOR') {
    const sectors = (data.sectors as string[]) ?? [];
    const page = ((data.sectorPage as 1 | 2) ?? 1) as 1 | 2;
    await sendSectorList(userId, sectors, page);
    return;
  }

  if (step === 'ONBOARDING_CONTRACT') {
    const { sectors } = data as { sectors: string[] };
    await sendInteractiveButtons(
      userId,
      `✅ Secteurs : *${sectors.join(', ')}*\n\nQuel type de contrat recherchez-vous ?`,
      CONTRACT_ROWS,
    );
  }
}
