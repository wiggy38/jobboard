import type { FastifyInstance } from 'fastify'
import { SETTING_KEYS } from '@tumaa/shared'
import { prisma } from './lib/prisma'
import { getSetting } from './lib/settings'

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'https://tumaa.bf'

function generateShortCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
}

type TokenVerifyResult =
  | { ok: true; userId: string | null }
  | { ok: false; error: string; message: string }

function verifyOfferToken(fastify: FastifyInstance, jobId: string, token: string | null): TokenVerifyResult {
  if (!token) return { ok: true, userId: null }
  try {
    const payload = fastify.jwt.verify<{ userId: string; offerId: string }>(token)
    if (payload.offerId !== jobId) {
      return { ok: false, error: 'TOKEN_INVALID', message: 'Token invalide' }
    }
    return { ok: true, userId: payload.userId }
  } catch {
    return { ok: false, error: 'TOKEN_EXPIRED', message: 'Lien expiré ou invalide' }
  }
}

export async function offreRoutes(fastify: FastifyInstance) {
  // Numéro WhatsApp du bot par pays, éditable en backoffice (Paramètres →
  // "Numéro du bot") — alimente les liens wa.me sur apps/home et apps/web.
  // Non authentifié : c'est un numéro affiché publiquement, pas un secret
  // (à ne pas confondre avec phoneNumberId/accessToken Meta API, qui eux
  // restent en env côté apps/bot).
  fastify.get('/api/public/whatsapp-number', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*')
    const country = (request.query as { country?: string }).country?.toUpperCase()
    const numbers = await getSetting(SETTING_KEYS.WHATSAPP_BOT_NUMBERS)
    const number = (country && numbers[country]) || numbers.BF || ''
    return { number }
  })

  // Liste publique des offres actives — alimente apps/home (page /offres,
  // filtres pays/secteur en client-side). Aucune donnée sensible (contacts,
  // description complète) : uniquement les champs affichés sur une card.
  fastify.get('/api/offres', async (_request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*')

    const now = Date.now()
    const newThreshold = new Date(now - 5 * 24 * 60 * 60 * 1000)
    const urgentThreshold = new Date(now + 7 * 24 * 60 * 60 * 1000)

    const jobs = await prisma.jobOffer.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ isFeatured: 'desc' }, { isSponsored: 'desc' }, { publishedAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        title: true,
        city: true,
        sector: true,
        country: true,
        contractType: true,
        deadline: true,
        createdAt: true,
      },
    })

    return reply.send({
      offres: jobs.map((job) => ({
        id: job.id,
        title: job.title,
        city: job.city,
        sector: job.sector,
        country: job.country,
        contractType: job.contractType,
        deadline: job.deadline?.toISOString() ?? null,
        isNew: job.createdAt >= newThreshold,
        isUrgent: job.deadline ? job.deadline <= urgentThreshold : false,
      })),
    })
  })

  fastify.get<{
    Params: { jobId: string }
    Querystring: { t?: string }
  }>('/api/offre/:jobId', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*')
    const { jobId } = request.params
    const token = request.query.t ?? null

    // ÉTAPE 2 — Vérifier le token JWT si présent (intégrité du lien + identifie
    // l'utilisateur pour le tracking JobInteraction ; le contenu de la réponse
    // ne dépend plus du plan de l'utilisateur)
    const verified = verifyOfferToken(fastify, jobId, token)
    if (!verified.ok) {
      return reply.status(401).send({ error: verified.error, message: verified.message })
    }
    const userId = verified.userId

    // ÉTAPE 3 — Récupérer l'offre en DB
    const job = await prisma.jobOffer.findUnique({
      where: { id: jobId },
      include: { source: { select: { name: true, url: true, trustScore: true, type: true } } },
    })

    if (!job) {
      return reply.status(404).send({
        error: 'JOB_NOT_FOUND',
        message: 'Offre introuvable',
      })
    }

    if (job.status !== 'ACTIVE') {
      return reply.status(404).send({
        error: 'JOB_INACTIVE',
        message: "Cette offre n'est plus active",
      })
    }

    // ÉTAPE 4 — Contacts toujours visibles pour tous les plans (y compris
    // FREEMIUM, cf. règle 1 CLAUDE.md). Le lien direct vers la source est
    // désormais aussi débloqué pour tous les plans (décision actée 2026-08-30,
    // voir CLAUDE.md) — en WhatsApp le comportement était déjà inchangé.
    if (userId) {
      await prisma.jobInteraction
        .create({ data: { userId, jobId: job.id, action: 'SEEN' } })
        .catch(() => {})
    }

    // ÉTAPE 5 — Construire la réponse
    return reply.send({
      job: {
        id: job.id,
        title: job.title,
        city: job.city,
        country: job.country,
        sector: job.sector,
        contractType: job.contractType,
        deadline: job.deadline?.toISOString() ?? null,
        status: job.status,
        organization: job.organization,
        level: job.level,
        description: job.description,
        requirements: job.requirements,
        contactEmail: job.contactEmail,
        contactPhone: job.contactPhone,
        contactAddress: job.contactAddress,
        applicationUrl: job.applicationUrl,
        sourceUrl: job.sourceUrl,
        sourceName: job.source.name,
        sourceTrustScore: job.source.trustScore,
        sourceType: job.source.type,
      },
    })
  })

  // Tracking du clic sortant vers la source (bouton "Voir l'offre complète
  // sur le site source" côté page offre tokenisée) — appelé en fire-and-forget
  // (keepalive) par le frontend au moment du clic, en parallèle de la
  // navigation vers sourceUrl.
  fastify.post<{
    Params: { jobId: string }
    Querystring: { t?: string }
  }>('/api/offre/:jobId/click', async (request, reply) => {
    const { jobId } = request.params
    const token = request.query.t ?? null

    const verified = verifyOfferToken(fastify, jobId, token)
    if (!verified.ok) {
      return reply.status(401).send({ error: verified.error, message: verified.message })
    }

    if (verified.userId) {
      await prisma.jobInteraction
        .create({ data: { userId: verified.userId, jobId, action: 'CLICKED_SOURCE' } })
        .catch(() => {})
    }

    return reply.status(204).send()
  })

  // Tracking du partage (bouton "Partager avec un ami" / partage WhatsApp
  // côté page offre tokenisée) — appelé en fire-and-forget (keepalive) par le
  // frontend au moment du partage.
  fastify.post<{
    Params: { jobId: string }
    Querystring: { t?: string }
  }>('/api/offre/:jobId/share', async (request, reply) => {
    const { jobId } = request.params
    const token = request.query.t ?? null

    const verified = verifyOfferToken(fastify, jobId, token)
    if (!verified.ok) {
      return reply.status(401).send({ error: verified.error, message: verified.message })
    }

    if (verified.userId) {
      await prisma.jobInteraction
        .create({ data: { userId: verified.userId, jobId, action: 'SHARED' } })
        .catch(() => {})
    }

    return reply.status(204).send()
  })

  // Génère (ou réutilise) un short link pour une offre partagée par un abonné —
  // remplace l'URL complète dans le message de partage (voir shareOffer() côté
  // apps/backoffice/src/routes/offre/[token]/+page.svelte). Un seul short link
  // par (offre, parraineur), réutilisé si l'abonné partage plusieurs fois.
  fastify.post<{
    Params: { jobId: string }
    Querystring: { t?: string }
  }>('/api/offre/:jobId/shortlink', async (request, reply) => {
    const { jobId } = request.params
    const token = request.query.t ?? null

    const verified = verifyOfferToken(fastify, jobId, token)
    if (!verified.ok) {
      return reply.status(401).send({ error: verified.error, message: verified.message })
    }
    if (!verified.userId) {
      return reply.status(401).send({ error: 'ANONYMOUS', message: 'Lien de partage requiert un abonné identifié' })
    }
    const referrerId = verified.userId

    const existing = await prisma.shortLink.findUnique({
      where: { jobId_referrerId: { jobId, referrerId } },
    })
    if (existing) {
      return reply.send({ code: existing.code, shortUrl: `${WEB_BASE_URL}/s/${existing.code}` })
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateShortCode()
      try {
        await prisma.shortLink.create({ data: { code, jobId, referrerId } })
        return reply.send({ code, shortUrl: `${WEB_BASE_URL}/s/${code}` })
      } catch (err: any) {
        if (err?.code === 'P2002') continue // collision de code — retry
        throw err
      }
    }
    return reply.status(500).send({ error: 'SHORTLINK_FAILED', message: 'Impossible de générer un short link' })
  })

  // Résolution publique d'un short link — appelée serveur-à-serveur par le
  // redirecteur /s/[code] du backoffice, jamais directement par un navigateur.
  fastify.get<{ Params: { code: string } }>('/api/shortlinks/:code', async (request, reply) => {
    const { code } = request.params

    const link = await prisma.shortLink.findUnique({
      where: { code },
      include: { referrer: { select: { referralCode: true } } },
    })
    if (!link) {
      return reply.status(404).send({ error: 'SHORTLINK_NOT_FOUND', message: 'Lien introuvable' })
    }

    prisma.shortLink
      .update({ where: { code }, data: { clickCount: { increment: 1 }, lastClickedAt: new Date() } })
      .catch(() => {})
    prisma.shortLinkClick.create({ data: { shortLinkId: code } }).catch(() => {})

    const token = fastify.jwt.sign({ userId: link.referrerId, offerId: link.jobId }, { expiresIn: '7d' })

    return reply.send({
      path: `/offre/${link.jobId}?t=${token}&ref=${link.referrer.referralCode}`,
    })
  })
}
