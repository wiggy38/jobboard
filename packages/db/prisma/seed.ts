import { PrismaClient } from '@prisma/client';
import { DEFAULT_SETTINGS, SETTING_KEYS, type SettingKey } from '@tumaa/shared';

const prisma = new PrismaClient();

// Amorce la table Setting avec les valeurs par défaut de packages/shared —
// pour les 5 clés historiquement issues de .env, on reprend la valeur env
// courante si elle existe (migration transparente au premier déploiement),
// sinon le défaut de DEFAULT_SETTINGS. N'écrase jamais une ligne déjà
// présente (un admin a pu la modifier depuis le backoffice).
async function seedSettings() {
  const envOverrides: Partial<Record<SettingKey, unknown>> = {
    [SETTING_KEYS.SCRAPER_REPORT_EMAIL_TO]: process.env.REPORT_EMAIL_TO,
    [SETTING_KEYS.SCRAPER_CAREERJET_AFFID]: process.env.CAREERJET_AFFID,
    [SETTING_KEYS.SCOUTS_CAPTURE_RATE]: process.env.SCOUT_CAPTURE_RATE
      ? Number(process.env.SCOUT_CAPTURE_RATE)
      : undefined,
    [SETTING_KEYS.CHANNEL_INVITE_LINKS]: (() => {
      const links: Record<string, string> = {};
      for (const country of ['BF', 'BJ', 'TG', 'CI']) {
        const link = process.env[`CHANNEL_INVITE_LINK_${country}`];
        if (link) links[country] = link;
      }
      return Object.keys(links).length > 0 ? links : undefined;
    })(),
  };

  let created = 0;
  for (const key of Object.values(SETTING_KEYS)) {
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (existing) continue;
    const value = envOverrides[key as SettingKey] ?? DEFAULT_SETTINGS[key as SettingKey];
    await prisma.setting.create({ data: { key, value: value as any } });
    created++;
  }
  console.log(`✓ Settings amorcés : ${created} clé(s) créée(s) (${Object.keys(SETTING_KEYS).length - created} déjà présentes)`);
}

async function main() {
  await seedSettings();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
