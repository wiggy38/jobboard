import { PrismaClient, JobOfferStatus, ScraperRunStatus, ContractType as PrismaContractType } from '@prisma/client'
import { RawJobOffer, SETTING_KEYS } from '@tumaa/shared'
import { normalizeWithAI } from './lib/normalizer'
import { createHash } from './lib/deduplicator'
import { info, warn, error as logError, success } from './lib/logger'
import { sendMail } from './lib/mailer'
import { getSetting } from './lib/settings'
import sources from './sources'

const SOURCE = 'pipeline'

// Nombre de runs consécutifs sans la moindre offre récupérée en Phase 1
// (navigation/listing vide) avant de couper la source. Ce signal est distinct
// de crawlErrors (monitor.ts, qui détecte un run manqué) : ici le scraper a
// bien tourné mais n'a rien trouvé, symptôme typique d'un site qui a changé
// de structure ou déployé une protection anti-bot.
const CIRCUIT_BREAKER_THRESHOLD = 3

export interface PipelineResult {
  scraperName: string
  totalScraped: number
  totalInserted: number
  totalDuplicates: number
  totalExpired: number
  totalErrors: number
  duration: number
  skipped?: boolean
}

// Persiste un run dans ScraperRun (historique des pulls, affiché en admin).
// Best-effort : un échec d'écriture de l'historique ne doit jamais faire
// planter le pipeline lui-même.
async function recordRun(params: {
  sourceId: string
  status: ScraperRunStatus
  totalScraped?: number
  totalInserted?: number
  totalDuplicates?: number
  totalExpired?: number
  totalErrors?: number
  duration: number
  errorMessage?: string
}): Promise<void> {
  const prisma = new PrismaClient()
  try {
    await prisma.scraperRun.create({
      data: {
        sourceId: params.sourceId,
        status: params.status,
        totalScraped: params.totalScraped ?? 0,
        totalInserted: params.totalInserted ?? 0,
        totalDuplicates: params.totalDuplicates ?? 0,
        totalExpired: params.totalExpired ?? 0,
        totalErrors: params.totalErrors ?? 0,
        duration: params.duration,
        errorMessage: params.errorMessage,
      },
    })
  } catch (err) {
    logError(SOURCE, `Échec écriture historique ScraperRun : ${err instanceof Error ? err.message : err}`)
  } finally {
    await prisma.$disconnect()
  }
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
        const duration = Date.now() - startTime
        await recordRun({ sourceId: existing.id, status: ScraperRunStatus.SKIPPED, duration })
        return {
          scraperName,
          totalScraped: 0,
          totalInserted: 0,
          totalDuplicates: 0,
          totalExpired: 0,
          totalErrors: 0,
          duration,
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
  let result: Awaited<ReturnType<typeof scraper.scrape>>
  try {
    result = await scraper.scrape(seenSourceUrls)
  } catch (err) {
    if (!dryRun) {
      const prismaLookup = new PrismaClient()
      try {
        const existing = await prismaLookup.source.findUnique({ where: { url: scraper.url } })
        if (existing) {
          await recordRun({
            sourceId: existing.id,
            status: ScraperRunStatus.ERROR,
            duration: Date.now() - startTime,
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        }
      } finally {
        await prismaLookup.$disconnect()
      }
    }
    throw err
  }
  info(SOURCE, `Scraped ${result.offers.length} raw offers (${result.errors.length} scraper errors)`, {
    scraperName,
    rawCount: result.offers.length,
    errors: result.errors,
  })

  // Récapitulatif des fiches rejetées par Haiku ("pas une offre") — envoyé
  // par mail à la fin du scraping pour permettre une vérification manuelle
  // (faux négatifs éventuels) sans avoir à fouiller les logs.
  if (result.rejectedNotJobOffer && result.rejectedNotJobOffer.length > 0) {
    try {
      await sendMail({
        to: await getSetting(SETTING_KEYS.SCRAPER_REPORT_EMAIL_TO),
        subject: `[Tumaa Scraper] ${result.rejectedNotJobOffer.length} fiches rejetées (pas une offre) — ${scraperName}`,
        text: [
          `${result.rejectedNotJobOffer.length} fiches écartées par l'extraction Haiku sur la source "${scraperName}" (jugées non conformes à une offre d'emploi individuelle) :`,
          '',
          ...result.rejectedNotJobOffer.map(url => `  - ${url}`),
        ].join('\n'),
      })
    } catch (mailErr) {
      logError(SOURCE, `Échec envoi récapitulatif fiches rejetées : ${mailErr instanceof Error ? mailErr.message : mailErr}`)
    }
  }

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
  let totalExpired = 0
  let totalErrors = result.errors.length

  // Une offre dont la deadline est déjà passée ne doit jamais être importée
  // (ni en dry-run, ni en insertion réelle) — inutile de la faire vivre en
  // base pour la marquer EXPIRED juste après.
  const now0 = new Date()
  const notExpired = normalized.filter(({ offer }) => {
    const expired = offer.deadline != null && offer.deadline < now0
    if (expired) totalExpired++
    return !expired
  })

  if (dryRun) {
    const seen = new Set<string>()
    for (const { hash } of notExpired) {
      if (seen.has(hash)) totalDuplicates++
      else seen.add(hash)
    }
    totalInserted = notExpired.length - totalDuplicates
    info(SOURCE, `[dry-run] Would insert ${totalInserted} offers, ${totalDuplicates} in-batch duplicates, ${totalExpired} skipped (deadline passée)`)

    const duration = Date.now() - startTime
    const pipelineResult: PipelineResult = {
      scraperName,
      totalScraped: stampedOffers.length,
      totalInserted,
      totalDuplicates,
      totalExpired,
      totalErrors,
      duration,
    }
    success(SOURCE, `Pipeline complete (dry-run): ${JSON.stringify(pipelineResult, null, 2)}`)
    return pipelineResult
  }

  // Mode normal — accès DB
  const prisma = new PrismaClient()
  let sourceId: string | undefined

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

    const newOffers = notExpired.filter(({ hash }) => !existingHashes.has(hash))
    totalDuplicates = notExpired.length - newOffers.length
    info(SOURCE, `${newOffers.length} new, ${totalDuplicates} duplicates (vs DB), ${totalExpired} skipped (deadline passée)`)

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
    sourceId = sourceRecord.id

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
            contactEmail: offer.contactEmail,
            contactPhone: offer.contactPhone,
            contactAddress: offer.contactAddress,
            applicationUrl: offer.applicationUrl,
            sourceId: sourceRecord.id,
            sourceUrl: offer.sourceUrl,
            isSponsored: offer.isSponsored ?? false,
            isFeatured: offer.isFeatured ?? false,
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
            to: await getSetting(SETTING_KEYS.SCRAPER_REPORT_EMAIL_TO),
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
  } catch (err) {
    const duration = Date.now() - startTime
    if (sourceId) {
      await recordRun({
        sourceId,
        status: ScraperRunStatus.ERROR,
        totalScraped: stampedOffers.length,
        totalInserted,
        totalDuplicates,
        totalExpired,
        totalErrors: totalErrors + 1,
        duration,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
    }
    throw err
  } finally {
    await prisma.$disconnect()
  }

  const duration = Date.now() - startTime
  const pipelineResult: PipelineResult = {
    scraperName,
    totalScraped: stampedOffers.length,
    totalInserted,
    totalDuplicates,
    totalExpired,
    totalErrors,
    duration,
  }
  if (sourceId) {
    await recordRun({
      sourceId,
      status: totalErrors > 0 ? ScraperRunStatus.ERROR : ScraperRunStatus.SUCCESS,
      totalScraped: stampedOffers.length,
      totalInserted,
      totalDuplicates,
      totalExpired,
      totalErrors,
      duration,
    })
  }
  success(SOURCE, `Pipeline complete: ${scraperName}`, pipelineResult)
  return pipelineResult
}
