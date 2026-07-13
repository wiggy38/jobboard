import Logo from '../components/Logo'
import MetaTags from '../components/MetaTags'

export default function ExpiredPage() {
  const botPhone = import.meta.env.VITE_BOT_PHONE ?? '22600000000'

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <MetaTags
        title="Offre expirée — Tumaa"
        description="Tapez OFFRES sur WhatsApp pour voir les dernières offres."
        url={window.location.href}
      />
      <div className="max-w-md mx-auto px-4 py-8 text-center">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <div className="mt-12">
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-lg font-semibold text-slate-800 mb-2">
            Ce lien a expiré
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-8">
            Tapez OFFRES sur WhatsApp pour retrouver
            <br />
            les dernières offres disponibles.
          </p>
          <a
            href={`https://wa.me/${botPhone}?text=OFFRES`}
            className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
          >
            Ouvrir WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}
