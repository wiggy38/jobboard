import { PrismaClient, SourceType, UserPlan, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
