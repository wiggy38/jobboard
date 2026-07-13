import { useEffect, useState, useCallback } from 'react'
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { fetchOffre } from '../lib/api'
import type { OffreApiResponse } from '../lib/types'
import Logo from '../components/Logo'
import MetaTags from '../components/MetaTags'

function getDaysUntil(deadline: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function Skeleton() {
  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-4 animate-pulse">
      <div className="h-6 bg-slate-200 rounded w-70 mx-auto" style={{ width: 280 }} />
      <div className="flex flex-col items-center gap-2 mt-4">
        <div className="h-4 bg-slate-200 rounded" style={{ width: 180 }} />
        <div className="h-4 bg-slate-200 rounded" style={{ width: 180 }} />
        <div className="h-4 bg-slate-200 rounded" style={{ width: 180 }} />
      </div>
      <div className="h-30 bg-slate-200 rounded-2xl mx-auto mt-4" style={{ width: 320, height: 120 }} />
    </div>
  )
}

export default function OffrePage() {
  const { jobId } = useParams<{ jobId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('t')

  const [data, setData] = useState<OffreApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorType, setErrorType] = useState<'NETWORK' | null>(null)

  const load = useCallback(() => {
    if (!jobId) return
    setLoading(true)
    setErrorType(null)
    fetchOffre(jobId, token)
      .then((response) => {
        setData(response)
        setLoading(false)
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response) {
          const code = err.response.data?.error
          if (
            code === 'TOKEN_EXPIRED' ||
            code === 'TOKEN_INVALID' ||
            code === 'JOB_NOT_FOUND' ||
            code === 'JOB_INACTIVE'
          ) {
            navigate('/expired', { replace: true })
            return
          }
        }
        setErrorType('NETWORK')
        setLoading(false)
      })
  }, [jobId, token, navigate])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Skeleton />
      </div>
    )
  }

  if (errorType === 'NETWORK') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md mx-auto text-center space-y-4">
          <p className="text-slate-600 text-sm leading-relaxed">
            Impossible de charger cette offre.
            <br />
            Vérifiez votre connexion.
          </p>
          <button
            onClick={load}
            className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors duration-200"
          >
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { job, accessLevel } = data

  const deadlineBlock = job.deadline ? (() => {
    const days = getDaysUntil(job.deadline)
    return days > 0 ? (
      <p className="text-sm text-amber-600 mt-3 text-center">
        ⏳ Clôture dans {days} jour{days > 1 ? 's' : ''}
      </p>
    ) : (
      <p className="text-sm text-slate-400 mt-3 text-center">⏳ Offre clôturée</p>
    )
  })() : null

  const badges = (
    <div className="flex flex-wrap gap-2 justify-center mt-3">
      <span className="px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-700">
        📍 {job.city}
      </span>
      <span className="px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-700">
        💼 {job.sector}
      </span>
      <span className="px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-700">
        📋 {job.contractType}
      </span>
    </div>
  )

  if (accessLevel === 'PREVIEW') {
    return (
      <div className="max-w-md mx-auto px-4 py-8 bg-white min-h-screen">
        <MetaTags
          title={`${job.title} — Tumaa`}
          description={`${job.city} · ${job.sector} · ${job.contractType}`}
          url={window.location.href}
        />
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-900 text-center">{job.title}</h1>
          {badges}
          {deadlineBlock}
        </div>

        <div className="mt-8 p-6 rounded-2xl bg-green-50 border border-green-200 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="text-base font-semibold text-slate-800 mb-2">
            Abonnez-vous pour accéder à l'offre complète
          </h2>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">
            Abonnez-vous à Tumaa pour <b>650 FCFA/mois</b>
            <br />
            et recevez les détails complets de l'offre.
          </p>
          <Link
            to={`/premium?offerId=${job.id}`}
            className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
          >
            Cliquer pour s&apos;abonner
          </Link>
        </div>
      </div>
    )
  }

  // FULL access
  const metaTitle = `${job.title} — ${job.organization ?? 'Tumaa'}`
  const metaDescription = `${job.city} · ${job.sector} · ${job.contractType}`

  const hasContacts =
    job.contactEmail !== null ||
    job.contactPhone !== null ||
    job.contactAddress !== null

  return (
    <div className="max-w-md mx-auto px-4 py-8 bg-white min-h-screen">
      <MetaTags
        title={metaTitle}
        description={metaDescription}
        url={window.location.href}
      />
      <div className="flex justify-center mb-8">
        <Logo />
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 text-center">{job.title}</h1>
        {job.organization && (
          <p className="text-sm text-slate-600 text-center mt-1">🏢 {job.organization}</p>
        )}
        {badges}
        {deadlineBlock}
      </div>

      {job.level && (
        <div className="mt-6">
          <h2 className="font-semibold text-slate-800 mb-2">🎓 Niveau requis</h2>
          <p className="text-sm text-slate-700 whitespace-pre-line">{job.level}</p>
        </div>
      )}

      {job.description && (
        <div className="mt-6">
          <h2 className="font-semibold text-slate-800 mb-2">📝 Description</h2>
          <p className="text-sm text-slate-700 whitespace-pre-line">{job.description}</p>
        </div>
      )}

      {job.requirements && (
        <div className="mt-6">
          <h2 className="font-semibold text-slate-800 mb-2">✅ Profil recherché</h2>
          <p className="text-sm text-slate-700 whitespace-pre-line">{job.requirements}</p>
        </div>
      )}

      {hasContacts && (
        <div className="mt-8">
          <h2 className="font-semibold text-slate-800 mb-4">📬 Contacts</h2>
          <div>
            {job.contactEmail && (
              <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                <span>✉️</span>
                <a
                  href={`mailto:${job.contactEmail}`}
                  className="text-sm text-green-700 font-medium"
                >
                  {job.contactEmail}
                </a>
              </div>
            )}
            {job.contactPhone && (
              <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                <span>📞</span>
                <a
                  href={`tel:${job.contactPhone}`}
                  className="text-sm text-green-700 font-medium"
                >
                  {job.contactPhone}
                </a>
              </div>
            )}
            {job.contactAddress && (
              <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                <span>📍</span>
                <span className="text-sm text-slate-700">{job.contactAddress}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {job.sourceUrl && (
        <div className="mt-8">
          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-center transition-colors duration-200"
          >
            🔗 Voir l&apos;offre sur {job.sourceName}
          </a>
        </div>
      )}
    </div>
  )
}
