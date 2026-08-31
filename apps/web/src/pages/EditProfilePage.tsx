import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  PLAN_LIMITS,
  isUnlimited,
  CITY_OPTIONS,
  SECTOR_OPTIONS,
  LEVEL_OPTIONS,
  CONTRACT_GROUPS,
  type ContractGroupId,
  type PlanLimits,
  type UserPlan,
} from '@tumaa/shared'
import Logo from '../components/Logo'
import MetaTags from '../components/MetaTags'
import ToggleOptionStep from '../components/ToggleOptionStep'
import {
  fetchEditProfile,
  saveEditProfile,
  fetchBotPhone,
  fetchReferenceOptions,
  fetchPlanLimits,
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

export default function EditProfilePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('t')

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [plan, setPlan] = useState<UserPlan | null>(null)

  const [stepIndex, setStepIndex] = useState(0)
  const [cities, setCities] = useState<string[]>([])
  const [sectors, setSectors] = useState<string[]>([])
  const [contractGroups, setContractGroups] = useState<ContractGroupId[]>([])
  const [levels, setLevels] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [citiesByCountry, setCitiesByCountry] = useState<Record<string, ReferenceOption[]> | null>(null)
  const [country, setCountry] = useState('BF')
  const [sectorOptions, setSectorOptions] = useState<ReferenceOption[]>(SECTOR_OPTIONS)
  const [levelOptions, setLevelOptions] = useState<ReferenceOption[]>(LEVEL_OPTIONS)
  const cityOptions = citiesByCountry?.[country] ?? CITY_OPTIONS

  const [planLimits, setPlanLimits] = useState<Record<UserPlan, PlanLimits>>(PLAN_LIMITS)
  const [botPhone, setBotPhone] = useState(import.meta.env.VITE_BOT_PHONE ?? '22600000000')

  useEffect(() => {
    fetchReferenceOptions()
      .then((opts) => {
        setCitiesByCountry(opts.citiesByCountry)
        setSectorOptions(opts.sectors)
        setLevelOptions(opts.levels)
      })
      .catch(() => {
        // pas bloquant : on garde les valeurs par défaut de @tumaa/shared
      })
  }, [])

  useEffect(() => {
    fetchPlanLimits()
      .then(setPlanLimits)
      .catch(() => {
        // pas bloquant : on garde les valeurs par défaut PLAN_LIMITS
      })
  }, [])

  useEffect(() => {
    fetchBotPhone().then(setBotPhone).catch(() => {
      // garde la valeur par défaut en cas d'échec réseau
    })
  }, [])

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setLoadError(true)
      return
    }
    fetchEditProfile(token)
      .then((profile) => {
        setPlan(profile.plan)
        setCountry(profile.country)
        setCities(profile.cities)
        setSectors(profile.sectors)
        setContractGroups(profile.contractGroups)
        setLevels(profile.levels)
        setCountries(profile.countries)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 text-center">
        <Logo />
      </div>
    )
  }

  if (loadError || !token || !plan) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-slate-500 mb-4">Lien invalide ou expiré.</p>
        <p className="text-xs text-slate-400">Tape *MODIFIER* sur WhatsApp pour obtenir un nouveau lien.</p>
      </div>
    )
  }

  const limits = planLimits[plan]
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
      await saveEditProfile(token, {
        cities,
        sectors,
        contractGroups,
        levels,
        countries: plan === 'ELITE' ? countries : undefined,
      })
      setDone(true)
    } catch {
      setError("Échec de l'enregistrement. Réessaie ou vérifie que le lien n'a pas expiré.")
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="max-w-md mx-auto px-4 py-8 text-center">
          <div className="flex justify-center mb-8">
            <Logo />
          </div>
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-lg font-semibold text-slate-800 mb-2">Profil mis à jour</h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-8">
            Retourne sur WhatsApp pour voir tes nouvelles offres.
          </p>
          <a
            href={`https://wa.me/${botPhone}?text=${encodeURIComponent('OFFRES')}`}
            className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
          >
            Ouvrir WhatsApp
          </a>
        </div>
      </div>
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
        title="Modifier ton profil — Tumaa"
        description="Ajuste tes villes, secteurs, type de contrat et niveau d'étude."
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
          nextLabel={plan === 'ELITE' ? 'Suivant — mes pays' : 'Enregistrer'}
          {...commonProps}
        />
      )}

      {step === 'country' && (
        <ToggleOptionStep
          title="Dans quels pays souhaites-tu rechercher un emploi ?"
          subtitle="Choisis les pays où tu recherches de l'emploi (au moins un pays)."
          options={COUNTRY_OPTIONS}
          selected={countries}
          max={limits.maxCountries}
          onToggle={(v) => toggle(countries, setCountries, v, limits.maxCountries)}
          onNext={goNext}
          nextLabel="Enregistrer"
          {...commonProps}
        />
      )}
    </>
  )
}
