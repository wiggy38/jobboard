import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import MetaTags from '../components/MetaTags'
import { simulateSubscribePayment, trackSubscribeClick } from '../lib/api'

const SIMULATION_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_PAYMENT_SIMULATION === 'true'

const PREMIUM_FEATURES = [
  'Accéder au détail de toutes les offres',
  'Rechercher dans 3 villes',
  'Rechercher dans 3 secteurs d\'activités',
]

const ELITE_FEATURES = [
  'Tout du Premium',
  "Jusqu'à 3 pays de recherche",
]

const FAQ_ITEMS = [
  {
    question: 'Comment se passe le paiement ?',
    answer:
      'Le paiement se fait directement sur WhatsApp via CinetPay, Orange Money ou Moov Money. Aucune carte bancaire ni saisie sur le site : tu confirmes le montant dans la conversation avec le bot.',
  },
  {
    question: "Qu'est-ce que l'essai gratuit de 48h ?",
    answer:
      'Tape ESSAI sur WhatsApp pour débloquer les fonctionnalités Premium pendant 48h, sans paiement. À la fin de l\'essai, tu repasses automatiquement en Freemium sauf si tu t\'abonnes.',
  },
  {
    question: 'Quelle est la différence entre PREMIUM et ELITE ?',
    answer:
      "PREMIUM couvre 3 villes et 3 secteurs dans ton pays. ELITE ajoute une recherche illimitée en villes/secteurs et te permet de choisir jusqu'à 3 pays de recherche.",
  },
  {
    question: 'Comment choisir mes pays en ELITE ?',
    answer:
      "Une fois abonné ELITE, tape PAYS sur WhatsApp pour sélectionner jusqu'à 3 pays. Tu es automatiquement ajouté aux canaux d'emploi correspondants.",
  },
  {
    question: 'Mon paiement est resté en attente, que faire ?',
    answer:
      "Tape VÉRIFIER sur WhatsApp pour resynchroniser ton paiement avec CinetPay. Si le paiement date de plus de 24h et reste bloqué, contacte le support depuis WhatsApp.",
  },
  {
    question: 'Puis-je annuler mon abonnement ?',
    answer:
      "Oui, à tout moment en tapant STOP sur WhatsApp. Tu conserves l'accès jusqu'à la fin de la période déjà payée, puis tu repasses en Freemium.",
  },
]

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

  useEffect(() => {
    if (token) trackSubscribeClick(token)
  }, [token])

  const handlePlanClick = (plan: 'PREMIUM' | 'ELITE') => {
    if (token) trackSubscribeClick(token, plan)
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
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
          <div className="text-center mb-4">
            <span className="text-2xl">📱</span>
            <h2 className="text-base font-bold text-slate-900 mt-1">PREMIUM</h2>
            <p className="text-2xl font-extrabold text-green-700 mt-1">
              650 <span className="text-sm font-medium text-slate-500">FCFA/mois</span>
            </p>
          </div>
          <ul className="space-y-2 mb-6">
            {PREMIUM_FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-slate-700">
                <span className="text-green-600">✔️</span>
                {feature}
              </li>
            ))}
          </ul>
          <a
            href={`https://wa.me/${botPhone}?text=${encodeURIComponent('PREMIUM')}`}
            onClick={() => handlePlanClick('PREMIUM')}
            className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
          >
            S&apos;abonner · 650 FCFA/mois
          </a>
          <a
            href={`https://wa.me/${botPhone}?text=${encodeURIComponent('ESSAI')}`}
            className="block text-xs text-green-700 underline text-center mt-3"
          >
            Essai 48h gratuit → tape ESSAI sur WhatsApp
          </a>
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
            {ELITE_FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-slate-700">
                <span className="text-green-600">✔️</span>
                {feature}
              </li>
            ))}
          </ul>
          <a
            href={`https://wa.me/${botPhone}?text=${encodeURIComponent('ELITE')}`}
            onClick={() => handlePlanClick('ELITE')}
            className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
          >
            S&apos;abonner · 1 250 FCFA/mois
          </a>
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

      {simulateError && (
        <p className="text-xs text-red-600 text-center mt-4">{simulateError}</p>
      )}

      <p className="text-xs text-slate-400 text-center mt-6">
        Paiement via CinetPay, Orange Money ou Moov Money, directement sur WhatsApp.
      </p>

      <div className="mt-10">
        <h2 className="text-base font-bold text-slate-900 mb-2">Questions fréquentes</h2>
        <div>
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.question} question={item.question} answer={item.answer} />
          ))}
        </div>
      </div>
    </div>
  )
}
