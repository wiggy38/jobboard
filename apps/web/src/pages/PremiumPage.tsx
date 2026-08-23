import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import MetaTags from '../components/MetaTags'
import { fetchBotPhone, fetchPlanPricing, type PlanPricing } from '../lib/api'

const FEATURES = [
  '3 villes suivies',
  '3 secteurs suivis',
  '3 types de contrat suivis',
  'Alertes par mots-clés',
  'Historique des offres sur 30 jours',
]

const DEFAULT_PREMIUM_PRICING: PlanPricing = { barredPrice: 650, price: 650 }

function formatFcfa(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount)
}

export default function PremiumPage() {
  const [searchParams] = useSearchParams()
  const [botPhone, setBotPhone] = useState(import.meta.env.VITE_BOT_PHONE ?? '22670000000')
  const [pricing, setPricing] = useState<PlanPricing>(DEFAULT_PREMIUM_PRICING)
  const offerId = searchParams.get('offerId')

  useEffect(() => {
    fetchBotPhone().then(setBotPhone).catch(() => {
      // garde la valeur par défaut en cas d'échec réseau
    })
  }, [])

  useEffect(() => {
    fetchPlanPricing()
      .then((p) => setPricing(p.PREMIUM))
      .catch(() => {
        // garde la valeur par défaut DEFAULT_PREMIUM_PRICING en cas d'échec réseau
      })
  }, [])

  const waText = offerId ? `PREMIUM ${offerId}` : 'PREMIUM'

  return (
    <div className="max-w-md mx-auto px-4 py-8 bg-white min-h-screen">
      <MetaTags
        title="Abonnement Premium — Tumaa"
        description={`${formatFcfa(pricing.price)} FCFA/mois : 3 villes, 3 secteurs, 3 types de contrat, alertes mots-clés et historique 30 jours.`}
        url={window.location.href}
      />
      <div className="flex justify-center mb-8">
        <Logo />
      </div>

      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">Passez à Premium</h1>
        <p className="text-sm text-slate-500 mt-2">
          Élargis ta recherche à plus de villes et de secteurs
        </p>
      </div>

      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center mb-6">
        {pricing.barredPrice > pricing.price && (
          <p className="text-base font-semibold text-slate-400 line-through">{formatFcfa(pricing.barredPrice)} FCFA</p>
        )}
        <p className="text-3xl font-extrabold text-green-700">{formatFcfa(pricing.price)} FCFA</p>
        <p className="text-sm text-slate-600">/ mois</p>
      </div>

      <ul className="space-y-3 mb-8">
        {FEATURES.map((feature) => (
          <li key={feature} className="flex items-center gap-3 text-sm text-slate-700">
            <span className="text-green-600">✔️</span>
            {feature}
          </li>
        ))}
      </ul>

      <a
        href={`https://wa.me/${botPhone}?text=${encodeURIComponent(waText)}`}
        className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
      >
        S&apos;abonner – {formatFcfa(pricing.price)} FCFA/mois
      </a>
      <p className="text-xs text-slate-400 text-center mt-4">
        Paiement via PayDunya (Orange Money, Moov Money, carte bancaire), directement sur WhatsApp.
      </p>
    </div>
  )
}
