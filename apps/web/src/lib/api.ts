import axios from 'axios'
import type { PlanLimits, UserPlan } from '@tumaa/shared'

// Domaine de l'API — en prod pointe vers https://api.tumaajob.com (le proxy
// nginx de tumaa-web-nginx vers tumaa-api n'est pas fiable, cf. incident
// 2026-08-29) ; en dev laisser vide pour passer par le proxy Vite (/api ->
// localhost:2999, voir vite.config.ts).
const API_BASE = import.meta.env.VITE_API_URL || ''
axios.defaults.baseURL = API_BASE

export async function trackSubscribeClick(token: string, plan?: 'PREMIUM' | 'ELITE'): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/subscribe/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token, plan }),
      keepalive: true,
    })
  } catch {
    // ne jamais bloquer/casser la navigation wa.me sur un échec de tracking
  }
}

export interface SimulatePaymentResponse {
  ok: true
  plan: 'PREMIUM' | 'ELITE'
  redirectUrl: string
}

export async function simulateSubscribePayment(
  token: string,
  plan: 'PREMIUM' | 'ELITE'
): Promise<SimulatePaymentResponse> {
  const { data } = await axios.post<SimulatePaymentResponse>('/api/subscribe/simulate-payment', {
    t: token,
    plan,
  })
  return data
}

export interface InitiatePaymentResponse {
  ok: true
  paymentUrl: string
}

export async function initiateSubscribePayment(
  token: string,
  plan: 'PREMIUM' | 'ELITE'
): Promise<InitiatePaymentResponse> {
  const { data } = await axios.post<InitiatePaymentResponse>('/api/subscribe/pay', {
    t: token,
    plan,
  })
  return data
}

export interface SubscribeChannel {
  country: string
  name: string
  channel: string
  inviteLink: string | null
}

export interface SaveCountriesResponse {
  ok: true
  countries: string[]
}

export async function fetchBotPhone(country?: string): Promise<string> {
  const { data } = await axios.get<{ number: string }>('/api/public/whatsapp-number', {
    params: country ? { country } : undefined,
  })
  return data.number
}

export async function fetchSubscribeCountry(token: string): Promise<string> {
  const { data } = await axios.get<{ ok: true; country: string }>('/api/subscribe/country', {
    params: { t: token },
  })
  return data.country
}

export async function fetchSubscribeCountries(token: string): Promise<string[]> {
  const { data } = await axios.get<{ ok: true; countries: string[] }>('/api/subscribe/countries', {
    params: { t: token },
  })
  return data.countries
}

export async function saveSubscribeCountries(
  token: string,
  countries: string[]
): Promise<SaveCountriesResponse> {
  const { data } = await axios.post<SaveCountriesResponse>('/api/subscribe/countries', {
    t: token,
    countries,
  })
  return data
}

export async function joinHomeChannel(token: string): Promise<{ ok: true; channel: SubscribeChannel }> {
  const { data } = await axios.post<{ ok: true; channel: SubscribeChannel }>('/api/subscribe/join-channel', {
    t: token,
  })
  return data
}

// Fire-and-forget, comme trackSubscribeClick — ne doit jamais bloquer ni
// casser la navigation vers le lien wa.me/channel externe.
export function markChannelJoined(token: string): void {
  try {
    void fetch(`${API_BASE}/api/subscribe/channel-joined`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token }),
      keepalive: true,
    })
  } catch {
    // non-bloquant
  }
}

export interface ReferenceOption {
  value: string
  label: string
}

export interface ReferenceOptions {
  levels: ReferenceOption[]
  sectors: ReferenceOption[]
  citiesByCountry: Record<string, ReferenceOption[]>
}

export async function fetchReferenceOptions(): Promise<ReferenceOptions> {
  const { data } = await axios.get<ReferenceOptions>('/api/reference/options')
  return data
}

export async function fetchPlanLimits(): Promise<Record<UserPlan, PlanLimits>> {
  const { data } = await axios.get<{ limits: Record<UserPlan, PlanLimits> }>(
    '/api/reference/plan-limits'
  )
  return data.limits
}

export interface PlanPricing {
  barredPrice: number
  price: number
}

export interface PlanPricingResponse {
  pricing: Record<'PREMIUM' | 'ELITE', PlanPricing>
  paydunyaMode: 'test' | 'live'
}

export async function fetchPlanPricing(): Promise<PlanPricingResponse> {
  const { data } = await axios.get<PlanPricingResponse>('/api/reference/plan-pricing')
  return data
}

export interface SubscribeProfileData {
  cities: string[]
  sectors: string[]
  contractGroups: ('CONTRACT_CDI' | 'CONTRACT_CDD' | 'CONTRACT_ALL')[]
  levels: string[]
}

export async function saveSubscribeProfile(
  token: string,
  data: SubscribeProfileData
): Promise<{ ok: true }> {
  const { data: res } = await axios.post<{ ok: true }>('/api/subscribe/profile', {
    t: token,
    ...data,
  })
  return res
}
