import {
  levelFromCategory,
  contractTypeFromCategory,
  descriptionFromPageText,
} from '../src/lib/afriqueemplois-category'

describe('levelFromCategory', () => {
  it.each([
    ['Niveau CEP', 'CEP'],
    ['Niveau BEPC', 'BEPC'],
    ['Niveau BAC', 'BAC'],
    ['Niveau BAC+2', 'BAC+2'],
    ['Niveau BAC+3', 'BAC+3'],
    ['Niveau BAC+4', 'BAC+4'],
    ['Niveau BAC+5', 'BAC+5'],
    ['Niveau Doctorat', 'Doctorat'],
  ])('"%s" → "%s"', (category, expected) => {
    expect(levelFromCategory(category)).toBe(expected)
  })

  it('tolère la casse et les espaces autour du "+"', () => {
    expect(levelFromCategory('niveau bac + 5')).toBe('BAC+5')
  })

  it.each(['Stages', 'Autres', 'International', 'Multiple', 'Non Précisé', 'Emplois'])(
    'catégorie non-niveau "%s" → undefined',
    (category) => {
      expect(levelFromCategory(category)).toBeUndefined()
    }
  )

  it('catégorie absente → undefined', () => {
    expect(levelFromCategory(undefined)).toBeUndefined()
  })
})

describe('contractTypeFromCategory', () => {
  it('"Stages" → "STAGE"', () => {
    expect(contractTypeFromCategory('Stages')).toBe('STAGE')
    expect(contractTypeFromCategory('stage')).toBe('STAGE')
  })

  it.each(['Niveau BAC+3', 'Autres', 'International', undefined])(
    '"%s" → undefined',
    (category) => {
      expect(contractTypeFromCategory(category)).toBeUndefined()
    }
  )
})

describe('descriptionFromPageText', () => {
  it('conserve un texte court tel quel', () => {
    expect(descriptionFromPageText('  Avis de recrutement d’un comptable  ')).toBe(
      'Avis de recrutement d’un comptable'
    )
  })

  it('borne les textes longs', () => {
    const long = 'a'.repeat(5000)
    const result = descriptionFromPageText(long)
    expect(result).toHaveLength(1200)
  })

  it('texte vide ou absent → undefined', () => {
    expect(descriptionFromPageText('   ')).toBeUndefined()
    expect(descriptionFromPageText('')).toBeUndefined()
    expect(descriptionFromPageText(undefined)).toBeUndefined()
  })
})
