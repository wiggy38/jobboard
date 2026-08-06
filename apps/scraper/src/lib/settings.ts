import { PrismaClient } from '@prisma/client'
import { DEFAULT_SETTINGS, type SettingKey, type SettingValueMap } from '@tumaa/shared'

const prisma = new PrismaClient()

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
