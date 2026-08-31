import { isUnlimited, type UserPlan } from '@tumaa/shared'
import Logo from './Logo'

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

export default function ToggleOptionStep({
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
