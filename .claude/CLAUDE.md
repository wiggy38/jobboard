# Tumaa — Instructions Claude Code


# TUMAA — Instructions Claude Code

## Architecture
Monorepo pnpm. Trois briques principales :
- `apps/bot/` → webhook WhatsApp, parser commandes, boucle pull
- `apps/scraper/` → 1 fichier = 1 source (lefaso.ts, anpe.ts...)
- `apps/api/` → REST interne, B2B, dashboard
- `packages/db/` → schéma Prisma
- `packages/matching/` → scoring offres/profils, pur TS sans dépendances
- `packages/shared/` → types partagés

## Convention multi-pays
- Champ `country String @default("BF")` présent sur **Profile, JobOffer, Source**
- `User.countries String[] @default(["BF"])` (tableau, pas un champ singulier) :
  - FREEMIUM/PREMIUM → un seul pays, inféré du préfixe téléphonique (ex. `["BF"]`)
  - ELITE → jusqu'à 3 pays choisis par l'utilisateur (ex. `["BF", "BJ", "CI"]`)
- Valeur = code ISO 3166-1 alpha-2 (ex. "BF", "CI", "SN", "BJ", "TG")
- Tout scraper doit renseigner `country` sur l'offre et la source qu'il crée
- Les requêtes de matching doivent filtrer sur `User.countries` pour éviter les croisements
  inter-pays — **fait dans `apps/bot/src/services/matching.ts`
  (`jobOffer.findMany` filtre `country: { in: countries }` en plus de `status`)**
- Sélection des pays ELITE (jusqu'à 3) : commande WhatsApp `PAYS`
  (`apps/bot/src/commands/handlers/pays.ts`, état de session `ELITE_COUNTRY_SELECT`), réservée
  aux `plan === 'ELITE'`, écrit `User.countries` puis auto-join `ChannelJoin` par pays choisi

## Règles métier CRITIQUES — ne jamais contourner
1. **Templates payants ≤ 3/utilisateur/mois** — vérifier `template_counters`
   AVANT chaque envoi, jamais après.
2. **Boucle pull = gratuite** — jamais de push marketing quotidien.
   Si TPQ baisse → améliorer le teaser, JAMAIS passer au push.
3. **Déduplication** → hash SHA-256 (titre + org + date) avant insertion.
4. **TTL offres** → sans date de clôture, expiration automatique après 30 jours.
5. Les templates WhatsApp payants sont plafonnés à 3/utilisateur/mois (compteur Redis)
6. Ne jamais envoyer de push marketing sans vérifier le compteur
7. Toute offre scrappée passe par le pipeline de déduplication avant insertion

## Commandes utiles
- `pnpm dev` → démarre tout en hot reload
- `pnpm test` → tests Jest
- `pnpm db:migrate` → migrations Prisma
- `pnpm scraper:run [source]` → teste un scraper isolé
- `docker compose up` → PostgreSQL + Redis en local
- `ngrok http 3000` → expose le webhook pour tests WhatsApp

## Ordre de dev
1. Schéma DB (Prisma) → 2. Scraper lefaso → 3. Webhook bot
→ 4. Matching engine → 5. Compteurs Redis → 6. Paiement → 7. Scouts B2B

## Stack
Node.js + TypeScript, Fastify, Prisma, PostgreSQL, Redis/Upstash,
BullMQ, Playwright, Cheerio, Meta Cloud API direct, Claude Haiku,
PayDunya, Hetzner VPS, Docker, GitHub Actions

## Architecture scraping — deux phases obligatoires
Chaque scraper suit un pipeline en deux phases strictement séparées :

**Phase 1 — Navigation (Playwright)**
- Gérer les cookies, paginations, protections anti-bot
- Récupérer le HTML brut de chaque fiche d'offre
- Ne jamais parser de champs dans cette phase

**Phase 2 — Extraction sémantique (Claude Haiku)**
- Envoyer le texte brut de la fiche à Haiku
- Haiku retourne un objet JSON normalisé :
  `{ titre, organisation, lieu, date_publication, date_cloture, description, salaire, url_source, pays }`
- `description` est une **ébauche courte** (≤ ~250 caractères — rôle + 1-2 points clés), pas le
  détail complet de l'annonce : l'utilisateur est redirigé vers `url_source` pour le reste (voir
  règle 2 sous "Règles Freemium/Premium/Elite"). Le champ `requirements` n'est plus extrait pour
  les offres scrapées.
- Dates normalisées en ISO 8601
- Intitulés de poste harmonisés

**Pourquoi cette architecture**
- Résistante aux refactors HTML des sites sources (pas de sélecteurs CSS fragiles)
- Un prompt générique couvre la majorité des sources sans code spécifique par site
- Coût négligeable : ~$0.000003 par fiche à l'échelle Haiku

**Validation obligatoire après extraction**
- Vérifier la présence des champs `titre`, `organisation`, `url_source`, `pays`
- Toute fiche avec champs critiques manquants → rejet silencieux (pas d'insertion, pas d'erreur fatale)
- Ne jamais insérer une fiche non validée en DB

## Documents de référence (dans /docs/)
- `docs/collecte_offres.md` → 9 sources, 7 challenges, 3 niveaux d'architecture
- `docs/freemium_v1.1.md` → modèle Freemium/Premium validé, Sponsored Alerts B2B, schéma Prisma (Employer, JobSubmission, JobOffer)
- `docs/stack_technique.md` → stack complète, ordre de dev, testabilité progressive
- `docs/subscription_flow_elite.md` → flow ELITE (3e tier, multi-pays), onboarding → paiement →
  auto-join canaux — checklist d'implémentation avec écarts documentés vs le code réel. Pages
  `/subscribe`, `/subscribe/countries`, `/subscribe/success` **codées en React/Vite dans
  `apps/web/src`** (pas SvelteKit — `apps/backoffice` en SvelteKit est un projet distinct pour
  admin/employer/offre). Backend dans `apps/api/src/subscribe.routes.ts`. Paiement réel via
  PayDunya (Checkout Invoice API, `apps/api/src/lib/paydunya.ts`) : `/api/subscribe/pay` crée la
  facture, `/api/subscribe/paydunya/webhook` confirme et active le plan. CinetPay abandonné au
  profit de PayDunya. Un endpoint `simulate-payment` dev-only reste disponible en complément pour
  les démos/tests hors prod. Webhook Meta API (join canal) reste à faire

## Modèle Freemium / Premium / Elite / Sponsored Alerts B2B (validé — voir `docs/freemium_v1.1.md` et `docs/subscription_flow_elite.md`)

### Tiers
| Tier | Prix | Villes | Secteurs | Types de contrat | Pays | Contacts | Alertes keywords | Historique |
|---|---|---|---|---|---|---|---|---|
| FREEMIUM | 0 FCFA | 1 | 1 | 1 | 1 (inféré) | Visibles | Non | 30j |
| PREMIUM | 650 FCFA/mois | 3 | 3 | 3 | 1 (inféré) | Visibles | Oui | 30j |
| ELITE | 1 250 FCFA/mois | Illimité | Illimité | Illimité | Jusqu'à 3 (choix user) | Visibles | Oui | 30j |

Limites villes/secteurs/contrats/pays et alertes stockées en cache par utilisateur sur
`Profile.maxCities/maxSectors/maxContractGroups/maxCountries/keywordAlertsEnabled` — source de
vérité : `packages/shared/src/planLimits.ts` (`PLAN_LIMITS`). Toute mutation de `User.plan` doit
appeler `applyPlanLimits()` (changement de plan) ou `planLimitsForCreate()` (création d'un
nouveau `User`+`Profile`) pour resynchroniser ces colonnes — ne jamais recalculer la limite
ad hoc à partir de `user.plan`.

### Règles Freemium/Premium/Elite — ne jamais contourner
1. **Contacts toujours visibles, quel que soit le plan** (y compris Freemium) — la
   différenciation Freemium se fait uniquement sur le nombre de villes/secteurs/contrats/pays
   suivis et sur les alertes mots-clés, jamais sur la visibilité des contacts.
2. **La source scrappée (sourceUrl/sourceName) est visible pour tous les plans** (y compris
   Freemium) — n'est plus un levier de conversion. Le contenu affiché à l'utilisateur pour une
   offre scrapée est une ébauche courte (`description` ≤ ~250 caractères, `requirements` toujours
   `null`, cf. règle scraping ci-dessous) ; le bouton "voir la source" redirige vers l'annonce
   complète sur le site d'origine, ce qui garantit de la visibilité au site source. Les offres
   B2B insérées manuellement (`Source.type === 'B2B_DIRECT'`, voir Sponsored Alerts) ne sont pas
   concernées : leur `description`/`requirements` sont saisis en clair par l'admin et affichés
   intégralement.
3. **DÉBLOQUER → lien direct Premium 650 FCFA**, jamais d'essai gratuit.
4. **Paiement hors plateforme** (PayDunya : Orange Money/Moov Money/carte bancaire) — pas d'UI admin sur le paiement, suivi via dashboard PayDunya.
5. **Retry paiement** : PENDING > 24h → relance manuelle ; commande `VÉRIFIER` resynchronise avec PayDunya ; relance à J-7 avant expiration d'abonnement.
6. **Canaux WhatsApp — 1 canal par pays** (décision actée) : `#Emploi-BF`, `#Emploi-BJ`, `#Emploi-TG`, `#Emploi-CI`. Auto-post 08:00, zéro modération manuelle, archivage auto après 15j, toujours un lien `wa.me` par message. Remplace l'ancienne architecture à 10 canaux thématiques (par ville/secteur, BF uniquement) décrite dans `docs/freemium_v1.1.md` — cette dernière est obsolète sur ce point précis, voir `docs/subscription_flow_elite.md`.
7. **ELITE multi-pays** : `User.countries` vide tant que l'utilisateur n'a pas choisi ses pays (1 à 3) ; auto-join Meta API + `ChannelJoin` créés uniquement après validation du choix, jamais avant paiement confirmé.

### Sponsored Alerts & Mise en avant (B2B) — résolu 2026-08-05
- **Décision** : la proposition de valeur n'est plus "débloquer les contacts" (obsolète depuis
  que les contacts sont visibles pour tous les plans, règle 1 ci-dessus) mais **visibilité /
  priorité d'exposition**, sans mécanique de relance manuelle. Un employeur paie pour que son
  offre soit vue plus / en premier, jamais pour donner accès à une info par ailleurs cachée.
- `isFeatured` et `isSponsored` boostent chacun le score de matching de +5
  (`packages/matching/src/scorer.ts::scoreFeatured/scoreSponsored`) — l'offre remonte dans les
  résultats `OFFRES`/`SUITE`.
- Le teaser quotidien posté sur le canal WhatsApp national (08:00, top 5 offres/pays/jour) trie
  par `isFeatured desc, isSponsored desc, publishedAt desc`
  (`apps/bot/src/services/channelTeaser.ts::buildChannelTeaser`) — une offre sponsorisée reste
  naturellement en tête tant qu'elle est dans le top 5, jusqu'à expiration de son TTL (30j) : pas
  besoin de bouton "Relancer" ni de compteur `sponsoredSentCount`/`sponsoredLastSentAt` (ces
  champs, décrits dans `docs/freemium_v1.1.md` v1, ne seront pas implémentés).
- Ingestion B2B = **point unique manuel** : Admin crée `JobSubmission` après paiement hors
  plateforme, valide format/complétude (jamais de deepdive anti-fraude), coche `isFeatured`/
  `isSponsored`, puis crée le `JobOffer` (`apps/api/src/routes/admin/submissions.ts`).
- **Déjà en place, rien à migrer** : `Employer`, `JobSubmission`, `JobOffer.isFeatured`/
  `isSponsored` existent dans `packages/db/prisma/schema.prisma` et sont câblés de bout en bout
  (admin → scoring → tri du canal).


## Règles métier critiques — Tumaa Bot

### Livraison des offres
- 1 offre = 1 message WhatsApp distinct
- Maximum 10 offres par session pull (paginer avec SUITE)
- Délai obligatoire de 800ms entre chaque message (anti-spam WhatsApp)
- L'offset de pagination est stocké dans Redis : session:{userId}:offset

### Format des messages
- Utilisateur Premium : message texte simple (preview_url activé) + lien web tokenisé vers l'offre
- Utilisateur Freemium : message interactif (type "interactive/cta_url") avec un bouton CTA
  cliquable "👉 Voir l'offre" pointant vers le lien web tokenisé — un bouton "reply" ne peut pas
  cohabiter avec un bouton CTA URL sur WhatsApp, donc l'abonnement se fait via la commande texte
  PREMIUM mentionnée dans le corps du message
- La source de l'offre (sourceUrl/sourceName) et les contacts (email/téléphone/adresse) sont
  toujours visibles quel que soit le plan, dans la réponse API de la page offre — `accessLevel`
  vaut toujours `'FULL'`. Le WhatsApp lui-même n'a jamais affiché le contenu complet (description
  courte + bouton source réservés à la page web tokenisée).
- Le parser de commandes gère DEUX types d'entrée :
  1. message.text.body (texte libre)
  2. message.interactive.button_reply.id (Reply Button tapé)

### Garde-fous budget WhatsApp
- TemplateCounter doit être vérifié AVANT tout envoi de template payant
- Plafond absolu : 3 templates payants par utilisateur par mois
- La vérification se fait en transaction DB atomique

### Fenêtre de service
- Clé Redis : user:{id}:window — TTL 86400 secondes
- Toute réponse dans la fenêtre = gratuit
- Un message entrant de l'utilisateur renouvelle la fenêtre

### Architecture
- Webhook Fastify : retourne HTTP 200 immédiatement
- Traitement asynchrone via setImmediate()
- Toutes les interactions Meta Cloud API passent par src/whatsapp/client.ts

## TODO — Matching

### Faux positifs secteur/métier (ex: "Chauffeur ambulancier" matché sur profil infirmier)
- **Constat (2026-08-05)** : le scorer (`packages/matching/src/scorer.ts`) ne regarde jamais le
  titre du poste — seulement ville/secteur/niveau/contrat — donc ville+secteur+confiance
  suffisent à dépasser le seuil de matching même si niveau et type de contrat sont à 0. Cas
  observé : une offre "Chauffeur ambulancier" (`sector="Santé"`, `level="Non précisé"`,
  `contractType="AUTRE"`) matche un profil cherchant villes Ouagadougou/Bobo-Dioulasso, secteurs
  Informatique/Santé, niveau Master, contrats CDI/CDD — alors qu'il s'agit d'un poste de
  conducteur, pas d'un poste médical.
- **Investigation** : `SECTOR_OPTIONS` (`packages/shared/src/profileOptions.ts`) contient déjà
  "Transport/Logistique", distinct de "Santé". Le prompt Haiku d'extraction
  (`apps/scraper/src/lib/ai-normalizer.ts`) infère `sector` en texte libre, sans contrainte à
  cette liste — contrairement au côté profil web, validé contre `SECTOR_OPTIONS` dans
  `apps/api/src/subscribe.routes.ts:150-151`. Ce cas précis ressemble donc à un bug de
  classification du secteur (organisme recruteur "Santé" plutôt que fonction réelle du poste),
  pas nécessairement à un manque de granularité du référentiel.
- **Décision reportée** — à trancher entre (ou combiner) :
  - **Option A — corriger le bug de classification du secteur** (rapide, cible ce cas précis) :
    contraindre l'extraction Haiku à choisir parmi les `SECTOR_OPTIONS` existantes (dont
    "Transport/Logistique"), avec une règle de classification par fonction réelle du poste
    plutôt que par domaine de l'organisme recruteur ; ajouter une validation whitelist côté
    offre (symétrique à celle déjà faite côté profil). Pas de migration Prisma, pas de nouvel
    écran web.
  - **Option B — champ « métier » dédié** (chantier plus large, cause plus profonde) : ajouter
    une 2e dimension de classification (métier/fonction) en plus du secteur, pour distinguer des
    rôles différents au sein d'un même secteur (ex: infirmier vs réceptionniste, tous deux
    "Santé"). Nécessite migration Prisma (`JobOffer.metier` + `Profile.metiers` + limites de
    plan), nouvelle étape dans le wizard web `apps/web/src/pages/SubscribeProfilePage.tsx`,
    extension du prompt Haiku (`ai-extractor.ts` + `ai-normalizer.ts`), backfill des offres
    existantes (pattern `packages/db/scripts/backfillPlanLimits.ts`). Résout aussi les cas de
    confusion intra-secteur, pas seulement les erreurs de classification inter-secteur.