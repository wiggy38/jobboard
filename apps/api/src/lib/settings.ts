import { DEFAULT_SETTINGS, type SettingKey, type SettingValueMap } from '@tumaa/shared'
import { prisma } from './prisma'

const TTL_MS = 30_000
const cache = new Map<SettingKey, { value: unknown; expiresAt: number }>()

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValueMap[K]> {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value as SettingValueMap[K]

  const row = await prisma.setting.findUnique({ where: { key } })
  const value = (row ? row.value : DEFAULT_SETTINGS[key]) as SettingValueMap[K]
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
  return value
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValueMap[K]): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as any },
    update: { value: value as any },
  })
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
}
