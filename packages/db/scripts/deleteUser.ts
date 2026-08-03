// Suppression ponctuelle d'un compte abonné pour lui faire refaire l'onboarding.
// Exécution manuelle unique : pnpm --filter @tumaa/db exec ts-node scripts/deleteUser.ts <phone>
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const phone = process.argv[2];
  if (!phone) {
    console.error('Usage: ts-node scripts/deleteUser.ts <phone>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.log(`Aucun utilisateur trouvé pour ${phone}`);
    return;
  }

  // Détache les filleuls éventuels avant suppression (contrainte FK referredById).
  await prisma.user.updateMany({
    where: { referredById: user.id },
    data: { referredById: null },
  });

  await prisma.user.delete({ where: { id: user.id } });

  console.log(`✓ Utilisateur ${phone} (id=${user.id}) supprimé — onboarding à refaire`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
