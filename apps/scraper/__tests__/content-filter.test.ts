import { isLikelyNotJobOffer } from '../src/lib/content-filter'

describe('isLikelyNotJobOffer', () => {
  it('rejette une page de contact', () => {
    expect(isLikelyNotJobOffer('Contactez-nous', 'https://emploi.lefaso.net/Contactez-nous.html')).toBe(true)
  })

  it('rejette une page agrégat "entreprises qui recrutent"', () => {
    expect(
      isLikelyNotJobOffer(
        'Les entreprises qui recrutent en ce moment',
        'https://emploi.lefaso.net/Les-entreprises-qui-recrutent-en-ce-moment.html'
      )
    ).toBe(true)
  })

  it('rejette un listicle de conseils', () => {
    expect(isLikelyNotJobOffer('5 règles pour bien gérer son temps', 'https://lefaso.net/article-conseils.html')).toBe(true)
  })

  it('rejette un article "Comment réussir..." (conseil carrière)', () => {
    expect(
      isLikelyNotJobOffer(
        'Comment réussir son entretien d’embauche ?',
        'https://emploi.lefaso.net/Comment-reussir-son-entretien-d-embauche.html'
      )
    ).toBe(true)
  })

  it('accepte une vraie offre d\'emploi', () => {
    expect(
      isLikelyNotJobOffer('Contrôleurs de travaux', 'https://emploi.lefaso.net/controleurs-de-travaux.html')
    ).toBe(false)
  })

  it('accepte une offre dont le titre commence par un nombre', () => {
    expect(
      isLikelyNotJobOffer('50 Agents commerciaux recherchés', 'https://emploi.lefaso.net/50-agents-commerciaux.html')
    ).toBe(false)
    expect(
      isLikelyNotJobOffer('3 Comptables confirmés', 'https://emploi.lefaso.net/3-comptables-confirmes.html')
    ).toBe(false)
  })
})
