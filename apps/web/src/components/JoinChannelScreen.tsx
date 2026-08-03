import Logo from './Logo'
import MetaTags from './MetaTags'
import { markChannelJoined, type SubscribeChannel } from '../lib/api'

// Canal unique déterminé côté serveur depuis l'indicatif du numéro WhatsApp
// de l'abonné (jamais depuis ses pays de recherche ELITE) — voir
// /api/subscribe/join-channel. Pas de blocage : "Continuer" est toujours
// disponible (Meta ne permet aucune vérification côté serveur du join
// effectif) — le clic sur "Rejoindre" signale juste au backend que l'abonné
// a bien cliqué, pour le suivi backoffice (ChannelJoin.joined).
export default function JoinChannelScreen({
  channel,
  token,
  onContinue,
}: {
  channel: SubscribeChannel
  token: string
  onContinue: () => void
}) {
  return (
    <div className="max-w-md mx-auto px-4 py-8 bg-white min-h-screen">
      <MetaTags title="Rejoins ton canal — Tumaa" description="Rejoins le canal WhatsApp de ton pays." url={window.location.href} />
      <div className="flex justify-center mb-8">
        <Logo />
      </div>
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">📢</div>
        <h1 className="text-lg font-bold text-slate-900">Rejoins ton canal</h1>
        <p className="text-sm text-slate-500 mt-2">
          Reçois un teaser des offres de {channel.name} chaque matin à 08:00.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 flex items-center justify-between mb-6">
        <div>
          <p className="text-sm font-semibold text-slate-800">{channel.name}</p>
          <p className="text-xs text-slate-500">{channel.channel}</p>
        </div>
        {channel.inviteLink ? (
          <a
            href={channel.inviteLink}
            target="_blank"
            rel="noreferrer"
            onClick={() => markChannelJoined(token)}
            className="py-2 px-4 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
          >
            Rejoindre
          </a>
        ) : (
          <span className="text-xs text-amber-600">Bientôt disponible</span>
        )}
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
      >
        Continuer
      </button>
    </div>
  )
}
