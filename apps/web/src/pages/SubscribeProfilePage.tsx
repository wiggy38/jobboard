import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  PLAN_LIMITS,
  isUnlimited,
  CITY_OPTIONS,
  SECTOR_OPTIONS,
  LEVEL_OPTIONS,
  CONTRACT_GROUPS,
  ELITE_MAX_COUNTRIES,
  type ContractGroupId,
  type UserPlan,
} from '@tumaa/shared'
import Logo from '../components/Logo'
import MetaTags from '../components/MetaTags'
import JoinChannelScreen from '../components/JoinChannelScreen'
import {
  saveSubscribeProfile,
  fetchSubscribeCountries,
  saveSubscribeCountries,
  joinHomeChannel,
  fetchReferenceOptions,
  type SubscribeChannel,
  type ReferenceOption,
} from '../lib/api'

type Step = 'city' | 'sector' | 'contract' | 'level' | 'country'

const BASE_STEPS: Step[] = ['city', 'sector', 'contract', 'level']

const CONTRACT_OPTIONS = (Object.entries(CONTRACT_GROUPS) as [ContractGroupId, { label: string }][]).map(
  ([value, g]) => ({ value, label: g.label })
)

const COUNTRY_OPTIONS = [
  { value: 'BF', label: '🇧🇫 Burkina Faso' },
  { value: 'BJ', label: '🇧🇯 Bénin' },
  { value: 'TG', label: '🇹🇬 Togo' },
  { value: 'CI', label: "🇨🇮 Côte d'Ivoire" },
]

const PLAN_LABELS: Record<UserPlan, string> = {
  FREEMIUM: 'Freemium',
  PREMIUM: 'Premium',
  ELITE: 'Elite',
}

const PLAN_BADGE_STYLES: Record<UserPlan, string> = {
  FREEMIUM: 'bg-slate-800 text-white',
  PREMIUM: 'bg-green-600 text-white',
  ELITE: 'bg-amber-500 text-white',
}

const PLAN_ICONS: Record<UserPlan, string> = {
  FREEMIUM: '🆓',
  PREMIUM: '⭐',
  ELITE: '👑',
}

function ToggleOptionStep({
  title,
  subtitle,
  options,
  selected,
  max,
  onToggle,
  onNext,
  onBack,
  stepNumber,
  totalSteps,
  nextLabel,
  saving,
  plan,
}: {
  title: string
  subtitle: string
  options: { value: string; label: string }[]
  selected: string[]
  max: number
  onToggle: (value: string) => void
  onNext: () => void
  onBack?: () => void
  stepNumber: number
  totalSteps: number
  nextLabel: string
  saving?: boolean
  plan: UserPlan
}) {
  const unlimited = isUnlimited(max)

  return (
    <div className="max-w-md mx-auto px-4 py-8 bg-white min-h-screen">
      <div className="flex justify-center mb-6">
        <Logo />
      </div>

      <div className="flex justify-center mb-6">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-sm ${PLAN_BADGE_STYLES[plan]}`}
        >
          <span className="text-base">{PLAN_ICONS[plan]}</span>
          Formule {PLAN_LABELS[plan]}
        </span>
      </div>

      <p className="text-xs font-semibold text-slate-400 text-center mb-2">
        Étape {stepNumber}/{totalSteps}
      </p>
      <div className="mb-6 text-center">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-2">
          {subtitle} {unlimited ? '' : `(max ${max})`} — {selected.length}/{unlimited ? '∞' : max}
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {options.map((o) => {
          const isSelected = selected.includes(o.value)
          const disabled = !isSelected && !unlimited && selected.length >= max
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              disabled={disabled}
              className={`w-full flex items-center justify-between rounded-xl border p-4 text-left transition-colors duration-200 disabled:opacity-40 ${
                isSelected ? 'border-green-400 bg-green-50' : 'border-slate-200'
              }`}
            >
              <span className="text-sm font-medium text-slate-800">{o.label}</span>
              {isSelected && <span className="text-green-600">✔️</span>}
            </button>
          )
        })}
      </div>

      <div className="flex gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="py-3 px-4 rounded-xl border border-slate-300 text-slate-600 font-semibold text-center hover:bg-slate-50 transition-colors duration-200"
          >
            Précédent
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={selected.length === 0 || saving}
          className="flex-1 py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold text-center transition-colors duration-200"
        >
          {saving ? 'Enregistrement…' : nextLabel}
        </button>
      </div>
    </div>
  )
}

export default function SubscribeProfilePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('t')
  const planParam = searchParams.get('plan')
  const plan: UserPlan | null =
    planParam === 'FREEMIUM' || planParam === 'PREMIUM' || planParam === 'ELITE' ? planParam : null

  const [stepIndex, setStepIndex] = useState(0)
  const [cities, setCities] = useState<string[]>([])
  const [sectors, setSectors] = useState<string[]>([])
  const [contractGroups, setContractGroups] = useState<ContractGroupId[]>([])
  const [levels, setLevels] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [channel, setChannel] = useState<SubscribeChannel | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Référentiels édités en backoffice — CITY_OPTIONS/SECTOR_OPTIONS/LEVEL_OPTIONS
  // de @tumaa/shared servent d'état initial (pas de flash vide le temps du
  // fetch), remplacés dès que /api/reference/options répond. Villes : BF
  // uniquement pour l'instant (app mono-pays côté abonnement), comme avant.
  const [cityOptions, setCityOptions] = useState<ReferenceOption[]>(CITY_OPTIONS)
  const [sectorOptions, setSectorOptions] = useState<ReferenceOption[]>(SECTOR_OPTIONS)
  const [levelOptions, setLevelOptions] = useState<ReferenceOption[]>(LEVEL_OPTIONS)

  useEffect(() => {
    fetchReferenceOptions()
      .then((opts) => {
        setCityOptions(opts.citiesByCountry.BF ?? CITY_OPTIONS)
        setSectorOptions(opts.sectors)
        setLevelOptions(opts.levels)
      })
      .catch(() => {
        // pas bloquant : on garde les valeurs par défaut de @tumaa/shared
      })
  }, [])

  useEffect(() => {
    if (plan !== 'ELITE' || !token) return
    fetchSubscribeCountries(token)
      .then((existing) => {
        if (existing.length > 0) setCountries(existing)
      })
      .catch(() => {
        // pas bloquant : l'utilisateur peut simplement sélectionner à nouveau
      })
  }, [plan, token])

  if (!token || !plan) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-slate-500 mb-4">Lien invalide ou expiré.</p>
        <a href="/subscribe" className="text-sm text-green-700 underline">
          Retourner au choix de formule
        </a>
      </div>
    )
  }

  const limits = PLAN_LIMITS[plan]
  const STEPS: Step[] = plan === 'ELITE' ? [...BASE_STEPS, 'country'] : BASE_STEPS
  const totalSteps = STEPS.length
  const step = STEPS[stepIndex]

  const toggle = <T extends string>(list: T[], setList: (v: T[]) => void, value: T, max: number) => {
    if (list.includes(value)) {
      setList(list.filter((v) => v !== value))
      return
    }
    if (!isUnlimited(max) && list.length >= max) return
    setList([...list, value])
  }

  // "Tous types" est exclusif : le sélectionner désélectionne les autres
  // groupes, et sélectionner un groupe précis désélectionne "Tous types".
  const toggleContract = (value: ContractGroupId) => {
    setContractGroups((prev) => {
      if (value === 'CONTRACT_ALL') {
        return prev.includes('CONTRACT_ALL') ? [] : ['CONTRACT_ALL']
      }

      const withoutAll = prev.filter((v) => v !== 'CONTRACT_ALL')
      if (withoutAll.includes(value)) {
        return withoutAll.filter((v) => v !== value)
      }
      if (!isUnlimited(limits.maxContractGroups) && withoutAll.length >= limits.maxContractGroups) {
        return withoutAll
      }
      return [...withoutAll, value]
    })
  }

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1)
      return
    }
    void submit()
  }

  const goBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveSubscribeProfile(token, { cities, sectors, contractGroups, levels })
      if (plan === 'ELITE') {
        await saveSubscribeCountries(token, countries)
      }
      const { channel: result } = await joinHomeChannel(token)
      setChannel(result)
    } catch {
      setError('Échec de l\'enregistrement. Réessaie ou vérifie que le lien n\'a pas expiré.')
    } finally {
      setSaving(false)
    }
  }

  if (channel) {
    return (
      <JoinChannelScreen
        channel={channel}
        token={token}
        onContinue={() => navigate(`/success?plan=${plan}`)}
      />
    )
  }

  const commonProps = {
    stepNumber: stepIndex + 1,
    totalSteps,
    onBack: stepIndex > 0 ? goBack : undefined,
    saving,
    plan,
  }

  return (
    <>
      <MetaTags
        title="Ton profil de recherche — Tumaa"
        description="Définis tes villes, secteurs, type de contrat et niveau d'étude."
        url={window.location.href}
      />
      {error && <p className="text-xs text-red-600 text-center pt-4">{error}</p>}

      {step === 'city' && (
        <ToggleOptionStep
          title="Choisis tes villes"
          subtitle="Sélectionne au moins une ville et cliques sur Suivant"
          options={cityOptions}
          selected={cities}
          max={limits.maxCities}
          onToggle={(v) => toggle(cities, setCities, v, limits.maxCities)}
          onNext={goNext}
          nextLabel="Suivant"
          {...commonProps}
        />
      )}

      {step === 'sector' && (
        <ToggleOptionStep
          title="Dans quels secteurs d'activités recherches-tu un emploi ?"
          subtitle="Sélectionne au moins un secteur et cliques sur Suivant"
          options={sectorOptions}
          selected={sectors}
          max={limits.maxSectors}
          onToggle={(v) => toggle(sectors, setSectors, v, limits.maxSectors)}
          onNext={goNext}
          nextLabel="Suivant"
          {...commonProps}
        />
      )}

      {step === 'contract' && (
        <ToggleOptionStep
          title="Quels types de contrat recherches-tu ?"
          subtitle="Sélectionne au moins un type de contrat et cliques sur Suivant"
          options={CONTRACT_OPTIONS}
          selected={contractGroups}
          max={limits.maxContractGroups}
          onToggle={(v) => toggleContract(v as ContractGroupId)}
          onNext={goNext}
          nextLabel="Suivant"
          {...commonProps}
        />
      )}

      {step === 'level' && (
        <ToggleOptionStep
          title="Pour quel(s) niveau(x) d'études recherches-tu un emploi ?"
          subtitle="Sélectionne au moins un niveau d'études."
          options={levelOptions}
          selected={levels}
          max={limits.maxLevels}
          onToggle={(v) => toggle(levels, setLevels, v, limits.maxLevels)}
          onNext={goNext}
          nextLabel={plan === 'ELITE' ? 'Suivant — choisir mes pays' : 'Terminer'}
          {...commonProps}
        />
      )}

      {step === 'country' && (
        <ToggleOptionStep
          title="Dans quels pays souhaites-tu rechercher un emploi ?"
          subtitle="Choisis les pays où tu recherches de l'emploi (au moins un pays)."
          options={COUNTRY_OPTIONS}
          selected={countries}
          max={ELITE_MAX_COUNTRIES}
          onToggle={(v) => toggle(countries, setCountries, v, ELITE_MAX_COUNTRIES)}
          onNext={goNext}
          nextLabel="Terminer"
          {...commonProps}
        />
      )}
    </>
  )
}
