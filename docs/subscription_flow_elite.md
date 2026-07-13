# TUMAA — Flow Abonnement & Multi-Pays (ELITE)

**Architecture complète : Onboarding → Paiement → Auto-Join Canaux**

Version 1.0 — 2026

---

## Note d'intégration au projet réel

Ce document a été fourni comme spécification autonome ; il décrit une architecture de
référence (SvelteKit routes, handlers pseudo-code) qui ne correspond pas trait pour trait au
code déjà existant dans ce repo. Avant de coder depuis ce doc, tenir compte des écarts suivants :

- **Pas SvelteKit — React/Vite** : le flow `/subscribe` est implémenté dans le second projet web
  du monorepo, `apps/web` (React 19 + Vite + react-router-dom), et non dans `apps/web/app` (qui
  est bien du SvelteKit, mais réservé à l'admin/employer/`offre/[token]`). Pages réelles :
  `apps/web/src/pages/SubscribePage.tsx` (choix PREMIUM/ELITE), `SubscribeCountriesPage.tsx`
  (sélection pays ELITE), `SubscribeSuccessPage.tsx` (confirmation), routées dans
  `apps/web/src/main.tsx` sur `/subscribe`, `/subscribe/countries`, `/subscribe/success`. Client
  API dans `apps/web/src/lib/api.ts`.
- **Bot réel** : l'onboarding et les commandes existent déjà et n'utilisent pas de handlers
  `async function handleOnboarding(userPhone, input)` avec du texte libre — voir
  `apps/bot/src/commands/handlers/onboarding.ts` (listes interactives WhatsApp + état Redis via
  `apps/bot/src/session/state.ts`) et `apps/bot/src/commands/router.ts`. La commande `PREMIUM`
  est déjà routée vers `apps/bot/src/commands/handlers/premium.ts` (état `PREMIUM_CHOICE`) ; le
  choix ELITE doit s'intégrer dans ce même handler plutôt que dupliquer un flow parallèle.
- **Schéma Prisma réel** (`packages/db/prisma/schema.prisma`) utilise déjà `@default(uuid())` et
  des enums dédiés (`UserPlan`, `PaymentProvider`, `PaymentStatus`, `ContractType`...). Le
  schéma ci-dessous a été écrit indépendamment (cuid, `@db.Uuid`, `provider: String` libre) —
  **ne pas copier ces extraits Prisma tels quels**. Les champs réellement ajoutés au schéma sont :
  - `UserPlan.ELITE` (nouvelle valeur d'enum)
  - `User.countries String[] @default(["BF"])` (remplace l'ancien `User.country String`)
  - `model ChannelJoin` (userId, country, joinedAt)
- **Paiement CinetPay** : aucune intégration CinetPay réelle n'existe encore dans le code
  (recherche effectuée sur tout le repo — seules des mentions dans `.env.example` et la doc). Les
  extraits de webhook/route ci-dessous sont donc un plan d'implémentation, pas du code à brancher
  tel quel. Un endpoint de **simulation dev-only** existe en attendant :
  `POST /api/subscribe/simulate-payment` (`apps/api/src/subscribe.routes.ts`) crée un `Payment`
  `SUCCESS` fictif (`provider: 'CINETPAY'`, `reference: 'SIMULATED-...'`), active le plan, et
  renvoie l'URL de redirection — désactivé si `NODE_ENV === 'production'` (403
  `SIMULATION_DISABLED`). Le bouton "🧪 Simuler le paiement" n'apparaît dans `SubscribePage.tsx`
  qu'en dev (`VITE_ENABLE_PAYMENT_SIMULATION` ou `import.meta.env.DEV`).
- **Canaux WhatsApp — décision actée : 1 canal par pays** (`#Emploi-BF/BJ/TG/CI`). Cette
  architecture remplace les 10 canaux thématiques (par ville/secteur, BF uniquement) qui
  figuraient dans `docs/freemium_v1.1.md` — ce dernier a été mis à jour en conséquence (voir
  règle 6 dans `.claude/CLAUDE.md`).
- **Matching multi-pays — fait** : `apps/bot/src/services/matching.ts` filtre déjà
  `jobOffer.findMany` sur `country: { in: countries }`, et les deux appelants
  (`offres.ts`, `suite.ts`) passent `user.countries`. Le paragraphe ci-dessus dans les versions
  précédentes de ce doc était obsolète.
- **Sélection des pays — fait, en WhatsApp natif (pas de route SvelteKit)** : plutôt que
  `/subscribe/select-countries` (qui suppose un flow web non construit), la sélection est
  implémentée comme commande bot `PAYS` (`apps/bot/src/commands/handlers/pays.ts`), routée via
  l'état de session `ELITE_COUNTRY_SELECT` (`apps/bot/src/commands/router.ts`), sur le même
  principe de liste interactive multi-choix que les villes/secteurs de l'onboarding. Réservée aux
  utilisateurs `plan === 'ELITE'` ; écrit jusqu'à 3 codes dans `User.countries` puis appelle
  `joinNationalChannel` pour chacun. Le déclenchement automatique après paiement ELITE confirmé
  (`User.countries = []` → redirection) reste à faire tant que l'intégration CinetPay n'existe
  pas — en attendant, l'utilisateur ELITE tape `PAYS` lui-même à tout moment pour choisir/changer
  ses pays.

Le reste de ce document est conservé tel que fourni, comme référence de flow produit et de
check-list d'implémentation.

---

## Sommaire

1. Vue d'ensemble
2. Schéma Prisma (indicatif — voir écarts ci-dessus)
3. Flow utilisateur détaillé
4. Architecture technique
5. Routes SvelteKit (indicatif)
6. Logique bot WhatsApp (indicatif)
7. Webhook CinetPay (indicatif)
8. Meta API — auto-join canaux (indicatif)
9. Checklist implémentation

---

## Vue d'ensemble

### Tiers de subscription

| **Tier** | **Prix** | **Villes** | **Secteurs** | **Pays** | **Contacts** | **Keywords** |
|---|---|---|---|---|---|---|
| **FREEMIUM** | 0 FCFA | 1 | 1 | 1 (inféré) | Masqués | Non |
| **PREMIUM** | 650 FCFA/mois | 2-3 | 2 | 1 (inféré) | Visibles | Non |
| **ELITE** | 1 250 FCFA/mois | Illimité | Illimité | Jusqu'à 3 (choix user) | Visibles | Oui |

### Canaux WhatsApp (4 canaux nationaux)

```
#Emploi-BF  (Burkina Faso)       → wa.me/+226XXXXXXX
#Emploi-BJ  (Bénin)              → wa.me/+229XXXXXXX
#Emploi-TG  (Togo)               → wa.me/+228XXXXXXX
#Emploi-CI  (Côte d'Ivoire)      → wa.me/+225XXXXXXX
```

---

## Flow utilisateur détaillé

### Étape 1 — Onboarding bot (profil de base)

L'utilisateur choisit ville(s), secteur(s), niveau (déjà couvert par l'onboarding existant —
`apps/bot/src/commands/handlers/onboarding.ts`). Le pays est inféré du préfixe téléphonique et
stocké dans `User.countries` (tableau à un élément pour FREEMIUM/PREMIUM).

### Étape 2 — Bot propose canal (délai 10s, puis CTA Premium/Elite)

```
Bot détecte le pays depuis le téléphone : +22670000000 → BF

Bot envoie : "Profil créé ! Rejoins #Emploi-BF pour les teasers du matin"
  → bouton "Rejoindre #Emploi-BF" → auto-join Meta API → ChannelJoin { userId, country: "BF" }

10 sec plus tard, CTA Premium/Elite en DM :
  PREMIUM 650 FCFA : contacts visibles, 2-3 villes, 2 secteurs, historique 30j
  ELITE 1250 FCFA : illimité villes/secteurs, jusqu'à 3 pays, alertes mots-clés, résumé hebdo
```

### Étape 3 — Page d'abonnement (SvelteKit `/subscribe`)

Deux cartes : PREMIUM vs ELITE. Choix → redirection `/subscribe/payment?plan=PREMIUM|ELITE`.

### Étape 4 — Page de paiement

Choix du mode de paiement (Orange Money / Moov Money / Coris Money) → redirection CinetPay.

### Étape 5A — Callback paiement PREMIUM

```
Payment.status = SUCCESS
User.plan = PREMIUM, planStartAt = now, planEndAt = now + 30j
User.countries = [pays inféré]   → pas de choix, flow terminé
```

### Étape 5B — Callback paiement ELITE

```
Payment.status = SUCCESS
User.plan = ELITE, planStartAt = now, planEndAt = now + 30j
User.countries = []   → vide tant que non sélectionné
→ redirection /subscribe/select-countries?userId=XXX
```

### Étape 6 — Sélection des pays (ELITE uniquement)

L'utilisateur coche 1 à 3 pays parmi BF / BJ / TG / CI. Validation :

```
User.countries = ["BF", "BJ"]  (exemple)
Pour chaque pays : joinChannels(userId, country) + ChannelJoin.create({ userId, country })
```

### Étape 7 — Utilisation quotidienne

08:00, le bot poste dans les canaux (nationaux) de l'utilisateur. L'utilisateur tape `OFFRES`
pour recevoir les offres filtrées, avec contacts visibles (PREMIUM/ELITE) ou masqués (FREEMIUM).

---

## Architecture technique

```
Utilisateur
  ├─ Bot (Fastify)        → onboarding, CTA (10s), filtrage           apps/bot/
  ├─ Web (SvelteKit)       → /subscribe, /select-countries, /payment   apps/web/app/
  └─ Meta API              → gestion des canaux

PostgreSQL (Prisma)
  ├─ User (plan, countries)
  ├─ Profile (cities, sectors, keywords)
  ├─ Payment (status, plan, reference)
  └─ ChannelJoin (userId, country)

Webhooks / services externes
  ├─ CinetPay webhook  → Payment.status update
  ├─ Meta API          → join canaux
  └─ BullMQ jobs        → auto-post teasers 08:00
```

---

## Routes web réelles (React, `apps/web/src`)

Pas de SvelteKit ici — pages React routées via `react-router-dom` dans `apps/web/src/main.tsx` :

```
/subscribe              → SubscribePage.tsx        choix PREMIUM vs ELITE
                           (bouton "Simuler le paiement" en dev → POST /api/subscribe/simulate-payment)
/subscribe/countries    → SubscribeCountriesPage.tsx  choix pays (ELITE only) + liens d'invitation canaux
/subscribe/success      → SubscribeSuccessPage.tsx    confirmation, retour vers WhatsApp
```

Pas de page `/subscribe/payment` ni `/subscribe/callback` séparées : le paiement réel
(redirection CinetPay + webhook) reste à construire (voir Phase 3/6 de la checklist) ; en
attendant, `SubscribePage.tsx` saute directement à l'activation via l'endpoint de simulation.
Endpoints backend correspondants dans `apps/api/src/subscribe.routes.ts` :
`POST /api/subscribe/track`, `POST /api/subscribe/simulate-payment`,
`GET`/`POST /api/subscribe/countries`.

---

## Logique bot WhatsApp (indicatif)

Le principe : détecter le pays depuis le préfixe téléphonique (`+226` → BF, `+229` → BJ,
`+228` → TG, `+225` → CI), proposer le canal nnational correspondant après l'onboarding, puis
after 10s proposer le CTA Premium/Elite. À intégrer dans le handler `premium.ts` existant plutôt
que dans un nouveau fichier séparé, pour ne pas dupliquer la logique d'état déjà en place
(`session/state.ts`, `PREMIUM_CHOICE`).

---

## Webhook CinetPay (indicatif)

Recevoir la notification CinetPay → vérifier la signature → mettre à jour `Payment.status` →
si `SUCCESS` :
- **PREMIUM** : join automatique du pays inféré, confirmation WhatsApp.
- **ELITE** : `User.countries = []`, redirection utilisateur vers `/subscribe/select-countries`.

Si `REFUSED` : `Payment.status = FAILED`, message d'erreur avec lien de nouvelle tentative.

---

## Meta API — auto-join canaux (indicatif)

> **Écart avec le code réel** : `POST /{channelId}/subscribers` ci-dessous n'existe pas dans
> l'API Meta réelle. Le Cloud/Business API WhatsApp n'expose aucun endpoint pour abonner un
> utilisateur à un WhatsApp Channel côté serveur — seul le clic de l'utilisateur sur un lien
> d'invitation `https://wa.me/channel/<code>` dans son app WhatsApp le fait rejoindre. Le
> pseudo-code ci-dessous reste comme trace de l'intention produit ; l'implémentation réelle
> (`apps/bot/src/services/channels.ts` → `joinNationalChannel`) enregistre l'intention de join en
> DB (`ChannelJoin`, idempotent) puis envoie directement le lien d'invitation réel via un message
> `cta_url` (`sendInteractiveCtaUrl`), configuré par pays via l'env var
> `CHANNEL_INVITE_LINK_<PAYS>` (voir `apps/bot/.env.example`). Le bot ne peut donc jamais savoir
> avec certitude que l'utilisateur a effectivement rejoint le canal — seulement que le lien lui a
> été envoyé.

```
joinChannels(userId, userPhone, countries: string[])
  pour chaque pays : POST /{channelId}/subscribers { contact: userPhone }
  en cas d'échec : log + fallback lien manuel wa.me, ne jamais bloquer le flow
```

### Fallback si auto-join échoue

```
"Auto-join échoué. Rejoins manuellement : https://wa.me/+226XXXXXXX
puis sélectionne #Emploi-BF"
```

Dans le code réel, ce fallback texte n'est plus un cas d'exception mais **le chemin normal** :
`joinNationalChannel` envoie systématiquement un `cta_url` pointant vers le lien d'invitation, et
ne retombe sur un message texte que si l'envoi du `cta_url` échoue lui-même ou si aucun lien n'est
configuré pour le pays.

### Expiration abonnement

Job cron quotidien : `planEndAt < now()` → downgrade FREEMIUM, retrait des canaux payants,
relance "Votre abonnement expire demain".

---

## Checklist implémentation

### Phase 1 — Database & types
- [x] Enum `UserPlan.ELITE` ajouté
- [x] `User.countries String[]` (remplace `User.country`)
- [x] Table `ChannelJoin` (userId, country)
- [ ] Migration Prisma : `pnpm db:migrate dev --name add_elite_countries`
- [x] `apps/bot/src/services/matching.ts` filtre déjà sur `country: { in: user.countries }`

### Phase 2 — Pages web (React, `apps/web/src`, pas SvelteKit)
- [x] `/subscribe` (choix PREMIUM vs ELITE) — `SubscribePage.tsx`
- [ ] `/subscribe/payment` — pas de page dédiée ; en attendant CinetPay, `/subscribe` déclenche
      directement `simulate-payment` en dev
- [x] `/subscribe/countries` (ELITE only) — `SubscribeCountriesPage.tsx`, en plus de la commande
      bot `PAYS` (voir Phase 4) : les deux chemins coexistent (web après paiement, bot à tout
      moment)
- [x] `/subscribe/success` — `SubscribeSuccessPage.tsx` (remplace `/subscribe/callback`)

### Phase 3 — Backend routes
- [ ] POST initiation paiement CinetPay
- [x] `POST /api/subscribe/simulate-payment` — stub dev-only (403 en production), crée un
      `Payment` SUCCESS fictif et active le plan, en attendant l'intégration CinetPay réelle
- [x] `POST /api/subscribe/track` — tracking clic PREMIUM/ELITE
- [x] Sélection des pays (ELITE) — `GET`/`POST /api/subscribe/countries` (web) **et** commande
      WhatsApp `PAYS` (bot) ; les deux écrivent `User.countries` + `ChannelJoin`
- [ ] Webhook CinetPay

### Phase 4 — Bot
- [x] Détection pays depuis préfixe téléphonique
- [x] Proposition canal national après onboarding
- [x] CTA Premium/Elite après 10s (dans `premium.ts`)
- [x] Bouton "Rejoindre #Emploi-{country}" (`joinChannel.ts`, rejoint désormais tous les pays de `User.countries`)
- [x] Commande `PAYS` (`pays.ts`) : liste interactive multi-choix (max 3), réservée ELITE,
      écrit `User.countries` + auto-join `ChannelJoin` par pays sélectionné

### Phase 5 — Meta API
- [x] `joinChannels(userId, countries)` — pas d'auth/API Meta possible pour ça (aucun endpoint
      d'auto-join côté serveur, voir écart ci-dessus) ; implémenté comme envoi du lien
      d'invitation réel (`joinNationalChannel`, `CHANNEL_INVITE_LINK_<PAYS>`)
- [ ] `postToChannel(channelId, message)` — reste à faire pour l'auto-post 08:00 (Phase 7)

### Phase 6 — CinetPay
- [ ] Compte + credentials CinetPay
- [ ] `initiateCinetPayPayment()`
- [ ] Vérification signature webhook

### Phase 7 — Tests E2E
- [ ] Onboarding → teaser → CTA Premium/Elite
- [ ] PREMIUM → auto-join 1 pays
- [ ] ELITE → select-countries → auto-join jusqu'à 3 pays
- [ ] Teasers reçus le matin dans les bons canaux

### Phase 8 — Production
- [ ] Env vars (META_TOKEN, CINETPAY_API, CHANNEL_IDS par pays...)
- [ ] Rate limiting sur le webhook CinetPay
- [ ] Logging erreurs / monitoring

---

## Liens utiles

- [Meta WhatsApp API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [CinetPay API Docs](https://cinetpay.com/en/developers)
- [Prisma ORM](https://www.prisma.io/docs/)
- [SvelteKit Docs](https://kit.svelte.dev/)
