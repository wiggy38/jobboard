import { createHash } from '../src/lib/deduplicator'
import { RawJobOffer } from '@tumaa/shared'

const base: RawJobOffer = {
  title: 'Développeur Full Stack',
  organization: 'Tech Burkina SARL',
  city: 'Ouagadougou',
  sourceUrl: 'https://lefaso.net/job/1',
}

describe('createHash', () => {
  it('deux offres identiques produisent le même hash', () => {
    const d = new Date('2026-06-01T00:00:00.000Z')
    const a: RawJobOffer = { ...base, publishedAt: d }
    const b: RawJobOffer = { ...base, publishedAt: d }
    expect(createHash(a)).toBe(createHash(b))
  })

  it('deux offres avec titres différents produisent des hash différents', () => {
    const a: RawJobOffer = { ...base, title: 'Développeur Backend' }
    const b: RawJobOffer = { ...base, title: 'Développeur Frontend' }
    expect(createHash(a)).not.toBe(createHash(b))
  })

  it('une offre sans publishedAt produit un hash stable', () => {
    const a: RawJobOffer = { ...base }
    const b: RawJobOffer = { ...base }
    const hash1 = createHash(a)
    const hash2 = createHash(b)
    expect(hash1).toBe(hash2)
    expect(typeof hash1).toBe('string')
    expect(hash1).toHaveLength(64) // SHA-256 hex = 64 chars
  })

  it('variations de casse et d\'espacement (issues de Haiku) produisent le même hash', () => {
    const d = new Date('2026-06-01T00:00:00.000Z')
    const a: RawJobOffer = { ...base, title: '  Développeur   Full Stack  ', organization: 'tech burkina sarl', publishedAt: d }
    const b: RawJobOffer = { ...base, title: 'développeur full stack', organization: 'Tech Burkina SARL', publishedAt: d }
    expect(createHash(a)).toBe(createHash(b))
  })

  it('deux dates identiques à l\'heure près (même jour) produisent le même hash', () => {
    const morning = new Date('2026-06-01T06:00:00.000Z')
    const evening = new Date('2026-06-01T22:00:00.000Z')
    const a: RawJobOffer = { ...base, publishedAt: morning }
    const b: RawJobOffer = { ...base, publishedAt: evening }
    expect(createHash(a)).toBe(createHash(b))
  })

  it('deux dates sur des jours différents produisent des hash différents', () => {
    const a: RawJobOffer = { ...base, publishedAt: new Date('2026-06-01T00:00:00.000Z') }
    const b: RawJobOffer = { ...base, publishedAt: new Date('2026-06-02T00:00:00.000Z') }
    expect(createHash(a)).not.toBe(createHash(b))
  })
})
