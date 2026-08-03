import { PrismaClient } from '@prisma/client'
import sources from '../sources/index'

const prisma = new PrismaClient()

// Garantit qu'une ligne Source existe pour chaque scraper du registre
// (apps/scraper/src/sources/index.ts), même s'il n'a jamais tourné —
// sans quoi il reste invisible dans le backoffice (GET /admin/scrapers
// ne lit que la table Source).
export async function syncSources(): Promise<void> {
  for (const scraper of sources.values()) {
    await prisma.source.upsert({
      where: { url: scraper.url },
      create: {
        name: scraper.name,
        url: scraper.url,
        type: scraper.sourceType as any,
        country: scraper.country,
        isActive: true,
      },
      update: {},
    })
  }
}
