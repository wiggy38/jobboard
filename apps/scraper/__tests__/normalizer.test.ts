import { normalize } from '../src/lib/normalizer'
import { RawJobOffer } from '@tumaa/shared'

const base: RawJobOffer = {
  title: 'Chargé de Communication',
  organization: 'ONG Test',
  city: 'ouaga',
  sourceUrl: 'https://example.com/job/1',
}

describe('normalizer — city', () => {
  it('"ouaga" → "Ouagadougou"', () => {
    expect(normalize({ ...base, city: 'ouaga' }).city).toBe('Ouagadougou')
  })

  it('"bobo" → "Bobo-Dioulasso"', () => {
    expect(normalize({ ...base, city: 'bobo' }).city).toBe('Bobo-Dioulasso')
  })

  it('ville inconnue reste telle quelle', () => {
    expect(normalize({ ...base, city: 'Kaya' }).city).toBe('Kaya')
  })
})

describe('normalizer — level', () => {
  it('"bac+3" → "BAC+3"', () => {
    expect(normalize({ ...base, level: 'bac+3' }).level).toBe('BAC+3')
  })

  it('"licence" → "BAC+3"', () => {
    expect(normalize({ ...base, level: 'licence' }).level).toBe('BAC+3')
  })

  it('"Licence" → "BAC+3"', () => {
    expect(normalize({ ...base, level: 'Licence' }).level).toBe('BAC+3')
  })

  it('niveau inconnu reste tel quel', () => {
    expect(normalize({ ...base, level: 'Bac Pro' }).level).toBe('Bac Pro')
  })

  it('niveau absent → "Non précisé"', () => {
    expect(normalize({ ...base }).level).toBe('Non précisé')
  })
})

describe('normalizer — contractType', () => {
  it('"cdi" → "CDI"', () => {
    expect(normalize({ ...base, contractType: 'cdi' }).contractType).toBe('CDI')
  })

  it('"CDI" → "CDI"', () => {
    expect(normalize({ ...base, contractType: 'CDI' }).contractType).toBe('CDI')
  })

  it('"Cdi" → "CDI"', () => {
    expect(normalize({ ...base, contractType: 'Cdi' }).contractType).toBe('CDI')
  })

  it('contrat inconnu reste tel quel', () => {
    expect(normalize({ ...base, contractType: 'inconnu' }).contractType).toBe('inconnu')
  })
})

describe('normalizer — valeurs inconnues sans erreur', () => {
  it('level et contractType inconnus ne lancent pas d\'exception', () => {
    expect(() =>
      normalize({ ...base, level: 'XYZ inconnu', contractType: 'BIZARRE' })
    ).not.toThrow()
  })

  it('le hash est toujours présent', () => {
    const result = normalize(base)
    expect(result.hash).toBeDefined()
    expect(result.hash).toHaveLength(64)
  })
})
