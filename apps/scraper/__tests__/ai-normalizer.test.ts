import { parseAIResponse, parseAIResponseBatch } from '../src/lib/ai-normalizer'
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

describe('parseAIResponseBatch', () => {
  it('ré-aligne correctement par index, y compris hors ordre', () => {
    const text = '[{"index":2,"sector":"Santé"},{"index":0,"title":"Comptable"}]'
    const result = parseAIResponseBatch(text, 3, allowedSectors)

    expect(result.size).toBe(2)
    expect(result.get(0)).toEqual({ title: 'Comptable' })
    expect(result.get(2)).toEqual({ sector: 'Santé' })
    expect(result.has(1)).toBe(false) // offre non retournée par Haiku → fallback règle-based
  })

  it('index hors-bornes est ignoré sans crash', () => {
    const text = '[{"index":5,"title":"Hors bornes"},{"index":0,"title":"Valide"}]'
    const result = parseAIResponseBatch(text, 2, allowedSectors)

    expect(result.size).toBe(1)
    expect(result.get(0)).toEqual({ title: 'Valide' })
  })

  it('index dupliqué : le premier est gardé, le doublon est ignoré', () => {
    const text = '[{"index":0,"title":"Premier"},{"index":0,"title":"Doublon"}]'
    const result = parseAIResponseBatch(text, 1, allowedSectors)

    expect(result.size).toBe(1)
    expect(result.get(0)).toEqual({ title: 'Premier' })
  })

  it('élément sans champ index est ignoré', () => {
    const text = '[{"title":"Sans index"},{"index":1,"title":"Avec index"}]'
    const result = parseAIResponseBatch(text, 2, allowedSectors)

    expect(result.size).toBe(1)
    expect(result.get(1)).toEqual({ title: 'Avec index' })
  })

  it('tableau vide → Map vide (aucune offre du lot ne nécessitait de correction)', () => {
    expect(parseAIResponseBatch('[]', 5, allowedSectors).size).toBe(0)
  })

  it('retourne une Map vide si aucun JSON tableau trouvé', () => {
    expect(parseAIResponseBatch('pas de json ici', 3, allowedSectors).size).toBe(0)
  })

  it('retourne une Map vide si JSON malformé', () => {
    expect(parseAIResponseBatch('[{"index":0,"title":"Test"', 1, allowedSectors).size).toBe(0)
  })
})
