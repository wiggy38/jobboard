import { PrismaClient, JobOfferStatus, ContractType as PrismaContractType } from '@prisma/client'
import { RawJobOffer } from '@tumaa/shared'
import { normalizeWithAI } from './lib/normalizer'
import { createHash } from './lib/deduplicator'
import { info, warn, error as logError, success } from './lib/logger'
import { sendMail } from './lib/mailer'
import sources from './sources'

const SOURCE = 'pipeline'

// Nombre de runs consécutifs sans la moindre offre récupérée en Phase 1
// (navigation/listing vide) avant de couper la source. Ce signal est distinct
// de crawlErrors (monitor.ts, qui détecte un run manqué) : ici le scraper a
// bien tourné mais n'a rien trouvé, symptôme typique d'un site qui a changé
// de structure ou déployé une protection anti-bot.
const CIRCUIT_BREAKER_THRESHOLD = 2
const ALERT_EMAIL_TO = process.env.REPORT_EMAIL_TO ?? 'm.miguellao@gmail.com'

export interface PipelineResult {
  scraperName: string
  totalScraped: number
  totalInserted: number
  totalDuplicates: number
  totalErrors: number
  duration: number
  skipped?: boolean
}

function computeScoreConfidence(offer: RawJobOffer): number {
  if (offer.title && offer.organization && offer.city && offer.contactEmail) return 1.0
  if (offer.title && offer.organization && offer.city) return 0.8
  if (offer.title && offer.organization) return 0.6
  return 0.4
}

function toPrismaContractType(ct: string): PrismaContractType {
  const map: Record<string, PrismaContractType> = {
    CDI: 'CDI',
    CDD: 'CDD',
    STAGE: 'STAGE',
    ALTERNANCE: 'ALTERNANCE',
    FREELANCE: 'FREELANCE',
    BENEVOLE: 'BENEVOLE',
  }
  return map[ct] ?? 'AUTRE'
}

export async function runPipeline(scraperName: string, dryRun = false): Promise<PipelineResult> {
  const startTime = Date.now()

  // ÉTAPE 1 — Scraping
  const scraper = sources.get(scraperName)
  if (!scraper) {
    throw new Error(`Unknown source: "${scraperName}". Available: ${[...sources.keys()].join(', ')}`)
  }

  // Circuit breaker : si la source a été désactivée après trop de runs
  // consécutifs sans offre (cf. ÉTAPE 4), on n'exécute même pas le scraping —
  // inutile de retaper un site cassé à chaque cron tant que personne n'a
  // vérifié la cause (structure HTML, anti-bot).
  // On en profite pour récupérer les sourceUrl déjà connues de cette source :
  // les scrapers à DETAIL_LIMIT s'en servent pour prioriser les offres
  // jamais vues plutôt que retraiter les mêmes offres à chaque run.
  let seenSourceUrls = new Set<string>()

  if (!dryRun) {
    const prismaCheck = new PrismaClient()
    try {
      const existing = await prismaCheck.source.findUnique({ where: { url: scraper.url } })
      if (existing && !existing.isActive) {
        warn(SOURCE, `Source "${scraperName}" désactivée (circuit breaker, ${existing.emptyRuns} runs vides) — scraping ignoré`)
        return {
          scraperName,
          totalScraped: 0,
          totalInserted: 0,
          totalDuplicates: 0,
          totalErrors: 0,
          duration: Date.now() - startTime,
          skipped: true,
        }
      }

      if (existing) {
        const knownOffers = await prismaCheck.jobOffer.findMany({
          where: { sourceId: existing.id },
          select: { sourceUrl: true },
        })
        seenSourceUrls = new Set(knownOffers.map(o => o.sourceUrl))
      }
    } finally {
      await prismaCheck.$disconnect()
    }
  }

  info(SOURCE, `[1/5] Scraping ${scraperName}${dryRun ? ' (dry-run)' : ''}...`)
  const result = await scraper.scrape(seenSourceUrls)
  info(SOURCE, `Scraped ${result.offers.length} raw offers (${result.errors.length} scraper errors)`, {
    scraperName,
    rawCount: result.offers.length,
    errors: result.errors,
  })

  // Stamp le pays depuis la métadonnée du scraper sur chaque offre
  const stampedOffers = result.offers.map(o => ({ ...o, country: o.country ?? scraper.country }))

  // ÉTAPE 2 — Normalisation règle-based + enrichissement IA (Haiku)
  // normalizeWithAI() appelle Haiku uniquement pour les offres ambiguës
  // (secteur absent, niveau multi-diplôme…). Les autres passent en règle-based seul.
  info(SOURCE, `[2/5] Normalizing ${stampedOffers.length} offers (with AI enrichment)...`)
  const normalized = await Promise.all(
    stampedOffers.map(async offer => ({
      offer: await normalizeWithAI(offer, computeScoreConfidence(offer)),
      hash: createHash(offer),
    }))
  )

  // ÉTAPE 3 — Déduplication
  info(SOURCE, `[3/5] Deduplicating...`)

  let totalInserted = 0
  let totalDuplicates = 0
  let totalErrors = result.errors.length

  if (dryRun) {
    const seen = new Set<string>()
    for (const { hash } of normalized) {
      if (seen.has(hash)) totalDuplicates++
      else seen.add(hash)
    }
    totalInserted = normalized.length - totalDuplicates
    info(SOURCE, `[dry-run] Would insert ${totalInserted} offers, ${totalDuplicates} in-batch duplicates`)

    const duration = Date.now() - startTime
    const pipelineResult: PipelineResult = {
      scraperName,
      totalScraped: stampedOffers.length,
      totalInserted,
      totalDuplicates,
      totalErrors,
      duration,
    }
    success(SOURCE, `Pipeline complete (dry-run): ${JSON.stringify(pipelineResult, null, 2)}`)
    return pipelineResult
  }

  // Mode normal — accès DB
  const prisma = new PrismaClient()

  try {
    // Récupère les hash de toutes les offres existantes, quel que soit le
    // statut : la colonne hash est unique en base sur TOUTE la table (y
    // compris EXPIRED/ARCHIVED), donc un doublon contre une offre archivée
    // doit être compté comme doublon ici plutôt que d'échouer plus loin sur
    // la contrainte @unique lors de l'insertion.
    const activeHashes = await prisma.jobOffer.findMany({
      select: { hash: true },
    })
    const existingHashes = new Set(activeHashes.map(h => h.hash))

    const newOffers = normalized.filter(({ hash }) => !existingHashes.has(hash))
    totalDuplicates = normalized.length - newOffers.length
    info(SOURCE, `${newOffers.length} new, ${totalDuplicates} duplicates (vs DB)`)

    // ÉTAPE 4 — Insertion DB
    info(SOURCE, `[4/5] Inserting ${newOffers.length} offers...`)

    // Upsert de la source (création auto si elle n'existe pas)
    const sourceRecord = await prisma.source.upsert({
      where: { url: scraper.url },
      create: {
        name: scraper.name,
        url: scraper.url,
        type: (scraper as any).sourceType ?? 'MEDIA_LOCAL',
        country: scraper.country,
        isActive: true,
      },
      update: {},
    })

    for (const { offer, hash } of newOffers) {
      try {
        await prisma.jobOffer.create({
          data: {
            title: offer.title,
            organization: offer.organization,
            city: offer.city,
            country: offer.country,
            sector: offer.sector,
            level: offer.level,
            contractType: toPrismaContractType(offer.contractType),
            description: offer.description,
            requirements: offer.requirements,
            contactEmail: offer.contactEmail,
            contactPhone: offer.contactPhone,
            contactAddress: offer.contactAddress,
            applicationUrl: offer.applicationUrl,
            sourceId: sourceRecord.id,
            sourceUrl: offer.sourceUrl,
            isSponsored: offer.isSponsored ?? false,
            isFraudSuspect: offer.isFraudSuspect ?? false,
            hash,
            publishedAt: offer.publishedAt,
            deadline: offer.deadline,
            scoreConfidence: offer.scoreConfidence,
            status: JobOfferStatus.PENDING,
          },
        })
        totalInserted++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logError(SOURCE, `Insert failed for "${offer.title}": ${msg}`, {
          scraperName,
          hash,
          sourceUrl: offer.sourceUrl,
          offer,
        })
        totalErrors++
      }
    }

    // Met à jour lastCrawled et remet crawlErrors à 0 après succès.
    // Circuit breaker : si Phase 1 n'a récupéré AUCUNE offre (pas juste "rien
    // de nouveau" — stampedOffers reflète le brut avant dédup), on incrémente
    // emptyRuns. Au-delà du seuil, on désactive la source et on alerte
    // immédiatement par mail plutôt que d'attendre le rapport quotidien.
    if (stampedOffers.length === 0) {
      const updated = await prisma.source.update({
        where: { id: sourceRecord.id },
        data: { lastCrawled: new Date(), emptyRuns: { increment: 1 } },
      })

      if (updated.emptyRuns >= CIRCUIT_BREAKER_THRESHOLD) {
        await prisma.source.update({ where: { id: sourceRecord.id }, data: { isActive: false } })
        warn(SOURCE, `[CIRCUIT BREAKER] Source "${scraper.name}" désactivée après ${updated.emptyRuns} runs consécutifs sans offre`)
        try {
          await sendMail({
            to: ALERT_EMAIL_TO,
            subject: `[Tumaa Scraper] Source désactivée automatiquement : ${scraper.name}`,
            text: [
              `La source "${scraper.name}" (${scraper.url}) n'a retourné aucune offre lors des ${updated.emptyRuns} derniers runs consécutifs.`,
              '',
              `Erreurs scraper du dernier run : ${result.errors.join(' | ') || 'aucune'}`,
              '',
              `Cause probable : changement de structure HTML ou nouvelle protection anti-bot sur le site source.`,
              `La source a été désactivée (isActive=false) pour éviter des runs inutiles. Vérifier manuellement puis réactiver en base.`,
            ].join('\n'),
          })
        } catch (mailErr) {
          logError(SOURCE, `Échec envoi alerte circuit breaker : ${mailErr instanceof Error ? mailErr.message : mailErr}`)
        }
      }
    } else {
      await prisma.source.update({
        where: { id: sourceRecord.id },
        data: { lastCrawled: new Date(), crawlErrors: 0, emptyRuns: 0 },
      })
    }

    // ÉTAPE 5 — TTL : expirer les offres périmées
    info(SOURCE, `[5/5] Expiring stale offers...`)
    const now = new Date()

    const byDeadline = await prisma.jobOffer.updateMany({
      where: { status: JobOfferStatus.ACTIVE, deadline: { lt: now } },
      data: { status: JobOfferStatus.EXPIRED },
    })

    // Offres sans deadline : on respecte le ttlDays par offre
    const noDeadlineCandidates = await prisma.jobOffer.findMany({
      where: { status: JobOfferStatus.ACTIVE, deadline: null },
      select: { id: true, createdAt: true, ttlDays: true },
    })
    const staleIds = noDeadlineCandidates
      .filter(j => {
        const expiry = new Date(j.createdAt)
        expiry.setDate(expiry.getDate() + j.ttlDays)
        return expiry < now
      })
      .map(j => j.id)

    if (staleIds.length > 0) {
      await prisma.jobOffer.updateMany({
        where: { id: { in: staleIds } },
        data: { status: JobOfferStatus.EXPIRED },
      })
    }

    info(SOURCE, `Expired ${byDeadline.count} by deadline, ${staleIds.length} by TTL`)
  } finally {
    await prisma.$disconnect()
  }

  const duration = Date.now() - startTime
  const pipelineResult: PipelineResult = {
    scraperName,
    totalScraped: stampedOffers.length,
    totalInserted,
    totalDuplicates,
    totalErrors,
    duration,
  }
  success(SOURCE, `Pipeline complete: ${scraperName}`, pipelineResult)
  return pipelineResult
}
