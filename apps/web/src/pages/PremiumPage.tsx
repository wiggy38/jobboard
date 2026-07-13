import { useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import MetaTags from '../components/MetaTags'

const FEATURES = [
  '3 villes suivies',
  '3 secteurs suivis',
  'Contacts visibles sur chaque offre',
  'Alertes par mots-clés',
  'Historique des offres sur 30 jours',
]

export default function PremiumPage() {
  const [searchParams] = useSearchParams()
  const botPhone = import.meta.env.VITE_BOT_PHONE ?? '22670000000'
  const offerId = searchParams.get('offerId')

  const waText = offerId ? `PREMIUM ${offerId}` : 'PREMIUM'

  return (
    <div className="max-w-md mx-auto px-4 py-8 bg-white min-h-screen">
      <MetaTags
        title="Abonnement Premium — Tumaa"
        description="650 FCFA/mois : 3 villes, 3 secteurs, contacts visibles, alertes et historique 30 jours."
        url={window.location.href}
      />
      <div className="flex justify-center mb-8">
        <Logo />
      </div>

      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">Passez à Premium</h1>
        <p className="text-sm text-slate-500 mt-2">
          Débloquez l&apos;accès complet aux offres Tumaa
        </p>
      </div>

      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center mb-6">
        <p className="text-3xl font-extrabold text-green-700">650 FCFA</p>
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
        S&apos;abonner – 650 FCFA/mois
      </a>
      <p className="text-xs text-slate-400 text-center mt-4">
        Paiement via CinetPay, Orange Money ou Moov Money, directement sur WhatsApp.
      </p>
    </div>
  )
}
