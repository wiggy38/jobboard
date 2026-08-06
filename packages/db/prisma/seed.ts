import { PrismaClient, SourceType, UserPlan, UserStatus } from '@prisma/client';
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
  // Sources de test
  const lefaso = await prisma.source.upsert({
    where: { url: 'https://lefaso.net/emploi' },
    update: {},
    create: {
      name: 'Lefaso.net',
      url: 'https://lefaso.net/emploi',
      type: SourceType.MEDIA_LOCAL,
      trustScore: 0.75,
    },
  });

  const anpe = await prisma.source.upsert({
    where: { url: 'https://www.anpe.bf' },
    update: {},
    create: {
      name: 'ANPE Burkina Faso',
      url: 'https://www.anpe.bf',
      type: SourceType.INSTITUTIONNEL,
      trustScore: 0.9,
    },
  });

  await prisma.source.upsert({
    where: { url: 'https://reliefweb.int/jobs' },
    update: {},
    create: {
      name: 'ReliefWeb',
      url: 'https://reliefweb.int/jobs',
      type: SourceType.ONG,
      trustScore: 0.85,
    },
  });

  console.log(`✓ 3 sources créées : Lefaso.net (${lefaso.id}), ANPE (${anpe.id}), ReliefWeb`);

  // Utilisateur Freemium
  const freemiumUser = await prisma.user.upsert({
    where: { phone: '+22670000001' },
    update: {},
    create: {
      phone: '+22670000001',
      displayName: 'Kofi Ouédraogo',
      plan: UserPlan.FREEMIUM,
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          cities: ['Ouagadougou'],
          sectors: ['Informatique', 'Télécom'],
          levels: ['Licence', 'BAC+3'],
          contractTypes: ['CDI', 'CDD'],
          keywords: [],
          notificationTime: '08:00',
          language: 'fr',
        },
      },
    },
  });

  // Utilisateur Pro
  const proUser = await prisma.user.upsert({
    where: { phone: '+22676000002' },
    update: {},
    create: {
      phone: '+22676000002',
      displayName: 'Aminata Sawadogo',
      plan: UserPlan.PRO,
      status: UserStatus.ACTIVE,
      planStartAt: new Date('2026-06-01'),
      planEndAt: new Date('2026-07-01'),
      profile: {
        create: {
          cities: ['Ouagadougou', 'Bobo-Dioulasso'],
          sectors: ['Finance', 'Comptabilité', 'Audit'],
          levels: ['Master', 'BAC+5'],
          contractTypes: ['CDI', 'CDD', 'FREELANCE'],
          keywords: ['DAF', 'contrôleur de gestion', 'SYSCOHADA'],
          notificationTime: '07:30',
          language: 'fr',
        },
      },
    },
  });

  console.log(`✓ 2 utilisateurs créés : Freemium (${freemiumUser.id}), Pro (${proUser.id})`);

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
