import {
  createHash,
  normalizeForSimilarity,
  diceCoefficient,
  findNearDuplicate,
  NearDuplicateCandidate,
} from '../src/lib/deduplicator'
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

  it('la même offre (titre+org+date) dans deux pays différents produit des hash différents', () => {
    const d = new Date('2026-06-01T00:00:00.000Z')
    const a: RawJobOffer = { ...base, publishedAt: d, country: 'BF' }
    const b: RawJobOffer = { ...base, publishedAt: d, country: 'BJ' }
    expect(createHash(a)).not.toBe(createHash(b))
  })

  it('un country identique (ou absent des deux côtés) produit le même hash', () => {
    const d = new Date('2026-06-01T00:00:00.000Z')
    const a: RawJobOffer = { ...base, publishedAt: d }
    const b: RawJobOffer = { ...base, publishedAt: d, country: undefined }
    expect(createHash(a)).toBe(createHash(b))
  })
})

describe('normalizeForSimilarity', () => {
  it('retire accents, ponctuation et mentions H/F', () => {
    expect(normalizeForSimilarity('Comptable Général (H/F) !')).toBe(
      normalizeForSimilarity('comptable general')
    )
  })
})

describe('diceCoefficient', () => {
  it('deux chaînes identiques ont un score de 1', () => {
    expect(diceCoefficient('comptable', 'comptable')).toBe(1)
  })

  it('deux chaînes totalement différentes ont un score proche de 0', () => {
    expect(diceCoefficient('comptable', 'xyzqwk')).toBeLessThan(0.2)
  })

  it('une reformulation proche a un score élevé', () => {
    const score = diceCoefficient(
      normalizeForSimilarity('Comptable'),
      normalizeForSimilarity("Recrutement d'un Comptable (H/F)")
    )
    expect(score).toBeGreaterThan(0.4)
  })
})

describe('findNearDuplicate', () => {
  // Titres réalistes tels que reçus par findNearDuplicate en production :
  // déjà nettoyés par l'enrichissement Haiku (étape [4/6] du pipeline,
  // AVANT l'appel à findNearDuplicate en étape [4.5/6]) — donc de longueur
  // comparable d'une source à l'autre, contrairement au titre brut pré-IA
  // ("Recrutement d'un Comptable (H/F)").
  const existing: NearDuplicateCandidate = {
    id: 'existing-1',
    title: 'Comptable Principal',
    organization: 'Ministère des Finances',
    country: 'BF',
    deadline: new Date('2026-09-30T00:00:00.000Z'),
    publishedAt: new Date('2026-09-01T00:00:00.000Z'),
  }

  it('même pays/organisation/titre reformulé + même deadline → match', () => {
    const candidate = {
      title: 'Comptable principal (H/F)',
      organization: 'Ministere des Finances',
      country: 'BF',
      deadline: new Date('2026-09-30T18:00:00.000Z'),
    }
    expect(findNearDuplicate(candidate, [existing])).toBe(existing)
  })

  it('pays différent → pas de match malgré un titre identique', () => {
    const candidate = {
      title: 'Comptable Principal',
      organization: 'Ministère des Finances',
      country: 'BJ',
      deadline: existing.deadline,
    }
    expect(findNearDuplicate(candidate, [existing])).toBeUndefined()
  })

  it('titre trop dissimilaire → pas de match', () => {
    const candidate = {
      title: 'Chauffeur ambulancier',
      organization: 'Ministère des Finances',
      country: 'BF',
      deadline: existing.deadline,
    }
    expect(findNearDuplicate(candidate, [existing])).toBeUndefined()
  })

  it('deadlines différentes (les deux renseignées) → pas de match', () => {
    const candidate = {
      title: 'Comptable Principal',
      organization: 'Ministère des Finances',
      country: 'BF',
      deadline: new Date('2026-10-15T00:00:00.000Z'),
    }
    expect(findNearDuplicate(candidate, [existing])).toBeUndefined()
  })

  it('deadline absente d\'un côté → match basé sur titre+organisation+pays uniquement', () => {
    const candidate = {
      title: 'Comptable Principal',
      organization: 'Ministère des Finances',
      country: 'BF',
      deadline: undefined,
    }
    expect(findNearDuplicate(candidate, [existing])).toBe(existing)
  })

  it('deadline absente des deux côtés → match basé sur titre+organisation+pays uniquement', () => {
    const existingNoDeadline: NearDuplicateCandidate = { ...existing, deadline: null }
    const candidate = {
      title: 'Comptable Principal',
      organization: 'Ministère des Finances',
      country: 'BF',
      deadline: undefined,
    }
    expect(findNearDuplicate(candidate, [existingNoDeadline])).toBe(existingNoDeadline)
  })

  it('organisation vaut "Non précisé" d\'un côté → le critère organisation est ignoré', () => {
    const candidate = {
      title: 'Comptable Principal',
      organization: 'Non précisé',
      country: 'BF',
      deadline: existing.deadline,
    }
    expect(findNearDuplicate(candidate, [existing])).toBe(existing)
  })
})
