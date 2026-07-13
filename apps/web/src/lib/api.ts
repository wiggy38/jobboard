import axios from 'axios'
import type { OffreApiResponse } from './types'

export async function fetchOffre(
  jobId: string,
  token: string | null
): Promise<OffreApiResponse> {
  const params = token ? { t: token } : {}
  const { data } = await axios.get<OffreApiResponse>(
    `/api/offre/${jobId}`,
    { params }
  )
  return data
}

export async function trackSubscribeClick(token: string, plan?: 'PREMIUM' | 'ELITE'): Promise<void> {
  try {
    await fetch('/api/subscribe/track', {
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
  channels: SubscribeChannel[]
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
