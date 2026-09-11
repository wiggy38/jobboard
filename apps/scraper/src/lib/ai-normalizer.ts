/**
 * ai-normalizer.ts
 *
 * Enrichissement IA des offres d'emploi brutes via Claude Haiku.
 *
 * Pourquoi l'IA ici ?
 *   Les scrapers récupèrent des données hétérogènes : un champ "level" peut
 *   contenir "BAC+5 / MASTER II / DESS / DEA" (4 diplômes équivalents écrits
 *   en texte libre), ou le secteur peut être absent mais déductible du titre.
 *   Une table de mapping statique ne peut pas couvrir toutes ces variantes.
 *   Haiku est rapide et bon marché pour ce type de tâche d'extraction/normalisation.
 *
 * Flux :
 *   RawJobOffer → prompt structuré → Haiku → JSON → AINormalizationResult
 *
 * Le résultat est ensuite fusionné avec la normalisation règle-based dans normalizer.ts.
 */

import Anthropic from '@anthropic-ai/sdk'
import { RawJobOffer } from '@tumaa/shared'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Valeurs canoniques acceptées pour le niveau d'étude.
 * Haiku est contraint à n'utiliser que ces chaînes.
 * @see AINormalizationResult.title for the job title cleaning rule
 */
export const CANONICAL_LEVELS = [
  'CEP',
  'BEPC',
  'BAC',
  'BAC+2',
  'BAC+3',
  'BAC+4',
  'BAC+5',
  'Doctorat',
  'Non précisé',
] as const

export type CanonicalLevel = (typeof CANONICAL_LEVELS)[number]

/**
 * Structure retournée par Haiku après normalisation.
 * Tous les champs sont optionnels : si Haiku n'est pas sûr d'un champ,
 * il retourne undefined et on garde la valeur règle-based.
 */
export interface AINormalizationResult {
  /**
   * Intitulé de poste nettoyé, sans préfixes de recrutement ni mentions d'organisation.
   * Exemple : "Recrutement d'un Chargé de Communication à l'ONG XYZ" → "Chargé de Communication"
   */
  title?: string
  /**
   * Niveau(x) d'étude normalisé(s).
   * Plusieurs niveaux sont séparés par une virgule et un espace.
   * Exemple : "BAC+3, BAC+5" (offre qui accepte licence ou master).
   * Si plusieurs diplômes mapent vers le même niveau canonique
   * (ex: MASTER II, DESS, DEA → tous BAC+5), le dédoublonnage est fait ici.
   */
  level?: string
  /**
   * Secteur d'activité inféré depuis le titre et/ou la description.
   * Exemples : "Informatique", "Santé", "ONG/Humanitaire", "Finance".
   */
  sector?: string
  /**
   * Type de contrat normalisé.
   * Valeurs : CDI | CDD | STAGE | ALTERNANCE | FREELANCE | BENEVOLE | AUTRE
   */
  contractType?: string
  /**
   * Ville principale standardisée (orthographe officielle burkinabè).
   * Exemple : "Ouaga" → "Ouagadougou".
   */
  city?: string
  /**
   * Nom de l'organisation recruteuse, déduit du contenu de la description
   * quand le scraper n'a pas pu l'extraire directement.
   * Exemples : intro "L'ONG XYZ recrute…", section contact, pied de page.
   */
  organization?: string
}

// ─── Prompt système ───────────────────────────────────────────────────────────

/**
 * Prompt système injecté dans chaque requête.
 * On définit strictement le rôle, le format de sortie attendu (JSON pur)
 * et les règles de mapping pour chaque champ.
 *
 * `sectorList` est construit à chaque appel depuis `allowedSectors` (lui-même
 * alimenté par le réglage backoffice `reference.sectors`, voir `normalizer.ts`)
 * plutôt que figé au chargement du module, pour que la liste éditable dans
 * `/admin/parametres` soit celle proposée à Haiku.
 */
function buildSystemPrompt(sectorList: string): string {
  return `Tu es un moteur de normalisation de données pour des offres d'emploi au Burkina Faso.

RÔLE : analyser les champs bruts d'une offre et retourner des valeurs normalisées.

FORMAT DE SORTIE : un objet JSON valide uniquement, sans texte autour, sans markdown.
Exemple : {"title":"Chargé de Communication","level":"BAC+5","sector":"Informatique","contractType":"CDI","city":"Ouagadougou"}

RÈGLES PAR CHAMP :

1. title — extrait uniquement l'intitulé du poste, sans :
   - Les préfixes de recrutement ("Avis de recrutement", "Recrutement de", "Offre d'emploi", "Recherche", "Appel à candidature", etc.)
   - Le nom de l'organisation, de la ville ou du pays
   - Les articles indéfinis de liaison ("un(e)", "un", "une", "des")
   Exemples :
   - "Recrutement d'un Chargé de Communication à l'ONG XYZ" → "Chargé de Communication"
   - "AVIS DE RECRUTEMENT : Directeur des Ressources Humaines" → "Directeur des Ressources Humaines"
   - "Recherche un(e) Ingénieur Informatique" → "Ingénieur Informatique"
   - "Offre d'emploi : Comptable Senior – Ouagadougou" → "Comptable Senior"
   Si le titre est déjà propre (aucun préfixe), retourne-le tel quel.

2. level — utilise UNIQUEMENT ces valeurs canoniques :
   CEP, BEPC, BAC, BAC+2, BAC+3, BAC+4, BAC+5, Doctorat, Non précisé

   Mapping des diplômes français/africains :
   - BTS, DUT, HND, DTS → BAC+2
   - Licence, Bachelor, L3 → BAC+3
   - Maîtrise, M1, BAC+4 → BAC+4
   - Master, Master II, M2, MASTER 2, DESS, DEA, MBA, Ingénieur, BAC+5 → BAC+5
   - Doctorat, PhD, Thèse → Doctorat

   Si PLUSIEURS niveaux différents sont mentionnés (ex: "BAC+3 ou BAC+5"),
   retourne-les séparés par ", " : "BAC+3, BAC+5"

   Si plusieurs diplômes mappent vers le MÊME niveau canonique
   (ex: "MASTER II / DESS / DEA" → tous BAC+5), retourne ce niveau UNE SEULE FOIS : "BAC+5"

   Si aucune information sur le niveau n'est trouvée, lit la description pour inférer le niveau le plus probable, cherche dans les parties qui détaillent les qualifications ou expériences requises, sinon retourne "Non précisé".

3. sector — UNIQUEMENT une valeur parmi cette liste fermée : ${sectorList}.
   Déduis-la depuis le titre et/ou la description en analysant la FONCTION RÉELLE DU POSTE
   (les tâches, les qualifications requises, le rôle principal), JAMAIS depuis le secteur
   d'activité de l'organisme recruteur.
   Exemple : "Chauffeur ambulancier" recruté par un hôpital → "Transport/Logistique" (le
   poste consiste à conduire), PAS "Santé" (secteur de l'employeur, pas du poste).

4. contractType — normalise vers : CDI, CDD, STAGE, ALTERNANCE, FREELANCE, BENEVOLE, AUTRE.
   Analyse les mentions dans le titre, la description ou les conditions de l'offre pour déterminer le type de contrat. Si aucune information n'est trouvée, retourne "AUTRE".

5. city — orthographe officielle de la ville principale au Burkina Faso.
   Exemples : Ouaga → Ouagadougou, Bobo → Bobo-Dioulasso

6. organization — nom officiel de l'organisation qui recrute.
   Cherche dans cet ordre :
   a) Intro de la description ("L'ONG XYZ recrute…", "La société ABC recherche…", "Le Ministère de… lance un appel…")
   b) Section contact/candidature ("Envoyer le dossier à : Nom Org", "Adressez votre CV à…")
   c) Pied de page ou signature de l'annonce
   Ne retourne ce champ QUE si tu trouves un nom d'organisation explicite et distinct
   du champ Organisation déjà fourni. Si l'organisation fournie semble correcte, omets ce champ.
   Ne jamais retourner le nom du site web source comme organisation.

Si tu n'es pas sûr d'un champ, omets-le du JSON (ne mets pas null).`
}

/**
 * Nombre d'offres regroupées par appel Haiku lors de la normalisation par lot
 * (voir `aiNormalizeOffers`). Choisi en haut de la fourchette 5-10 recommandée :
 * amortit le coût du prompt système sur un maximum d'offres par appel, tout en
 * restant dans le budget de `max_tokens` d'une réponse tableau.
 */
export const AI_NORMALIZE_BATCH_SIZE = 10

/**
 * Variante "tableau" du prompt système, utilisée par `aiNormalizeOffers` pour
 * traiter plusieurs offres en un seul appel Haiku. Mêmes règles par champ que
 * SYSTEM_PROMPT ; seul le format d'entrée/sortie change (liste indexée →
 * tableau JSON indexé), pour amortir le coût du prompt système sur N offres
 * au lieu d'un appel par offre.
 */
function buildSystemPromptBatch(sectorList: string): string {
  return `Tu es un moteur de normalisation de données pour des offres d'emploi au Burkina Faso.

RÔLE : analyser les champs bruts de PLUSIEURS offres (une liste, chacune précédée de "--- Offre index=N ---")
et retourner un tableau JSON de résultats normalisés, un objet par offre ayant nécessité une correction.

FORMAT DE SORTIE : un tableau JSON valide uniquement, sans texte autour, sans markdown.
Chaque objet du tableau DOIT porter un champ "index" (le même N que "--- Offre index=N ---" de l'offre concernée),
en plus des champs normalisés ci-dessous.
Exemple : [{"index":0,"title":"Chargé de Communication","level":"BAC+5","sector":"Informatique","contractType":"CDI","city":"Ouagadougou"},{"index":2,"sector":"Santé"}]
N'inclus PAS d'objet pour une offre qui ne nécessite aucune correction (base déjà correcte).
Si AUCUNE offre du lot ne nécessite de correction, retourne un tableau vide : []

RÈGLES PAR CHAMP (identiques pour chaque offre du lot) :

1. title — extrait uniquement l'intitulé du poste, sans :
   - Les préfixes de recrutement ("Avis de recrutement", "Recrutement de", "Offre d'emploi", "Recherche", "Appel à candidature", etc.)
   - Le nom de l'organisation, de la ville ou du pays
   - Les articles indéfinis de liaison ("un(e)", "un", "une", "des")
   Exemples :
   - "Recrutement d'un Chargé de Communication à l'ONG XYZ" → "Chargé de Communication"
   - "AVIS DE RECRUTEMENT : Directeur des Ressources Humaines" → "Directeur des Ressources Humaines"
   - "Recherche un(e) Ingénieur Informatique" → "Ingénieur Informatique"
   - "Offre d'emploi : Comptable Senior – Ouagadougou" → "Comptable Senior"
   Si le titre est déjà propre (aucun préfixe), omets ce champ pour cette offre.

2. level — utilise UNIQUEMENT ces valeurs canoniques :
   CEP, BEPC, BAC, BAC+2, BAC+3, BAC+4, BAC+5, Doctorat, Non précisé

   Mapping des diplômes français/africains :
   - BTS, DUT, HND, DTS → BAC+2
   - Licence, Bachelor, L3 → BAC+3
   - Maîtrise, M1, BAC+4 → BAC+4
   - Master, Master II, M2, MASTER 2, DESS, DEA, MBA, Ingénieur, BAC+5 → BAC+5
   - Doctorat, PhD, Thèse → Doctorat

   Si PLUSIEURS niveaux différents sont mentionnés (ex: "BAC+3 ou BAC+5"),
   retourne-les séparés par ", " : "BAC+3, BAC+5"

   Si plusieurs diplômes mappent vers le MÊME niveau canonique
   (ex: "MASTER II / DESS / DEA" → tous BAC+5), retourne ce niveau UNE SEULE FOIS : "BAC+5"

   Si aucune information sur le niveau n'est trouvée, lit la description pour inférer le niveau le plus probable, cherche dans les parties qui détaillent les qualifications ou expériences requises, sinon retourne "Non précisé".

3. sector — UNIQUEMENT une valeur parmi cette liste fermée : ${sectorList}.
   Déduis-la depuis le titre et/ou la description en analysant la FONCTION RÉELLE DU POSTE
   (les tâches, les qualifications requises, le rôle principal), JAMAIS depuis le secteur
   d'activité de l'organisme recruteur.
   Exemple : "Chauffeur ambulancier" recruté par un hôpital → "Transport/Logistique" (le
   poste consiste à conduire), PAS "Santé" (secteur de l'employeur, pas du poste).

4. contractType — normalise vers : CDI, CDD, STAGE, ALTERNANCE, FREELANCE, BENEVOLE, AUTRE.
   Analyse les mentions dans le titre, la description ou les conditions de l'offre pour déterminer le type de contrat. Si aucune information n'est trouvée, retourne "AUTRE".

5. city — orthographe officielle de la ville principale au Burkina Faso.
   Exemples : Ouaga → Ouagadougou, Bobo → Bobo-Dioulasso

6. organization — nom officiel de l'organisation qui recrute.
   Cherche dans cet ordre :
   a) Intro de la description ("L'ONG XYZ recrute…", "La société ABC recherche…", "Le Ministère de… lance un appel…")
   b) Section contact/candidature ("Envoyer le dossier à : Nom Org", "Adressez votre CV à…")
   c) Pied de page ou signature de l'annonce
   Ne retourne ce champ QUE si tu trouves un nom d'organisation explicite et distinct
   du champ Organisation déjà fourni. Si l'organisation fournie semble correcte, omets ce champ.
   Ne jamais retourner le nom du site web source comme organisation.

Si tu n'es pas sûr d'un champ pour une offre donnée, omets ce champ de son objet (ne mets pas null).
N'oublie JAMAIS le champ "index" : sans lui, la correction ne peut pas être ré-appliquée à la bonne offre.`
}

// ─── Client Anthropic ─────────────────────────────────────────────────────────

/**
 * Instance du client Anthropic, créée une seule fois (singleton).
 * La clé API est lue depuis ANTHROPIC_API_KEY dans l'environnement.
 * Si la variable n'est pas définie, les appels échoueront avec une erreur claire.
 */
let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic()
  }
  return _client
}

// ─── Construction du prompt utilisateur ──────────────────────────────────────

/**
 * Construit le message utilisateur envoyé à Haiku.
 *
 * On inclut uniquement les champs qui ont de la valeur :
 * envoyer des champs vides augmente les tokens inutilement.
 *
 * On limite la description à 500 caractères : au-delà, Haiku n'a plus
 * besoin de plus de contexte pour inférer le secteur, et on réduit le coût.
 */
function buildUserMessage(offer: RawJobOffer): string {
  const parts: string[] = [`Titre : ${offer.title}`, `Organisation : ${offer.organization}`]

  if (offer.city) parts.push(`Ville brute : ${offer.city}`)
  if (offer.level) parts.push(`Niveau brut : ${offer.level}`)
  if (offer.contractType) parts.push(`Contrat brut : ${offer.contractType}`)
  if (offer.sector) parts.push(`Secteur brut : ${offer.sector}`)

  // Envoyer début + fin de la description pour couvrir à la fois l'intro
  // (où l'organisation se présente souvent) et la section contact (en fin d'annonce).
  if (offer.description) {
    const desc = offer.description
    if (desc.length <= 600) {
      parts.push(`Description : ${desc}`)
    } else {
      parts.push(`Description (début) : ${desc.slice(0, 350)}`)
      parts.push(`Description (fin) : ${desc.slice(-250)}`)
    }
  }

  return parts.join('\n')
}

/**
 * Construit le message utilisateur envoyé à Haiku pour un batch d'offres.
 *
 * Reprend `buildUserMessage` par offre, préfixée par un en-tête
 * "--- Offre index=N ---" qui sert d'ancre à Haiku pour renvoyer le champ
 * "index" attendu par `parseAIResponseBatch`.
 */
function buildBatchUserMessage(offers: RawJobOffer[]): string {
  return offers.map((offer, index) => `--- Offre index=${index} ---\n${buildUserMessage(offer)}`).join('\n\n')
}

// ─── Parsing de la réponse JSON ───────────────────────────────────────────────

/**
 * Extrait et valide l'objet JSON retourné par Haiku.
 *
 * Haiku peut occasionnellement ajouter du texte autour du JSON malgré les
 * instructions ; on cherche donc le premier "{" et le dernier "}" pour
 * isoler le bloc JSON, puis on valide les valeurs level avec la liste blanche.
 *
 * Retourne un objet vide si le JSON est invalide ou absent.
 */
/**
 * Valide et extrait les champs normalisés d'un objet JSON déjà parsé.
 * Partagée entre `parseAIResponse` (un objet) et `parseAIResponseBatch`
 * (un tableau d'objets) pour ne jamais dupliquer les règles de whitelist.
 */
function validateFields(parsed: Record<string, unknown>, allowedSectors: readonly string[]): AINormalizationResult {
  const result: AINormalizationResult = {}

  // ── title : chaîne non vide ─────────────────────────────────────────────────
  if (typeof parsed.title === 'string' && parsed.title.trim().length > 0) {
    result.title = parsed.title.trim()
  }

  // ── level : valider chaque segment contre la liste blanche ──────────────────
  if (typeof parsed.level === 'string' && parsed.level.length > 0) {
    const segments = parsed.level
      .split(',')
      .map(s => s.trim())
      // Garder uniquement les valeurs canoniques reconnues
      .filter((s): s is CanonicalLevel => (CANONICAL_LEVELS as readonly string[]).includes(s))

    // Dédoublonnage : "BAC+5, BAC+5" → "BAC+5"
    const unique = [...new Set(segments)]
    if (unique.length > 0) result.level = unique.join(', ')
  }

  // ── sector : valider contre la liste blanche (SECTOR_OPTIONS / réglage backoffice) ──
  if (typeof parsed.sector === 'string' && allowedSectors.includes(parsed.sector.trim())) {
    result.sector = parsed.sector.trim()
  }

  // ── contractType : valider contre la liste des contrats connus ───────────────
  const validContracts = ['CDI', 'CDD', 'STAGE', 'ALTERNANCE', 'FREELANCE', 'BENEVOLE', 'AUTRE']
  if (typeof parsed.contractType === 'string' && validContracts.includes(parsed.contractType)) {
    result.contractType = parsed.contractType
  }

  // ── city : chaîne libre non vide ─────────────────────────────────────────────
  if (typeof parsed.city === 'string' && parsed.city.trim().length > 0) {
    result.city = parsed.city.trim()
  }

  // ── organization : chaîne non vide, longueur raisonnable ────────────────────
  if (
    typeof parsed.organization === 'string' &&
    parsed.organization.trim().length > 2 &&
    parsed.organization.trim().length < 200
  ) {
    result.organization = parsed.organization.trim()
  }

  return result
}

/**
 * Extrait et valide l'objet JSON retourné par Haiku.
 *
 * Haiku peut occasionnellement ajouter du texte autour du JSON malgré les
 * instructions ; on cherche donc le premier "{" et le dernier "}" pour
 * isoler le bloc JSON, puis on valide les valeurs level avec la liste blanche.
 *
 * Retourne un objet vide si le JSON est invalide ou absent.
 */
export function parseAIResponse(text: string, allowedSectors: readonly string[]): AINormalizationResult {
  // Isoler le bloc JSON dans la réponse brute
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return {}

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    // JSON malformé — on ignore silencieusement et le fallback règle-based s'applique
    return {}
  }

  return validateFields(parsed, allowedSectors)
}

/**
 * Extrait et valide un tableau JSON retourné par Haiku pour un batch d'offres.
 *
 * Chaque élément du tableau doit porter un champ `index` (position 0-based
 * dans le batch envoyé) pour se ré-aligner sur la bonne offre même si Haiku
 * omet un élément incertain ou change l'ordre de la réponse. Un élément dont
 * l'`index` est absent, hors-bornes ou dupliqué est ignoré silencieusement —
 * l'offre correspondante retombe sur le fallback règle-based, jamais
 * d'exception qui ferait échouer tout le batch.
 *
 * Retourne une Map vide si le JSON est invalide, absent, ou n'est pas un
 * tableau.
 */
export function parseAIResponseBatch(
  text: string,
  batchSize: number,
  allowedSectors: readonly string[]
): Map<number, AINormalizationResult> {
  const result = new Map<number, AINormalizationResult>()

  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1) return result

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return result
  }

  if (!Array.isArray(parsed)) return result

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const index = record.index
    if (typeof index !== 'number' || !Number.isInteger(index)) continue
    if (index < 0 || index >= batchSize) continue
    if (result.has(index)) continue // index dupliqué : on garde le premier, on ignore le doublon

    result.set(index, validateFields(record, allowedSectors))
  }

  return result
}

// ─── Fonction principale exportée ────────────────────────────────────────────

/**
 * Normalise une offre brute via Claude Haiku.
 *
 * @param offer           L'offre brute telle que sortie du scraper
 * @param allowedSectors  Liste blanche des secteurs acceptés (SECTOR_OPTIONS / réglage backoffice)
 * @returns      Un objet partiel avec les champs normalisés par l'IA.
 *               Les champs absents indiquent que l'IA n'a pas pu normaliser ;
 *               le fallback règle-based s'appliquera dans normalizer.ts.
 *
 * En cas d'erreur réseau ou API, la fonction retourne {} sans planter
 * le pipeline : la normalisation règle-based prend le relais.
 */
export async function aiNormalizeOffer(
  offer: RawJobOffer,
  allowedSectors: readonly string[]
): Promise<AINormalizationResult> {
  try {
    const client = getClient()

    const message = await client.messages.create({
      // Haiku : rapide, bon marché, suffisant pour extraction structurée
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      // cache_control sur le prompt système : identique à chaque appel. Note :
      // le minimum de préfixe cachable sur Haiku 4.5 est 4096 tokens ; ce
      // prompt (~900 tokens) est en dessous, donc aucun gain réel tant que le
      // prompt ne grandit pas — marqueur sans coût, prêt si le seuil bouge.
      system: [{ type: 'text', text: buildSystemPrompt(allowedSectors.join(', ')), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserMessage(offer) }],
    })

    // Extraire le texte de la première réponse content
    const firstBlock = message.content[0]
    if (firstBlock.type !== 'text') return {}

    return parseAIResponse(firstBlock.text, allowedSectors)
  } catch (err) {
    // Ne pas faire planter le pipeline si l'API est indisponible
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ai-normalizer] Haiku call failed, falling back to rule-based: ${msg}`)
    return {}
  }
}

/**
 * Normalise un lot d'offres (jusqu'à `AI_NORMALIZE_BATCH_SIZE`) en un seul
 * appel Haiku, au lieu d'un appel par offre.
 *
 * Pourquoi : le prompt système (~900 tokens) est répété intégralement à
 * chaque appel — regrouper N offres par appel amortit ce coût fixe sur N
 * offres au lieu d'une seule (voir CLAUDE.md, "Coûts Haiku — état des lieux").
 *
 * @param offers          Le lot d'offres brutes à normaliser (≤ AI_NORMALIZE_BATCH_SIZE
 *                        pour rester dans le budget de `max_tokens` ; le chunking en
 *                        lots de cette taille est fait par l'appelant, `normalizeWithAIBatch`)
 * @param allowedSectors  Liste blanche des secteurs acceptés (SECTOR_OPTIONS / réglage backoffice)
 * @returns      Une Map index → résultat normalisé. Une offre absente de la Map
 *               (non retournée par Haiku, ou dont l'index n'a pas pu être validé)
 *               retombe sur le fallback règle-based, exactement comme un `{}`
 *               de `aiNormalizeOffer` pour une offre isolée.
 *
 * En cas d'erreur réseau ou API, retourne une Map vide : toutes les offres du
 * lot retombent en règle-based, sans faire planter le pipeline.
 */
export async function aiNormalizeOffers(
  offers: RawJobOffer[],
  allowedSectors: readonly string[]
): Promise<Map<number, AINormalizationResult>> {
  if (offers.length === 0) return new Map()

  try {
    const client = getClient()

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      // Budget élargi par rapport à l'appel unitaire (256) : une réponse
      // tableau de ≤10 objets courts reste largement dans cette enveloppe,
      // alignée sur le budget déjà utilisé par ai-extractor.ts pour ses
      // réponses en tableau (extraction multi-offres par fiche).
      max_tokens: 4096,
      system: [{ type: 'text', text: buildSystemPromptBatch(allowedSectors.join(', ')), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildBatchUserMessage(offers) }],
    })

    const firstBlock = message.content[0]
    if (firstBlock.type !== 'text') return new Map()

    return parseAIResponseBatch(firstBlock.text, offers.length, allowedSectors)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ai-normalizer] Haiku batch call failed, falling back to rule-based: ${msg}`)
    return new Map()
  }
}

/**
 * Détermine si une offre bénéficierait d'un enrichissement IA.
 *
 * On évite d'appeler Haiku sur des offres déjà complètes et simples :
 * cela réduit la latence et le coût pour le cas nominal.
 *
 * Critères pour déclencher l'appel IA :
 * - Le secteur est absent, ou présent mais hors de la liste blanche (ex: mal
 *   classé par l'extracteur Phase 2 — cas où il a déduit le secteur de
 *   l'organisme recruteur plutôt que de la fonction réelle du poste)
 * - Le level brut contient des séparateurs (/, ou, et) → possiblement multi-niveaux
 * - Le level ou le contractType ne sont pas dans les listes canoniques connues
 */
// Valeurs que les scrapers mettent parfois quand l'organisation est inconnue
const GENERIC_ORG_PLACEHOLDERS = ['n/a', 'na', 'inconnu', 'unknown', '-', '?', 'non précisé', 'non renseigné', '']

export function needsAIEnrichment(offer: RawJobOffer, allowedSectors: readonly string[]): boolean {
  if (!offer.sector || !allowedSectors.includes(offer.sector)) return true

  // Organisation générique ou absente : Haiku doit l'inférer depuis la description
  const orgNormalized = offer.organization.trim().toLowerCase()
  if (GENERIC_ORG_PLACEHOLDERS.includes(orgNormalized)) return true

  const rawLevel = offer.level?.toLowerCase() ?? ''
  const multiLevelPattern = /[\/,]|\bou\b|\bet\b/
  if (multiLevelPattern.test(rawLevel)) return true

  // Sigles inconnus de la table de mapping statique
  const knownLevels = ['bac+2', 'bac+3', 'bac+4', 'bac+5', 'bts', 'licence', 'master', 'ingénieur', 'doctorat', 'bac', 'bepc']
  if (offer.level && !knownLevels.some(k => rawLevel.includes(k))) return true

  return false
}
