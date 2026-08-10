# Plan — Palier de déblocage ponctuel à 100 FCFA (web uniquement)

> Statut : plan à traiter plus tard, non implémenté. Rédigé le 2026-08-09.

## Contexte

Les notes de stratégie de croissance partagées pour Tumaa (boucle virale façon Instagram,
tracking de parrainage, programme d'ambassadeurs, phases de KPI) convergent vers un funnel de
prix à 4 étapes : Freemium (découverte gratuite) → **déblocage ponctuel à 100 FCFA** (payer une
fois pour accéder à une offre précise) → Premium 650 FCFA/mois → Elite 1250 FCFA/mois. La
justification énoncée : « Pourquoi payer 650 FCFA alors que je ne sais même pas si cette offre
m'intéresse ? » — un achat d'impulsion à 100 FCFA abaisse la barrière du premier paiement et sert
de tremplin naturel vers Premium une fois que l'utilisateur a débloqué plusieurs offres.

Aujourd'hui Tumaa ne connaît que FREEMIUM/PREMIUM/ELITE (`User.plan`). Un utilisateur Freemium
sur la page web tokenisée `/offre/[token]` (SvelteKit, `apps/backoffice`) voit un CTA verrouillé
(« Voir toutes les offres ») à la place du lien direct vers la source. Ce plan ajoute un
**paiement ponctuel par couple (utilisateur, offre)** qui débloque uniquement le lien source de
cette offre — sans modifier `User.plan` ni toucher au flow d'abonnement existant. Il ne doit
surtout pas devenir une 4e valeur de `UserPlan` : `PLAN_LIMITS`
(`packages/shared/src/planLimits.ts`) et toute la logique de matching/limites supposent un enum
fermé à 3 valeurs.

**Périmètre de ce plan : uniquement le point d'entrée web** (nouveau CTA sur la branche
verrouillée de `/offre/[token]`). La commande WhatsApp `VOIR N`
(`apps/bot/src/commands/handlers/voir.ts`) reste un stub et n'est **pas** modifiée par ce
chantier — elle pourra être branchée sur ce même flow de paiement dans un futur chantier séparé.

Le point d'entrée web renvoie vers PayDunya en suivant le pattern déjà utilisé pour les
abonnements (`apps/api/src/subscribe.routes.ts` + `apps/api/src/lib/paydunya.ts`) — aucune
nouvelle infrastructure de paiement n'est introduite, seulement un fichier de routes parallèle et
une extension de schéma.

**Remarque annexe (hors périmètre de cette implémentation, juste à signaler à l'équipe) :** deux
affirmations de CLAUDE.md sont obsolètes et mériteraient une correction dans un futur passage doc
— (1) l'« écart connu » selon lequel `offre.routes.ts` renverrait toujours `accessLevel: 'FULL'`
ne correspond plus au code (déjà corrigé, la branche dépend bien du plan aujourd'hui) ; (2)
`/offre/[token]` est en SvelteKit dans `apps/backoffice`, pas en React/Vite dans `apps/web` (seules
les pages `/subscribe*` sont dans `apps/web`).

## Modèle de données — `packages/db/prisma/schema.prisma`

Étendre le modèle `Payment` existant plutôt que d'en créer un nouveau, pour garder un seul
grand livre de paiements et ne rien casser côté `subscribe.routes.ts` (les nouvelles colonnes
restent nulles/par défaut pour les lignes existantes) :

```prisma
enum PaymentKind {
  SUBSCRIPTION
  MICRO_UNLOCK
}

model Payment {
  id        String          @id @default(uuid())
  userId    String
  user      User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  amount    Int
  provider  PaymentProvider
  reference String?
  status    PaymentStatus   @default(PENDING)

  kind          PaymentKind @default(SUBSCRIPTION)
  planPurchased UserPlan?          // désormais optionnel — null pour MICRO_UNLOCK
  durationDays  Int?               // désormais optionnel — null pour MICRO_UNLOCK

  jobOfferId String?
  jobOffer   JobOffer? @relation(fields: [jobOfferId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, status])
  @@index([userId, jobOfferId])
}
```

`jobOfferId` n'est **pas** `@unique` — plusieurs utilisateurs peuvent chacun payer pour débloquer
la même offre, l'unicité doit donc porter sur le couple `(userId, jobOfferId)`, pas sur l'offre
seule. Ajouter la relation inverse `payments Payment[]` sur `JobOffer`.

**Pas de nouvelle table de « grant ».** Réutiliser la valeur `'UNLOCKED'` déjà prévue dans le
champ `action` de `JobInteraction` (déjà documentée dans son commentaire, déjà couverte par
`@@unique([userId, jobId, action])`) comme enregistrement d'accès — un `upsert` au succès du
webhook sert à la fois de garde d'idempotence et d'événement analytique, pas besoin de table
séparée.

Migration purement additive/nullable (nouvel enum, nouvelles colonnes nullables, nouvelle FK
nullable + index) — pas de backfill, aucun risque sur les lignes `Payment` existantes. À exécuter
via `pnpm db:migrate` (vérifier le script exact dans `packages/db/package.json`).

## API — `apps/api`

**Nouveau fichier `apps/api/src/unlock.routes.ts`**, structuré comme `subscribe.routes.ts` :

- `const MICRO_UNLOCK_PRICE = 100` (constante en dur, même pattern que `PLAN_PRICING` dans
  `subscribe.routes.ts` — pas piloté par les settings ; à migrer vers `getSetting`/`SETTING_KEYS`
  seulement si le produit demande un jour un prix ajustable sans redeploy).
- Vérification du token : **réutiliser le format de token « offre » existant** `{userId,
  offerId}` (celui de `tokenService.ts`, `generateOfferToken`, déjà utilisé par `/offre/:jobId`),
  pas un nouveau type de token à `purpose`. Factoriser le helper `verifyOfferToken` existant hors
  de `offre.routes.ts` vers un `apps/api/src/lib/tokens.ts` partagé, importé par les deux fichiers
  de routes au lieu de dupliquer la vérification JWT une troisième fois.
- `POST /api/unlock/:jobId/pay` (body `{ t }`) :
  1. Vérifier le token, s'assurer que `payload.offerId === jobId` → `userId`.
  2. Récupérer l'offre ; 404 si absente/inactive.
  3. Récupérer `user.plan` — si différent de `FREEMIUM`, renvoyer `409 { error:
     'ALREADY_HAS_ACCESS' }` (un utilisateur payant n'a jamais besoin de ce flow).
  4. Vérifier l'existence d'un `JobInteraction{userId,jobId,action:'UNLOCKED'}` — si trouvé,
     renvoyer `{ ok:true, alreadyUnlocked:true }` (idempotent, pas de double facturation).
  5. Créer `Payment{userId, amount:100, provider:'PAYDUNYA', status:'PENDING',
     kind:'MICRO_UNLOCK', jobOfferId:jobId}`.
  6. `createInvoice({amount:100, description:"Déblocage d'une offre Tumaa",
     customData:{paymentId,userId,jobId,kind:'MICRO_UNLOCK'}, returnUrl:.../offre/{jobId}?t={t}&unlocked=1,
     cancelUrl:.../offre/{jobId}?t={t}, callbackUrl:.../api/unlock/paydunya/webhook})`.
  7. Stocker `invoice.token` dans `Payment.reference` ; renvoyer `{ ok:true, paymentUrl }`. En cas
     d'échec de création de la facture : marquer `Payment` `FAILED`, renvoyer 502 (même
     comportement que `subscribe.routes.ts`).
- `POST /api/unlock/paydunya/webhook` — même squelette de parsing/idempotence que
  `/api/subscribe/paydunya/webhook` (parser `body.token`/`body.data`, `confirmInvoice`, retrouver
  le `Payment` via `customData.paymentId` puis `reference` en repli, sortir tôt si déjà
  `SUCCESS`/`FAILED`). Sur `completed` : marquer `Payment` `SUCCESS`, faire un `upsert` de
  `JobInteraction` `UNLOCKED` pour `(payment.userId, payment.jobOfferId)`. Sinon : marquer
  `FAILED`.
- `POST /api/unlock/:jobId/simulate-payment` — dev-only (même garde `NODE_ENV !== 'production'`
  que l'existant), vérifie le token, crée directement un `Payment` `SUCCESS`, upsert
  `JobInteraction` `UNLOCKED` — sans appel PayDunya. Même principe que
  `/api/subscribe/simulate-payment`.

À enregistrer dans `apps/api/src/index.ts` aux côtés des routes déjà déclarées.

**Modifier `apps/api/src/offre.routes.ts`** — dans `GET /api/offre/:jobId`, étendre
`hasDirectSourceAccess` pour qu'il devienne vrai aussi lorsqu'un `JobInteraction` `'UNLOCKED'`
existe pour `(userId, jobId)` ; ne lancer cette requête supplémentaire que si `userId` est présent
et `plan === 'FREEMIUM'` (aucun coût de requête ajouté pour les utilisateurs payants ou
anonymes). Ajouter une troisième valeur `accessLevel` : `'UNLOCKED'` (distincte de `'FULL'`) pour
que le frontend distingue « a payé pour cette offre précise » de « a un plan payant » — nécessaire
car le texte d'incitation Premium de la branche verrouillée doit disparaître une fois l'offre
débloquée, alors qu'une incitation Premium plus légère peut rester pertinente ailleurs pour ces
utilisateurs Freemium-mais-débloqués.

## Frontend — `apps/backoffice/src/routes/offre/[token]/+page.svelte`

- `hasDirectSourceAccess` devient `$derived(accessLevel === 'FULL' || accessLevel === 'UNLOCKED')`.
- Ajouter une fonction `payToUnlock()` (pas en fire-and-forget, on a besoin du corps de la
  réponse) qui `POST`e sur `${data.apiBase}/api/unlock/${data.jobId}/pay?t=${data.jwt}`, puis soit
  recharge la page (si `alreadyUnlocked`), soit redirige vers `body.paymentUrl`.
- Dans la branche verrouillée `{:else}` existante (actuellement ~lignes 280-306), ajouter un
  bouton « 🔓 Débloquer cette offre — 100 FCFA » à côté du CTA « Voir toutes les offres » et du
  lien texte vers Premium (les deux restent — le repli gratuit et l'incitation à l'abonnement
  demeurent valides en parallèle du nouveau micro-paiement).
- Étendre le fichier de test existant
  `apps/backoffice/src/routes/offre/[token]/__tests__/offerPage.test.ts` avec un cas
  `accessLevel: 'UNLOCKED'` calqué sur le cas `'FULL'` actuel.

## Hors périmètre — bot WhatsApp

`apps/bot/src/commands/handlers/voir.ts` (commande `VOIR N`) reste inchangé, toujours au stade de
stub. Le brancher sur ce flow de paiement (résolution de N vers un `jobId`, envoi d'un CTA
interactif vers la page `/offre/[token]`) est laissé pour un chantier ultérieur.

## Vérification

- `apps/api` a `jest` configuré (`apps/api/package.json`, `scripts.test`) mais ne contient
  aujourd'hui aucun fichier de test — cette fonctionnalité devrait initier cette convention :
  ajouter `apps/api/src/__tests__/unlock.routes.test.ts` (pay/webhook/simulate-payment,
  idempotence sur une offre déjà débloquée) et étendre la couverture de la branche `accessLevel`
  à 3 valeurs dans `offre.routes.ts`.
- Lancer `pnpm test` (backoffice + nouveaux tests api) et `pnpm db:migrate` pour appliquer le
  changement de schéma en local.
- Test manuel de bout en bout en dev (`NODE_ENV !== 'production'`, sandbox PayDunya ou
  `simulate-payment`) :
  1. Un utilisateur Freemium ouvre `/offre/{jobId}?t=...` → voit le nouveau bouton 100 FCFA.
  2. Clic → facture créée → paiement sandbox complété → webhook déclenché → `Payment.status =
     SUCCESS`, `JobInteraction{action:'UNLOCKED'}` créé.
  3. Rechargement de la page → `accessLevel: 'UNLOCKED'` → lien source direct désormais visible,
     le texte d'incitation Premium a disparu.
  4. Re-clic sur une offre déjà débloquée → `alreadyUnlocked:true`, aucune ligne dupliquée.

## Fichiers critiques

- `packages/db/prisma/schema.prisma`
- `apps/api/src/unlock.routes.ts` (nouveau)
- `apps/api/src/lib/tokens.ts` (nouveau — factorisé depuis `offre.routes.ts`)
- `apps/api/src/offre.routes.ts`
- `apps/api/src/index.ts`
- `apps/backoffice/src/routes/offre/[token]/+page.svelte`
