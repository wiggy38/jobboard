import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PLAN_LIMITS, isUnlimited, type PlanLimits, type UserPlan } from '@tumaa/shared'
import Logo from '../components/Logo'
import MetaTags from '../components/MetaTags'
import { fetchPlanLimits, initiateSubscribePayment, simulateSubscribePayment, trackSubscribeClick } from '../lib/api'

const SIMULATION_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_PAYMENT_SIMULATION === 'true'

function freemiumSummary(limits: PlanLimits): string {
  const cities = isUnlimited(limits.maxCities) ? 'villes illimitées' : `${limits.maxCities} villes`
  const sectors = isUnlimited(limits.maxSectors) ? 'secteurs illimités' : `${limits.maxSectors} secteurs`
  const levels = isUnlimited(limits.maxLevels) ? "niveaux d'étude illimités" : `${limits.maxLevels} niveau d'étude`
  return `${cities}, ${sectors}, ${levels}, ${limits.maxContractGroups} types de contrat`
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

function buildFaqItems(premium: PlanLimits, elite: PlanLimits) {
  return [
    {
      question: 'Comment se passe le paiement ?',
      answer:
        'En cliquant sur "S\'abonner", tu es redirigé vers PayDunya pour payer par Orange Money, Moov Money, Coris Money ou carte bancaire. Une fois le paiement confirmé, ton abonnement est activé automatiquement.',
    },
    {
      question: 'Quelle est la différence entre Freemium et Premium ?',
      answer:
        `Freemium et Premium couvrent les mêmes ${premium.maxCities} villes et ${premium.maxSectors} secteurs. La différence : Premium débloque le lien direct vers l'annonce complète sur le site source, alors qu'en Freemium tu es redirigé vers la liste des offres.`,
    },
    {
      question: 'Quelle est la différence entre PREMIUM et ELITE ?',
      answer:
        `PREMIUM couvre ${premium.maxCities} villes et ${premium.maxSectors} secteurs dans ton pays. ELITE ajoute ${
          isUnlimited(elite.maxCities) && isUnlimited(elite.maxSectors)
            ? 'une recherche illimitée en villes/secteurs'
            : `${elite.maxCities} villes et ${elite.maxSectors} secteurs`
        } et te permet de choisir jusqu'à ${elite.maxCountries} pays de recherche.`,
    },
    {
      question: 'Comment choisir mes pays en ELITE ?',
      answer:
        `Une fois abonné ELITE, tape PAYS sur WhatsApp pour sélectionner jusqu'à ${elite.maxCountries} pays. Tu es automatiquement ajouté aux canaux d'emploi correspondants.`,
    },
    {
      question: 'Mon paiement est resté en attente, que faire ?',
      answer:
        "Tape VÉRIFIER sur WhatsApp pour resynchroniser ton paiement avec PayDunya. Si le paiement date de plus de 24h et reste bloqué, contacte le support depuis WhatsApp.",
    },
    {
      question: 'Puis-je annuler mon abonnement ?',
      answer:
        "Oui, à tout moment en tapant STOP sur WhatsApp. Tu conserves l'accès jusqu'à la fin de la période déjà payée, puis tu repasses en Freemium.",
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
      <p className="text-sm text-slate-600 mb-4">{freemiumSummary(limits)}</p>
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
  const botPhone = import.meta.env.VITE_BOT_PHONE ?? '22600000000'
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('t')
  const [simulating, setSimulating] = useState<'PREMIUM' | 'ELITE' | null>(null)
  const [simulateError, setSimulateError] = useState<string | null>(null)
  const [paying, setPaying] = useState<'PREMIUM' | 'ELITE' | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const [planLimits, setPlanLimits] = useState<Record<UserPlan, PlanLimits>>(PLAN_LIMITS)

  useEffect(() => {
    if (token) trackSubscribeClick(token)
  }, [token])

  useEffect(() => {
    fetchPlanLimits()
      .then(setPlanLimits)
      .catch(() => {
        // garde les valeurs par défaut PLAN_LIMITS en cas d'échec réseau
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
        <FreemiumCard token={token} botPhone={botPhone} limits={planLimits.FREEMIUM} />

        <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
          <div className="text-center mb-4">
            <span className="text-2xl">📱</span>
            <h2 className="text-base font-bold text-slate-900 mt-1">PREMIUM</h2>
            <p className="text-2xl font-extrabold text-green-700 mt-1">
              650 <span className="text-sm font-medium text-slate-500">FCFA/mois</span>
            </p>
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
              {paying === 'PREMIUM' ? 'Redirection vers le paiement…' : "S'abonner · 650 FCFA/mois"}
            </button>
          ) : (
            <a
              href={`https://wa.me/${botPhone}?text=${encodeURIComponent('PREMIUM')}`}
              onClick={() => handlePlanClick('PREMIUM')}
              className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
            >
              S&apos;abonner · 650 FCFA/mois
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
            <p className="text-2xl font-extrabold text-green-700 mt-1">
              1 250 <span className="text-sm font-medium text-slate-500">FCFA/mois</span>
            </p>
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
              {paying === 'ELITE' ? 'Redirection vers le paiement…' : "S'abonner · 1 250 FCFA/mois"}
            </button>
          ) : (
            <a
              href={`https://wa.me/${botPhone}?text=${encodeURIComponent('ELITE')}`}
              onClick={() => handlePlanClick('ELITE')}
              className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
            >
              S&apos;abonner · 1 250 FCFA/mois
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
          {buildFaqItems(planLimits.PREMIUM, planLimits.ELITE).map((item) => (
            <FaqItem key={item.question} question={item.question} answer={item.answer} />
          ))}
        </div>
      </div>
    </div>
  )
}
