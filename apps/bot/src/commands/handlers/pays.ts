import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText, sendInteractiveList } from '../../services/whatsapp';
import { getState, setState, clearState } from '../../session/state';
import { joinNationalChannel } from '../../services/channels';
import { COUNTRY_NAMES, ELITE_MAX_COUNTRIES } from '../../lib/country';

const COUNTRY_DONE = 'PAYS_DONE';

function countryRowId(code: string): string {
  return `pays_${code.toLowerCase()}`;
}

function findCountryByRowId(id: string): string | undefined {
  return Object.keys(COUNTRY_NAMES).find((code) => countryRowId(code).toUpperCase() === id);
}

async function sendCountryList(userId: string, selected: string[]): Promise<void> {
  const header =
    selected.length > 0
      ? `Pays sélectionnés : *${selected.map((c) => COUNTRY_NAMES[c]).join(', ')}*\n\n`
      : '';

  const rows = Object.entries(COUNTRY_NAMES).map(([code, name]) => ({
    id: countryRowId(code),
    title: name,
    description: selected.includes(code) ? '✅ Sélectionné' : undefined,
  }));
  rows.push({
    id: COUNTRY_DONE.toLowerCase(),
    title: '✅ Terminé',
    description:
      selected.length > 0
        ? `${selected.length}/${ELITE_MAX_COUNTRIES} pays choisi(s)`
        : 'Choisissez au moins 1 pays',
  });

  await sendInteractiveList(
    userId,
    `${header}Choisissez jusqu'à ${ELITE_MAX_COUNTRIES} pays de recherche, puis validez avec *Terminé*.`,
    'Choisir un pays',
    [{ title: 'Pays', rows }],
  );
}

// ── Entrée — commande PAYS, réservée aux membres ELITE ─────────────────────────

export async function handlePays(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({ where: { phone: cmd.userId } });
  if (!user) return;

  if (user.plan !== 'ELITE') {
    await sendText(
      cmd.userId,
      '👑 La sélection de plusieurs pays est réservée aux membres *ELITE*.\n' +
        'Tapez *PREMIUM* pour découvrir les offres ELITE.',
    );
    return;
  }

  const preselected = user.countries.filter((c) => c in COUNTRY_NAMES);
  await setState(cmd.userId, { step: 'ELITE_COUNTRY_SELECT', data: { selected: preselected } });
  await sendCountryList(cmd.userId, preselected);
}

// ── Suite — dispatché quand l'état de session est ELITE_COUNTRY_SELECT ─────────

export async function handlePaysSelection(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const state = await getState(cmd.userId);
  if (!state) return;

  const selected = (state.data.selected as string[]) ?? [];
  const id = cmd.command.trim().toUpperCase();

  if (id === COUNTRY_DONE) {
    if (selected.length === 0) {
      await sendText(cmd.userId, '⚠️ Sélectionnez au moins un pays avant de continuer.');
      await sendCountryList(cmd.userId, selected);
      return;
    }

    const user = await db.user.findUnique({ where: { phone: cmd.userId } });
    if (!user) return;

    await db.user.update({ where: { id: user.id }, data: { countries: selected } });

    // Retire les canaux des pays désélectionnés — sinon un ChannelJoin périmé
    // reste en base après un changement de sélection.
    await db.channelJoin.deleteMany({
      where: { userId: user.id, country: { notIn: selected } },
    });

    for (const country of selected) {
      await joinNationalChannel(db, user.id, user.phone, country);
    }

    await clearState(cmd.userId);

    await sendText(
      cmd.userId,
      `✅ Pays mis à jour : *${selected.map((c) => COUNTRY_NAMES[c]).join(', ')}*\n` +
        `Clique sur le(s) lien(s) ci-dessus pour rejoindre chaque canal et recevoir un teaser des offres chaque matin à 08:00.`,
    );
    return;
  }

  const code = findCountryByRowId(id);
  if (!code) {
    await sendText(cmd.userId, 'Merci de choisir un pays dans la liste ci-dessous.');
    await sendCountryList(cmd.userId, selected);
    return;
  }

  if (!selected.includes(code) && selected.length >= ELITE_MAX_COUNTRIES) {
    await sendText(cmd.userId, `⚠️ Maximum ${ELITE_MAX_COUNTRIES} pays. Décochez-en un avant d'en ajouter un autre.`);
    await sendCountryList(cmd.userId, selected);
    return;
  }

  const updated = selected.includes(code)
    ? selected.filter((c) => c !== code)
    : [...selected, code];

  await setState(cmd.userId, { step: 'ELITE_COUNTRY_SELECT', data: { selected: updated } });
  await sendCountryList(cmd.userId, updated);
}
