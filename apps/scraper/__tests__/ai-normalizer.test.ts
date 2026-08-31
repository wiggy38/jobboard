import { parseAIResponse } from '../src/lib/ai-normalizer'
import { SECTOR_OPTIONS } from '@tumaa/shared'

const allowedSectors = SECTOR_OPTIONS.map(o => o.value)

describe('parseAIResponse — sector', () => {
  it('secteur whitelisté est accepté', () => {
    const result = parseAIResponse('{"sector":"Transport/Logistique"}', allowedSectors)
    expect(result.sector).toBe('Transport/Logistique')
  })

  it('secteur halluciné hors liste blanche est rejeté', () => {
    const result = parseAIResponse('{"sector":"Santé Publique"}', allowedSectors)
    expect(result.sector).toBeUndefined()
  })

  it('secteur absent reste undefined', () => {
    const result = parseAIResponse('{"title":"Comptable"}', allowedSectors)
    expect(result.sector).toBeUndefined()
  })
})

describe('parseAIResponse — level', () => {
  it('niveau canonique valide est accepté', () => {
    const result = parseAIResponse('{"level":"BAC+5"}', allowedSectors)
    expect(result.level).toBe('BAC+5')
  })

  it('niveau non canonique est filtré', () => {
    const result = parseAIResponse('{"level":"Bac Pro"}', allowedSectors)
    expect(result.level).toBeUndefined()
  })

  it('niveaux dédoublonnés', () => {
    const result = parseAIResponse('{"level":"BAC+5, BAC+5"}', allowedSectors)
    expect(result.level).toBe('BAC+5')
  })
})

describe('parseAIResponse — contractType', () => {
  it('type de contrat valide est accepté', () => {
    const result = parseAIResponse('{"contractType":"CDI"}', allowedSectors)
    expect(result.contractType).toBe('CDI')
  })

  it('type de contrat invalide est rejeté', () => {
    const result = parseAIResponse('{"contractType":"VACATION"}', allowedSectors)
    expect(result.contractType).toBeUndefined()
  })
})

describe('parseAIResponse — JSON invalide', () => {
  it('retourne un objet vide si aucun JSON trouvé', () => {
    expect(parseAIResponse('pas de json ici', allowedSectors)).toEqual({})
  })

  it('retourne un objet vide si JSON malformé', () => {
    expect(parseAIResponse('{"sector": "Transport/Logistique"', allowedSectors)).toEqual({})
  })
})
