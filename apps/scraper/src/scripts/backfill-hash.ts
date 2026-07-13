/**
 * backfill-hash.ts
 *
 * Recalcule le hash de dédup (title + organization + publishedAt) de toutes
 * les offres existantes avec la formule normalisée (voir lib/deduplicator.ts),
 * et archive les doublons révélés par ce recalcul (des offres qui avaient des
 * hash différents sous l'ancienne formule non-normalisée mais qui
 * correspondent au même hash normalisé).
 *
 * À exécuter une seule fois, juste après le déploiement du fix de
 * normalisation du hash, et AVANT le prochain run planifié du scraper —
 * sinon ce run recalculera les nouveaux hash pour des offres déjà en base
 * dont le hash stocké est encore l'ancien, et les réinsérera en doublon une
 * dernière fois avant que ce script ne passe.
 *
 * Usage :
 *   ts-node apps/scraper/src/scripts/backfill-hash.ts --dry-run
 *   ts-node apps/scraper/src/scripts/backfill-hash.ts
 */
import dotenv from 'dotenv'
import path from 'path'
// Cherche .env à la racine du monorepo (quatre niveaux au-dessus de src/scripts/)
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

import { PrismaClient, JobOfferStatus } from '@prisma/client'
import { createHash } from '../lib/deduplicator'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const prisma = new PrismaClient()

  try {
    const offers = await prisma.jobOffer.findMany({
      select: {
        id: true,
        title: true,
        organization: true,
        publishedAt: true,
        hash: true,
        status: true,
        createdAt: true,
        submission: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    console.log(`Loaded ${offers.length} offers.`)

    const groups = new Map<string, typeof offers>()
    for (const offer of offers) {
      const newHash = createHash({
        title: offer.title,
        organization: offer.organization,
        publishedAt: offer.publishedAt ?? undefined,
        city: '',
        sourceUrl: '',
      })
      const group = groups.get(newHash)
      if (group) group.push(offer)
      else groups.set(newHash, [offer])
    }

    let duplicateGroups = 0
    let archivedCount = 0
    let rehashedCount = 0

    for (const [newHash, group] of groups) {
      if (group.length > 1) {
        duplicateGroups++

        // Garde en priorité une ligne qui a une candidature (JobSubmission)
        // liée, sinon la plus ancienne (createdAt croissant — déjà trié).
        const withSubmission = group.find(o => o.submission)
        const survivor = withSubmission ?? group[0]
        const losers = group.filter(o => o.id !== survivor.id)

        console.log(
          `[dup] "${survivor.title}" @ "${survivor.organization}" — garde ${survivor.id}, archive ${losers.map(l => l.id).join(', ')}`
        )

        if (!DRY_RUN) {
          for (const loser of losers) {
            if (loser.submission) {
              // Ne devrait pas arriver (on priorise déjà les lignes avec
              // submission comme survivor), mais on ne prend aucun risque :
              // on n'archive jamais une ligne qui a une candidature liée.
              console.warn(`  [skip] ${loser.id} a une candidature liée, non archivée`)
              continue
            }
            await prisma.jobOffer.update({
              where: { id: loser.id },
              data: { status: JobOfferStatus.ARCHIVED },
            })
            archivedCount++
          }

          if (survivor.hash !== newHash) {
            await prisma.jobOffer.update({
              where: { id: survivor.id },
              data: { hash: newHash },
            })
            rehashedCount++
          }
        }
        continue
      }

      // Groupe d'une seule ligne — juste rehash si nécessaire.
      const [offer] = group
      if (offer.hash !== newHash) {
        if (!DRY_RUN) {
          await prisma.jobOffer.update({
            where: { id: offer.id },
            data: { hash: newHash },
          })
        }
        rehashedCount++
      }
    }

    console.log(
      `${DRY_RUN ? '[dry-run] ' : ''}${duplicateGroups} groupes de doublons détectés, ` +
        `${archivedCount} lignes ${DRY_RUN ? 'à archiver' : 'archivées'}, ` +
        `${rehashedCount} hash ${DRY_RUN ? 'à mettre à jour' : 'mis à jour'}.`
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
