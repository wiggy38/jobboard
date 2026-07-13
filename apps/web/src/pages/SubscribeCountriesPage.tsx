import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import MetaTags from '../components/MetaTags'
import { fetchSubscribeCountries, saveSubscribeCountries, type SubscribeChannel } from '../lib/api'

const ELITE_MAX_COUNTRIES = 3

const COUNTRY_OPTIONS = [
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'BJ', name: 'Bénin', flag: '🇧🇯' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬' },
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮' },
]

export default function SubscribeCountriesPage() {
  const botPhone = import.meta.env.VITE_BOT_PHONE ?? '22600000000'
  const [searchParams] = useSearchParams()
  const token = searchParams.get('t')
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [channels, setChannels] = useState<SubscribeChannel[] | null>(null)
  const [joined, setJoined] = useState<Set<string>>(new Set())
  const [alreadyJoined, setAlreadyJoined] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!token) return
    fetchSubscribeCountries(token)
      .then((countries) => {
        if (countries.length > 0) setSelected(countries)
        setAlreadyJoined(new Set(countries))
      })
      .catch(() => {
        // pas bloquant : l'utilisateur peut simplement sélectionner à nouveau
      })
  }, [token])

  const markJoined = (country: string) => {
    setJoined((prev) => new Set(prev).add(country))
  }

  const toggle = (code: string) => {
    setSelected((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code)
      if (prev.length >= ELITE_MAX_COUNTRIES) return prev
      return [...prev, code]
    })
  }

  const handleSubmit = async () => {
    if (!token || selected.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const { channels: result } = await saveSubscribeCountries(token, selected)
      setJoined(new Set(selected.filter((c) => alreadyJoined.has(c))))
      setChannels(result)
    } catch {
      setError('Impossible d’enregistrer tes pays. Le lien a peut-être expiré.')
    } finally {
      setSaving(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <p className="text-sm text-slate-500 text-center">Lien invalide.</p>
      </div>
    )
  }

  if (channels) {
    const joinableCount = channels.filter((c) => c.inviteLink).length
    const allJoined = joinableCount > 0 && joined.size >= joinableCount

    return (
      <div className="max-w-md mx-auto px-4 py-8 bg-white min-h-screen">
        <MetaTags title="Pays confirmés — Tumaa" description="Rejoins tes canaux nationaux." url={window.location.href} />
        <div className="flex justify-center mb-8">
          <Logo />
        </div>
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">👑</div>
          <h1 className="text-lg font-bold text-slate-900">Rejoins tes canaux</h1>
          <p className="text-sm text-slate-500 mt-2">
            Étape obligatoire : clique sur chaque canal ci-dessous pour recevoir un teaser des
            offres de ce pays chaque matin à 08:00.
          </p>
          {joinableCount > 0 && (
            <p className="text-xs font-semibold text-amber-600 mt-2">
              {joined.size}/{joinableCount} canal(aux) rejoint(s)
            </p>
          )}
        </div>
        <div className="space-y-3">
          {channels.map((c) => {
            const hasJoined = joined.has(c.country)
            return (
              <div
                key={c.country}
                className={`rounded-xl border p-4 flex items-center justify-between ${
                  hasJoined ? 'border-green-300 bg-green-50' : 'border-slate-200'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.channel}</p>
                </div>
                {c.inviteLink ? (
                  hasJoined ? (
                    <span className="text-xs font-semibold text-green-700">✔️ Rejoint</span>
                  ) : (
                    <a
                      href={c.inviteLink}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => markJoined(c.country)}
                      className="py-2 px-4 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
                    >
                      Rejoindre
                    </a>
                  )
                ) : (
                  <span className="text-xs text-amber-600">Bientôt disponible</span>
                )}
              </div>
            )
          })}
        </div>

        {allJoined && (
          <a
            href={`https://wa.me/${botPhone}?text=${encodeURIComponent('OFFRES')}`}
            className="block w-full mt-6 py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
          >
            ✅ Terminé — retourner sur WhatsApp
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 bg-white min-h-screen">
      <MetaTags
        title="Choisis tes pays — Tumaa ELITE"
        description="Sélectionne jusqu'à 3 pays de recherche."
        url={window.location.href}
      />
      <div className="flex justify-center mb-8">
        <Logo />
      </div>
      <div className="mb-6 text-center">
        <span className="text-2xl">👑</span>
        <h1 className="text-lg font-bold text-slate-900 mt-1">Choisis tes pays</h1>
        <p className="text-sm text-slate-500 mt-2">
          Sélectionne jusqu&apos;à {ELITE_MAX_COUNTRIES} pays de recherche ({selected.length}/{ELITE_MAX_COUNTRIES})
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {COUNTRY_OPTIONS.map((c) => {
          const isSelected = selected.includes(c.code)
          const disabled = !isSelected && selected.length >= ELITE_MAX_COUNTRIES
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => toggle(c.code)}
              disabled={disabled}
              className={`w-full flex items-center justify-between rounded-xl border p-4 text-left transition-colors duration-200 disabled:opacity-40 ${
                isSelected ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
              }`}
            >
              <span className="text-sm font-medium text-slate-800">
                {c.flag} {c.name}
              </span>
              {isSelected && <span className="text-amber-600">✔️</span>}
            </button>
          )
        })}
      </div>

      {error && <p className="text-xs text-red-600 text-center mb-4">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={selected.length === 0 || saving}
        className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold text-center transition-colors duration-200"
      >
        {saving ? 'Enregistrement…' : 'Valider mes pays'}
      </button>
    </div>
  )
}
