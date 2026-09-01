import { PrismaClient } from '@prisma/client';
import { ParsedCommand } from '../../whatsapp/types';
import { sendText } from '../../services/whatsapp';
import { isUnlimited, deriveContractGroups, CONTRACT_GROUPS, ContractType } from '@tumaa/shared';
import { COUNTRY_NAMES } from '../../lib/country';
import { handleModifier } from './modifier';

function formatList(values: string[], max: number): string {
  const joined = values.length > 0 ? values.join(', ') : 'Non configuré';
  const limit = isUnlimited(max) ? 'illimité' : `${values.length}/${max}`;
  return `${joined} (${limit})`;
}

export async function handleProfil(cmd: ParsedCommand, db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({ where: { phone: cmd.userId }, include: { profile: true } });
  if (!user || !user.profile) return;

  const profile = user.profile;

  const planLine =
    user.plan !== 'FREEMIUM' && user.planEndAt
      ? `${user.plan} (jusqu'au ${user.planEndAt.toLocaleDateString('fr-FR')})`
      : user.plan;

  const contractGroups = deriveContractGroups(profile.contractTypes as ContractType[]);
  const contractStr =
    contractGroups.length > 0
      ? contractGroups.map((id) => CONTRACT_GROUPS[id].label).join(', ')
      : 'Non configuré';

  const paysStr = user.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(', ') || 'Non configuré';

  await sendText(
    cmd.userId,
    `👤 *Ton profil Tumaa*\n\n` +
      `💳 Plan : *${planLine}*\n\n` +
      `📍 Villes : ${formatList(profile.cities, profile.maxCities)}\n\n` +
      `🏢 Secteurs : ${formatList(profile.sectors, profile.maxSectors)}\n\n` +
      `🎓 Niveau(x) : ${formatList(profile.levels, profile.maxLevels)}\n\n` +
      `📄 Type de contrat : ${contractStr}\n\n` +
      `🌍 Pays : ${paysStr}`,
    cmd.country,
  );

  await handleModifier(cmd, db);
}
