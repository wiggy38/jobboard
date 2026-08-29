import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PLAN_LIMITS, isUnlimited, type PlanLimits, type UserPlan } from '@tumaa/shared'
import Logo from '../components/Logo'
import MetaTags from '../components/MetaTags'
import {
  fetchBotPhone,
  fetchPlanLimits,
  fetchPlanPricing,
  fetchSubscribeCountry,
  initiateSubscribePayment,
  simulateSubscribePayment,
  trackSubscribeClick,
  type PlanPricing,
} from '../lib/api'

const SIMULATION_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_PAYMENT_SIMULATION === 'true'

const DEFAULT_PLAN_PRICING: Record<'PREMIUM' | 'ELITE', PlanPricing> = {
  PREMIUM: { barredPrice: 650, price: 650 },
  ELITE: { barredPrice: 1250, price: 1250 },
}

function formatFcfa(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount)
}

function PriceTag({ pricing }: { pricing: PlanPricing }) {
  return (
    <p className="text-2xl font-extrabold text-green-700 mt-1">
      {pricing.barredPrice > pricing.price && (
        <span className="text-base font-semibold text-slate-400 line-through mr-2">
          {formatFcfa(pricing.barredPrice)}
        </span>
      )}
      {formatFcfa(pricing.price)} <span className="text-sm font-medium text-slate-500">FCFA/mois</span>
    </p>
  )
}

function freemiumSummary(limits: PlanLimits): string {
  const cities = isUnlimited(limits.maxCities) ? 'villes illimitées' : `${limits.maxCities} villes`
  const sectors = isUnlimited(limits.maxSectors) ? 'secteurs illimités' : `${limits.maxSectors} secteurs`
  const levels = isUnlimited(limits.maxLevels) ? "niveaux d'étude illimités" : `${limits.maxLevels} niveau d'étude`
  return `${cities}, ${sectors}, ${levels}, ${limits.maxContractGroups} types de contrat`
}

function freemiumFeatures(limits: PlanLimits): string[] {
  const cities = isUnlimited(limits.maxCities) ? 'villes illimitées' : `${limits.maxCities} villes`
  const sectors = isUnlimited(limits.maxSectors)
    ? "secteurs d'activités illimités"
    : `${limits.maxSectors} secteurs d'activités`
  return [
    `Rechercher dans ${cities}`,
    `Rechercher dans ${sectors}`,
    `Rechercher jusqu'à ${limits.maxContractGroups} types de contrat`,
  ]
}

function premiumFeatures(limits: PlanLimits): string[] {
  const cities = isUnlimited(limits.maxCities) ? 'un nombre illimité de villes' : `${limits.maxCities} villes`
  const sectors = isUnlimited(limits.maxSectors)
    ? "un nombre illimité de secteurs d'activités"
    : `${limits.maxSectors} secteurs d'activités`
  return [
    `Rechercher dans ${cities}`,
    `Rechercher dans ${sectors}`,
    `Rechercher jusqu'à ${limits.maxContractGroups} types de contrat`,
    'Alertes par mots-clés',
    "Lien direct vers l'offre complète",
  ]
}

function eliteFeatures(limits: PlanLimits): string[] {
  return [...premiumFeatures(limits), `Jusqu'à ${limits.maxCountries} pays de recherche`]
}

function buildFaqItems(freemium: PlanLimits) {
  return [
    {
      question: "C'est quoi Tumaa exactement ?",
      answer:
        "Tumaa rassemble chaque jour les offres d'emploi publiées en Afrique de l'Ouest (Bénin, Burkina Faso, Côte d'Ivoire) sur les sites d'annonces, ANPE, ONG, presse, et réseaux professionnels puis t'envoie celles qui correspondent à ton profil, directement sur WhatsApp. Plus besoin de visiter dix sites différents chaque matin.",
    },
    {
      question: 'Pourquoi WhatsApp et pas une application ?',
      answer:
        "Parce que tu as déjà WhatsApp. Rien à télécharger, rien qui prend de la place sur ton téléphone, et ça marche même avec une connexion faible. Tu reçois tes offres là où tu es déjà, tous les jours.",
    },
    {
      question: "D'où viennent les offres, et sont-elles fiables ?",
      answer:
        "Des plateformes d'emploi publiques, des sites d'ONG et d'institutions, de la presse en ligne — et de notre réseau de scouts sur le terrain, qui remontent les offres affichées physiquement ou partagées dans des groupes, celles qu'on ne trouve peut-être nulle part ailleurs. Chaque offre affiche toujours sa source. Tumaa ne demandera jamais d'argent pour une candidature, et aucun employeur sérieux ne le fait non plus.",
    },
    {
      question: 'Tumaa recrute directement ?',
      answer:
        "Non. Tumaa ne recrute pas et ne se substitue ni à l'employeur, ni au site qui publie l'annonce. Nous rassemblons les offres et te mettons en relation avec l'employeur ou le site éditeur : chaque offre indique sa source ou son contact, et tu postules directement auprès de l'employeur, ou en suivant les instructions figurant sur le site d'origine.",
    },
    {
      question: 'Je reçois mes offres automatiquement ou je dois demander ?',
      answer:
        "C'est toi qui décides du moment. Envoie OFFRES quand tu veux consulter tes correspondances — le matin au réveil, dans le taxi, entre deux rendez-vous. Nous ne t'inondons pas de messages non sollicités. Et chaque matin à 8h, un aperçu des meilleures offres du jour est publié sur notre canal national.",
    },
    {
      question: 'Le service est gratuit ?',
      answer:
        `Oui, l'offre Freemium est gratuite et sans limite de durée : ${freemiumSummary(freemium)}. Le Premium te donne accès au lien direct vers l'annonce d'origine et aux alertes par mots-clés — mensuel, sans engagement. Si tu arrêtes, tu repasses simplement en Freemium et gardes l'accès au service.`,
    },
    {
      question: 'Il y a des offres pour les profils sans diplôme ?',
      answer:
        "Oui. Tumaa couvre tous les niveaux : manœuvres, chauffeurs, commerce, artisanat, aussi bien que cadres et postes ONG. Tu indiques ton niveau dans ton profil et nous filtrons les offres en conséquence.",
    },
  ]
}

function FreemiumCard({
  token,
  botPhone,
  limits,
}: {
  token: string | null
  botPhone: string
  limits: PlanLimits
}) {
  const navigate = useNavigate()

  if (!token) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
        <h2 className="text-base font-bold text-slate-900 mb-2">🆓 Continuer gratuitement</h2>
        <ul className="space-y-2 mb-4 text-left">
          {freemiumFeatures(limits).map((feature) => (
            <li key={feature} className="flex items-center gap-3 text-sm text-slate-700">
              <span className="text-green-600">✔️</span>
              {feature}
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-600 mb-4">
          Tape *OFFRES* sur WhatsApp pour recevoir tes premières offres.
        </p>
        <a
          href={`https://wa.me/${botPhone}?text=${encodeURIComponent('OFFRES')}`}
          className="block w-full py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-center hover:bg-slate-100 transition-colors duration-200"
        >
          Recevoir mes offres sur WhatsApp
        </a>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
      <span className="text-2xl">🆓</span>
      <h2 className="text-base font-bold text-slate-900 mt-1 mb-2">Continuer gratuitement</h2>
      <ul className="space-y-2 mb-6 text-left">
        {freemiumFeatures(limits).map((feature) => (
          <li key={feature} className="flex items-center gap-3 text-sm text-slate-700">
            <span className="text-green-600">✔️</span>
            {feature}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => navigate(`/profile?t=${token}&plan=FREEMIUM`)}
        className="block w-full py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-center hover:bg-slate-100 transition-colors duration-200"
      >
        Définir mon profil
      </button>
    </div>
  )
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-200 py-3">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-slate-900"
        aria-expanded={open}
      >
        {question}
        <span className="shrink-0 text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open && <p className="mt-2 text-sm text-slate-600">{answer}</p>}
    </div>
  )
}

export default function SubscribePage() {
  const [botPhone, setBotPhone] = useState(import.meta.env.VITE_BOT_PHONE ?? '22600000000')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('t')
  const hideFreemium = searchParams.get('hideFreemium') === '1'
  const [simulating, setSimulating] = useState<'PREMIUM' | 'ELITE' | null>(null)
  const [simulateError, setSimulateError] = useState<string | null>(null)
  const [paying, setPaying] = useState<'PREMIUM' | 'ELITE' | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const [planLimits, setPlanLimits] = useState<Record<UserPlan, PlanLimits>>(PLAN_LIMITS)
  const [planPricing, setPlanPricing] = useState<Record<'PREMIUM' | 'ELITE', PlanPricing>>(DEFAULT_PLAN_PRICING)

  useEffect(() => {
    if (token) trackSubscribeClick(token)
  }, [token])

  useEffect(() => {
    const country = token ? fetchSubscribeCountry(token).catch(() => 'BF') : Promise.resolve('BF')
    country
      .then((c) => fetchBotPhone(c))
      .then(setBotPhone)
      .catch(() => {
        // garde la valeur par défaut en cas d'échec réseau
      })
  }, [token])

  useEffect(() => {
    fetchPlanLimits()
      .then(setPlanLimits)
      .catch(() => {
        // garde les valeurs par défaut PLAN_LIMITS en cas d'échec réseau
      })
  }, [])

  useEffect(() => {
    fetchPlanPricing()
      .then(setPlanPricing)
      .catch(() => {
        // garde les valeurs par défaut DEFAULT_PLAN_PRICING en cas d'échec réseau
      })
  }, [])

  const handlePlanClick = (plan: 'PREMIUM' | 'ELITE') => {
    if (token) trackSubscribeClick(token, plan)
  }

  const handlePay = async (plan: 'PREMIUM' | 'ELITE') => {
    if (!token) return
    handlePlanClick(plan)
    setPaying(plan)
    setPayError(null)
    try {
      const { paymentUrl } = await initiateSubscribePayment(token, plan)
      window.location.href = paymentUrl
    } catch {
      setPayError("Échec de l'initialisation du paiement. Réessaie ou vérifie que le lien n'a pas expiré.")
      setPaying(null)
    }
  }

  const handleSimulatePayment = async (plan: 'PREMIUM' | 'ELITE') => {
    if (!token) return
    setSimulating(plan)
    setSimulateError(null)
    try {
      const { redirectUrl } = await simulateSubscribePayment(token, plan)
      navigate(redirectUrl)
    } catch {
      setSimulateError("Échec de la simulation de paiement. Réessaie ou vérifie que le lien n'a pas expiré.")
      setSimulating(null)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 bg-white min-h-screen">
      <MetaTags
        title="S'abonner — Tumaa"
        description="Choisissez votre formule Tumaa : PREMIUM ou ELITE."
        url={window.location.href}
      />
      <div className="flex justify-center mb-8">
        <Logo />
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-xl font-bold text-slate-900">Choisissez votre formule</h1>
        <p className="text-sm text-slate-500 mt-2">
          Débloquez les contacts et affinez votre recherche d&apos;emploi sur Tumaa
        </p>
      </div>

      <div className="space-y-6">
        {!hideFreemium && (
          <FreemiumCard token={token} botPhone={botPhone} limits={planLimits.FREEMIUM} />
        )}

        <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
          <div className="text-center mb-4">
            <span className="text-2xl">📱</span>
            <h2 className="text-base font-bold text-slate-900 mt-1">PREMIUM</h2>
            <PriceTag pricing={planPricing.PREMIUM} />
          </div>
          <ul className="space-y-2 mb-6">
            {premiumFeatures(planLimits.PREMIUM).map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-slate-700">
                <span className="text-green-600">✔️</span>
                {feature}
              </li>
            ))}
          </ul>
          {token ? (
            <button
              type="button"
              onClick={() => handlePay('PREMIUM')}
              disabled={paying !== null}
              className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200 disabled:opacity-50"
            >
              {paying === 'PREMIUM' ? 'Redirection vers le paiement…' : `S'abonner · ${formatFcfa(planPricing.PREMIUM.price)} FCFA/mois`}
            </button>
          ) : (
            <a
              href={`https://wa.me/${botPhone}?text=${encodeURIComponent('PREMIUM')}`}
              onClick={() => handlePlanClick('PREMIUM')}
              className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
            >
              S&apos;abonner · {formatFcfa(planPricing.PREMIUM.price)} FCFA/mois
            </a>
          )}
          {SIMULATION_ENABLED && token && (
            <button
              type="button"
              onClick={() => handleSimulatePayment('PREMIUM')}
              disabled={simulating !== null}
              className="block w-full mt-3 py-2 px-4 rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs font-medium text-center hover:bg-slate-50 disabled:opacity-50"
            >
              {simulating === 'PREMIUM' ? 'Simulation en cours…' : '🧪 Simuler le paiement (dev)'}
            </button>
          )}
        </div>

        <div className="relative rounded-2xl border-2 border-amber-300 bg-amber-50 p-6">
          <span className="absolute -top-3 right-4 bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full">
            Le plus complet
          </span>
          <div className="text-center mb-4">
            <span className="text-2xl">👑</span>
            <h2 className="text-base font-bold text-slate-900 mt-1">ELITE</h2>
            <PriceTag pricing={planPricing.ELITE} />
          </div>
          <ul className="space-y-2 mb-6">
            {eliteFeatures(planLimits.ELITE).map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-slate-700">
                <span className="text-green-600">✔️</span>
                {feature}
              </li>
            ))}
          </ul>
          {token ? (
            <button
              type="button"
              onClick={() => handlePay('ELITE')}
              disabled={paying !== null}
              className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200 disabled:opacity-50"
            >
              {paying === 'ELITE' ? 'Redirection vers le paiement…' : `S'abonner · ${formatFcfa(planPricing.ELITE.price)} FCFA/mois`}
            </button>
          ) : (
            <a
              href={`https://wa.me/${botPhone}?text=${encodeURIComponent('ELITE')}`}
              onClick={() => handlePlanClick('ELITE')}
              className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
            >
              S&apos;abonner · {formatFcfa(planPricing.ELITE.price)} FCFA/mois
            </a>
          )}
          {SIMULATION_ENABLED && token && (
            <button
              type="button"
              onClick={() => handleSimulatePayment('ELITE')}
              disabled={simulating !== null}
              className="block w-full mt-3 py-2 px-4 rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs font-medium text-center hover:bg-slate-50 disabled:opacity-50"
            >
              {simulating === 'ELITE' ? 'Simulation en cours…' : '🧪 Simuler le paiement (dev)'}
            </button>
          )}
        </div>
      </div>

      {payError && (
        <p className="text-xs text-red-600 text-center mt-4">{payError}</p>
      )}
      {simulateError && (
        <p className="text-xs text-red-600 text-center mt-4">{simulateError}</p>
      )}

      <p className="text-xs text-slate-400 text-center mt-6">
        Paiement sécurisé via PayDunya (Orange Money, Moov Money, Coris Money, carte bancaire).
      </p>

      <div className="mt-10">
        <h2 className="text-base font-bold text-slate-900 mb-2">Questions fréquentes</h2>
        <div>
          {buildFaqItems(planLimits.FREEMIUM).map((item) => (
            <FaqItem key={item.question} question={item.question} answer={item.answer} />
          ))}
        </div>
      </div>
    </div>
  )
}
