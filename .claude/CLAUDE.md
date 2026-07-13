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
CinetPay/PayDunya, Hetzner VPS, Docker, GitHub Actions

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
  `apps/web/src`** (pas SvelteKit — `apps/web/app` en SvelteKit est un projet distinct pour
  admin/employer/offre). Backend dans `apps/api/src/subscribe.routes.ts`. CinetPay réel et
  webhook Meta API restent à faire ; un endpoint `simulate-payment` dev-only fait le pont

## Modèle Freemium / Premium / Elite / Sponsored Alerts B2B (validé — voir `docs/freemium_v1.1.md` et `docs/subscription_flow_elite.md`)

### Tiers
| Tier | Prix | Villes | Secteurs | Pays | Contacts | Alertes keywords | Historique | Offres complètes gratuites/semaine |
|---|---|---|---|---|---|---|---|---|
| FREEMIUM | 0 FCFA | 1 | 1 | 1 (inféré) | Masqués | Non | 7j | 0 |
| PREMIUM | 650 FCFA/mois | 3 | 3 | 1 (inféré) | Visibles | Oui | 30j | N/A |
| ELITE | 1 250 FCFA/mois | Illimité | Illimité | Jusqu'à 3 (choix user) | Visibles | Oui | 30j | N/A |

### Règles Freemium/Premium/Elite — ne jamais contourner
1. **0 offre complète gratuite/semaine pour Freemium** — friction maximale = levier de conversion, ne jamais assouplir sans décision produit explicite.
2. **Contacts toujours masqués pour Freemium**, sauf offre Sponsored Alert (payée par l'employeur).
3. **DÉBLOQUER → lien direct Premium 650 FCFA**, jamais d'essai gratuit.
4. **Paiement hors plateforme** (CinetPay/Orange Money/Moov Money) — pas d'UI admin sur le paiement, suivi via dashboard CinetPay.
5. **Retry paiement** : PENDING > 24h → relance manuelle ; commande `VÉRIFIER` resynchronise avec CinetPay ; relance à J-7 avant expiration d'abonnement.
6. **Canaux WhatsApp — 1 canal par pays** (décision actée) : `#Emploi-BF`, `#Emploi-BJ`, `#Emploi-TG`, `#Emploi-CI`. Auto-post 08:00, zéro modération manuelle, archivage auto après 15j, toujours un lien `wa.me` par message. Remplace l'ancienne architecture à 10 canaux thématiques (par ville/secteur, BF uniquement) décrite dans `docs/freemium_v1.1.md` — cette dernière est obsolète sur ce point précis, voir `docs/subscription_flow_elite.md`.
7. **ELITE multi-pays** : `User.countries` vide tant que l'utilisateur n'a pas choisi ses pays (1 à 3) ; auto-join Meta API + `ChannelJoin` créés uniquement après validation du choix, jamais avant paiement confirmé.

### Sponsored Alerts & Mise en avant (B2B)
- Un employeur paie Tumaa pour que son offre soit vue en entier par les Freemium (contacts visibles), normalement masqués.
- Ingestion B2B = **point unique manuel** : Admin crée `JobSubmission` après paiement hors plateforme, valide format/complétude (jamais de deepdive anti-fraude), puis crée le `JobOffer`.
- Options par offre : `isFeatured` (priorité dans les résultats matching) et `isSponsored` (éligible aux relances Sponsored Alert).
- Chaque relance Sponsored Alert incrémente `JobOffer.sponsoredSentCount` et met à jour `sponsoredLastSentAt` — l'employeur peut relancer plusieurs fois (J1, J3, J5...).
- Champs Prisma à prévoir : `Employer`, `JobSubmission.isFeatured/isSponsored/employerId`, `JobOffer.isFeatured/isSponsored/sponsoredSentCount/sponsoredLastSentAt/employerId`.


## Règles métier critiques — Tumaa Bot

### Livraison des offres
- 1 offre = 1 message WhatsApp distinct
- Maximum 5 offres par session pull (paginer avec SUITE)
- Délai obligatoire de 800ms entre chaque message (anti-spam WhatsApp)
- L'offset de pagination est stocké dans Redis : session:{userId}:offset

### Format des messages
- Utilisateur Premium : message texte simple (preview_url activé) + lien web tokenisé vers l'offre
- Utilisateur Freemium : message interactif (type "interactive/cta_url") avec un bouton CTA
  cliquable "👉 Voir l'offre" pointant vers le lien web tokenisé — un bouton "reply" ne peut pas
  cohabiter avec un bouton CTA URL sur WhatsApp, donc l'abonnement se fait via la commande texte
  PREMIUM mentionnée dans le corps du message
- La source de l'offre (sourceUrl/sourceName) n'est jamais exposée aux Freemium, ni dans le
  message WhatsApp ni dans la réponse API de la page offre (accessLevel PREVIEW) — uniquement
  en accessLevel FULL
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