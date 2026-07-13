/**
 * ai-extractor.ts
 *
 * Extraction sémantique unique (Phase 2) partagée par tous les scrapers "jobboard".
 * Chaque scraper (Phase 1) ne fait que la navigation et le nettoyage du texte
 * de la page de détail ; ce module envoie ce texte à Claude Haiku une seule
 * fois par offre et retourne les champs de contenu normalisés.
 *
 * Volontairement, seuls les champs de CONTENU sont demandés à Haiku (title,
 * organization, city, sector, level, contractType, description, requirements,
 * contacts, applicationUrl, dates, isSponsored, isFraudSuspect). Les champs
 * système/métier (id, hash, status, ttlDays, scoreConfidence, validated,
 * createdAt/updatedAt, fraudConfirmedAt) restent calculés par le pipeline
 * (pipeline.ts, normalizer.ts) — jamais par le LLM.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface HaikuExtraction {
  isJobOffer?: boolean
  isMultiOffer?: boolean
  offers?: HaikuExtraction[]
  title?: string
  organization?: string
  city?: string
  level?: string
  contractType?: string
  sector?: string
  description?: string
  requirements?: string
  deadline?: string        // texte brut, ex: "31/07/2025" ou "31 juillet 2025"
  publishedAt?: string     // texte brut, ex: "30/06/2026"
  contactEmail?: string
  contactPhone?: string
  contactAddress?: string
  applicationUrl?: string
  isSponsored?: boolean
  isFraudSuspect?: boolean
}

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic()
  return _client
}

const EXTRACTION_SYSTEM = `Tu es un extracteur d'offres d'emploi au Burkina Faso.
Lis le texte brut d'une page d'annonce et extrait les informations structurées en un seul passage.

FORMAT DE SORTIE : un objet JSON valide uniquement, sans texte autour, sans markdown, sans backticks.

ÉTAPE 0 — OBLIGATOIRE, à faire avant toute extraction :
Détermine si cette page est la fiche d'UNE offre d'emploi précise (un poste,
un recruteur, un lieu). Réponds par le champ "isJobOffer" (boolean).
Mets isJobOffer: false — et n'extrais AUCUN autre champ de contenu — si la
page est : un article informatif ou de conseil ("5 règles pour...", "Comment
réussir...", "astuces"), une page de contact/à propos/mentions légales, une
liste récapitulative d'entreprises qui recrutent ou d'offres de la semaine,
un sommaire/index d'offres, ou toute page qui n'est pas la fiche d'une offre
individuelle. Sinon, mets isJobOffer: true et poursuis l'extraction normale
des champs ci-dessous.

ÉTAPE 0bis — DÉTECTION MULTI-POSTES :
Certaines fiches annoncent PLUSIEURS postes distincts dans un seul article
(ex: "05 postes à pourvoir au sein d'une mutuelle nationale", un cabinet qui
recrute simultanément un comptable ET un chauffeur ET un gardien). Il s'agit
de postes différents (intitulés différents et/ou profils différents), PAS de
plusieurs postes identiques ouverts en plusieurs exemplaires (ex: "3 Agents
commerciaux" reste UNE offre avec un seul intitulé).
Si et seulement si la page décrit plusieurs postes distincts :
- Mets "isMultiOffer": true
- Mets "isJobOffer": true
- Ajoute un champ "offers" : un tableau d'objets, un par poste, chacun avec
  les mêmes champs que décrits ci-dessous (title, organization, city, sector,
  level, contractType, description, requirements, contactEmail,
  contactPhone, contactAddress, applicationUrl, deadline, publishedAt,
  isSponsored, isFraudSuspect).
- Les champs communs à toute l'annonce (organization, contactEmail,
  contactPhone, contactAddress, deadline, publishedAt, isSponsored) doivent
  être répétés à l'identique dans CHAQUE élément de "offers" — chaque poste
  doit rester exploitable isolément, sans dépendre des autres éléments du
  tableau.
- Ne remplis PAS les champs de contenu au niveau racine de l'objet dans ce
  cas (title, description, etc. au top-level sont ignorés si "offers" est
  présent) — seul le tableau "offers" est utilisé.
Si la page ne décrit qu'UN seul poste (le cas normal et le plus fréquent),
omets complètement "isMultiOffer" et "offers", et remplis les champs de
contenu directement à la racine comme d'habitude.

CHAMPS À EXTRAIRE (omets les champs absents ou inconnus, ne mets jamais de valeur approximative) :

- title : intitulé du poste, SANS préfixes de recrutement ("Avis de recrutement", "Recrutement de", "Offre d'emploi", "Recherche", "Appel à candidature"), SANS nombre de postes entre parenthèses, SANS référence de poste, SANS nom d'organisation/ville, SANS articles indéfinis ("un(e)", "des").
  Exemple : "Avis de recrutement pour le poste de Contrôleurs de travaux REF/2025-013" → "Contrôleurs de travaux"

- organization : nom officiel de l'organisation ou entreprise recruteuse. Cherche dans l'intro ("L'ONG XYZ recrute…"), la section contact ("Adressé à…", "Cabinet…") ou la signature de l'annonce. Ne jamais retourner un nom de site web comme organisation.

- city : ville du poste, orthographe officielle burkinabè (ex: "Ouaga" → "Ouagadougou", "Bobo" → "Bobo-Dioulasso"). Si plusieurs villes, prendre celle du "LIEU DU POSTE".

- sector : secteur d'activité concis, déduit du titre/missions/qualifications (ex: "Informatique", "Finance", "Comptabilité", "Santé", "Agriculture", "Éducation", "ONG/Humanitaire", "BTP/Construction", "Transport/Logistique", "Droit/Juridique", "Communication/Marketing", "Ressources Humaines", "Commerce/Vente").

- level : niveau(x) d'études requis, valeurs canoniques UNIQUEMENT : CEP, BEPC, BAC, BAC+2, BAC+3, BAC+4, BAC+5, Doctorat, Non précisé.
  Mapping : BTS/DUT/HND/DTS → BAC+2 ; Licence/Bachelor/L3 → BAC+3 ; Maîtrise/M1 → BAC+4 ; Master/M2/DESS/DEA/MBA/Ingénieur → BAC+5 ; Doctorat/PhD → Doctorat.
  Si plusieurs niveaux distincts sont acceptés, sépare par ", " (ex: "BAC+3, BAC+5"). Si plusieurs diplômes mappent vers le même niveau, ne le retourne qu'une fois.

- contractType : normalise vers CDI, CDD, STAGE, ALTERNANCE, FREELANCE, BENEVOLE ou AUTRE.

- description : missions, activités et responsabilités principales du poste, max 1200 caractères.

- requirements : compétences, diplômes, expérience, langues et conditions requises, max 1200 caractères.

- contactEmail : adresse email de dépôt de candidature.

- contactPhone : numéro de téléphone de contact, format +226 XX-XX-XX-XX si burkinabè.

- contactAddress : adresse physique et/ou indications de dépôt de dossier (cabinet, personne, lieu).

- applicationUrl : URL de candidature en ligne si mentionnée (sinon omets — ne jamais mettre l'URL de la page elle-même).

- deadline : date et heure limites de dépôt, au format ISO 8601 strict "YYYY-MM-DD" (ex: "2025-07-31"). Si seuls le jour et le mois sont connus, déduis l'année à partir du contexte de l'annonce. Si le jour exact n'est pas connu mais le mois/année oui, mets le 1er du mois.

- publishedAt : date de publication de l'annonce, au format ISO 8601 strict "YYYY-MM-DD" (ex: "2026-06-30"). Si le jour exact n'est pas connu mais le mois/année oui, mets le 1er du mois. Si aucune date n'est trouvable, omets le champ.

- isSponsored (boolean) : true uniquement si l'annonce indique explicitement être sponsorisée/premium/mise en avant, sinon false.

- isFraudSuspect (boolean) : true si l'annonce présente des signaux de fraude (demande de frais/paiement au candidat, coordonnées absentes ou suspectes, texte générique incohérent), sinon false. C'est un signal indicatif seulement — n'invente pas de certitude.

Ne retourne QUE ces champs de contenu. N'invente jamais un statut, un score de confiance, un identifiant ou une date de création/mise à jour : ces champs sont gérés par le système, pas par toi.
Si tu n'es pas sûr d'un champ, omets-le.`

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
}

/**
 * Parse une date en texte libre telle que retournée par Haiku
 * (formats numériques ou français), indépendamment du contexte.
 */
export function parseFlexibleDateText(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const cleaned = raw.trim()

  // Format ISO 8601 (celui demandé à Haiku désormais) — doit être testé avant
  // la branche DD/MM/YYYY ci-dessous, sinon "YYYY-MM-DD" est mal interprété
  // (le premier groupe à 4 chiffres serait pris pour un jour).
  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10) - 1
    const day = parseInt(isoMatch[3], 10)
    const d = new Date(year, month, day)
    if (!isNaN(d.getTime())) return d
  }

  const numMatch = cleaned.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (numMatch) {
    const day = parseInt(numMatch[1], 10)
    const month = parseInt(numMatch[2], 10) - 1
    const year = numMatch[3].length === 2 ? 2000 + parseInt(numMatch[3], 10) : parseInt(numMatch[3], 10)
    const d = new Date(year, month, day)
    if (!isNaN(d.getTime())) return d
  }

  const frMatch = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
  if (frMatch) {
    const month = FRENCH_MONTHS[frMatch[2].toLowerCase()]
    if (month !== undefined) {
      const d = new Date(parseInt(frMatch[3], 10), month, parseInt(frMatch[1], 10))
      if (!isNaN(d.getTime())) return d
    }
  }

  return undefined
}

async function callHaikuExtraction(pageText: string, fallbackTitle: string, scraperName: string): Promise<HaikuExtraction | undefined> {
  try {
    const client = getClient()
    // Tronquer : intro (contexte organisation + poste) + fin (contact + date limite).
    // Fenêtre large car les fiches multi-postes (ex: "05 postes à pourvoir")
    // listent leurs descriptions séquentiellement sur toute la page — une
    // fenêtre trop courte coupe les postes du milieu et empêche Haiku de
    // détecter isMultiOffer.
    const text = pageText.length <= 10_000
      ? pageText
      : `${pageText.slice(0, 7000)}\n...\n${pageText.slice(-3000)}`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      // Une fiche multi-postes (jusqu'à ~5 postes, description+requirements
      // 1200 car. chacun) peut dépasser 1024 tokens de sortie et couper le
      // JSON en plein milieu — d'où des rejets silencieux ou des offres
      // manquantes observés en prod sur les fiches groupées.
      max_tokens: 4096,
      // Déterminisme maximal : on veut que la même fiche produise la même
      // extraction (title/organization/publishedAt) d'un run à l'autre,
      // condition nécessaire à la stabilité du hash de dédup (voir
      // deduplicator.ts).
      temperature: 0,
      system: EXTRACTION_SYSTEM,
      messages: [{ role: 'user', content: `Titre connu : ${fallbackTitle}\n\nTexte de la page :\n${text}` }],
    })

    const firstBlock = message.content[0]
    if (firstBlock.type !== 'text') return undefined

    const raw = firstBlock.text
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1) return undefined

    return JSON.parse(raw.slice(start, end + 1)) as HaikuExtraction
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[${scraperName}] Haiku extraction failed: ${msg}`)
    return undefined
  }
}

/**
 * Envoie le texte nettoyé d'une page de détail à Haiku et retourne les champs
 * de contenu extraits. Ne plante jamais le pipeline : en cas d'échec API ou
 * de JSON invalide, retourne {} et le scraper garde son fallback règle-based.
 *
 * Si la page décrit plusieurs postes distincts, seul le premier est retourné
 * ici — utiliser extractOffersWithHaiku pour récupérer la fiche complète.
 */
export async function extractWithHaiku(pageText: string, fallbackTitle: string, scraperName: string): Promise<HaikuExtraction> {
  const parsed = await callHaikuExtraction(pageText, fallbackTitle, scraperName)
  if (!parsed) return {}
  if (parsed.isMultiOffer && Array.isArray(parsed.offers) && parsed.offers.length > 0) {
    return { isJobOffer: parsed.isJobOffer, ...parsed.offers[0] }
  }
  return parsed
}

/**
 * Variante multi-postes : envoie le texte d'une page de détail à Haiku et
 * retourne UNE offre par poste distinct décrit dans la page (cas des
 * annonces groupées, ex: "05 postes à pourvoir au sein d'une mutuelle").
 * Retourne un tableau vide si la page n'est pas une offre, et un tableau
 * d'un seul élément dans le cas normal (une page = une offre).
 */
export async function extractOffersWithHaiku(pageText: string, fallbackTitle: string, scraperName: string): Promise<HaikuExtraction[]> {
  const parsed = await callHaikuExtraction(pageText, fallbackTitle, scraperName)
  if (!parsed) return []
  if (parsed.isJobOffer === false) return []
  if (parsed.isMultiOffer && Array.isArray(parsed.offers) && parsed.offers.length > 0) {
    return parsed.offers.map(offer => ({ isJobOffer: true, ...offer }))
  }
  return [parsed]
}
