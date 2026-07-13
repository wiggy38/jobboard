# TUMAA — Modèle Freemium, Premium & Sponsored Alerts B2B

**Document de référence — Toutes décisions validées**

> **Mise à jour** : un 3e tier **ELITE** (1 250 FCFA/mois, multi-pays jusqu'à 3 pays) a été validé
> en complément de ce document. Le flow complet (onboarding, paiement, sélection des pays,
> auto-join canaux) est décrit dans `docs/subscription_flow_elite.md`. Les règles Freemium/Premium
> et B2B Sponsored Alerts ci-dessous restent valides telles quelles ; seule la table des tiers et
> l'architecture des canaux évoluent (voir la note sur les canaux nationaux dans le nouveau doc).

---

## MODÈLE FREEMIUM & PREMIUM & ELITE

### Tier Structure

| **Tier** | **Prix** | **Villes** | **Secteurs** | **Pays** | **Contacts** | **Alertes keywords** | **Historique** | **Offres complètes gratuites/semaine** |
|---|---|---|---|---|---|---|---|---|
| **FREEMIUM** | 0 FCFA | 1 | 1 | 1 (inféré) | Masqués | Non | 7j | **0** |
| **PREMIUM** | 650 FCFA/mois | 3 | 3 | 1 (inféré) | Visibles | Oui | 30j | N/A |
| **ELITE** | 1 250 FCFA/mois | Illimité | Illimité | Jusqu'à 3 (choix user) | Visibles | Oui | 30j | N/A |

### Stratégie Générale

**Option B (Revenus)** — Friction élevée, conversion prioritaire sur croissance rapide.

- **Objectif** : 10-15k users dans 6 mois avec 15%+ conversion Premium
- **Revenu estimé** : ~1,5M FCFA/mois à 10k users inscrits (scénario conservateur)
- **Coût WhatsApp** : ~600k FCFA/mois (scénario réaliste : pull + 3 templates/user/mois)

---

## STRATÉGIE TEASER / FRUSTRATION

### Message Freemium

```
Comptable Senior — Ouagadougou — CDI
Date limite : 2 jours
[Contacts masqués]
Répondez DÉBLOQUER pour accéder
```

### Règles Teaser

| **Situation** | **Décision** | **Raison** |
|---|---|---|
| **Offres complètes gratuites/semaine** | **0** (zéro) | Maximum frustration = conversion |
| **Contacts masqués ?** | Oui, toujours pour Freemium | Seul levier de paiement |
| **Réaction au DÉBLOQUER** | Lien direct Premium 650 FCFA (pas d'essai) | Friction intentionnelle |
| **Ultra-match (score 95+)** | Sponsored Alert (payée employeur) — Freemium voit quand même | Win-win sans coût Tumaa |

### Principe

Avec 1 seule ville/secteur gratuit et contacts masqués, l'utilisateur a juste assez d'envie pour payer, pas assez de déception pour partir.

---

## PAIEMENT & RETRY

### Flow de Base

```
1. Utilisateur → PREMIUM
2. Bot affiche lien CinetPay + montant (650 FCFA)
3. Utilisateur paie (Orange Money / Moov Money / Coris Money)
4. CinetPay webhook → DB Payment.status = SUCCESS
5. Bot → « Abonnement activé jusqu'au JJ/MM/YYYY »
6. User accès Premium activé
```

### Robustesse / Retry

| **Scénario** | **Action** | **Détail** |
|---|---|---|
| **Paiement échoue (réseau)** | PENDING state | Webhook pas reçu → DB Payment.status = PENDING |
| **PENDING > 24h** | Bot relance manuelle | Envoie : « Paiement en attente ? Réessayer : [lien CinetPay] » |
| **User peut vérifier** | Commande VÉRIFIER | Bot sync avec CinetPay, confirme status |
| **User commence, abandonne** | Relance 24h après | Si toujours PENDING après 24h, relancer |
| **Abonnement expire (30j)** | Relance J-7 avant expiration | Message : « Votre abonnement expire dans 7 jours » |

### Principes

- **Pas d'automatisme agressif** — user doit agir (VÉRIFIER, ESSAYER)
- **Hors plateforme** — paiement via CinetPay/Orange/Moov, pas d'UI admin sur paiement
- **Suivi hors plateforme** — admin voit paiement via CinetPay dashboard, pas dans Tumaa

---

## CANAUX WHATSAPP GRATUITS

### Concept Fondamental

**Les Canaux WhatsApp = le vrai moteur gratuit**, pas le bot principal.

Utilisateur voit les teasers dans les canaux → clique wa.me → écrit OFFRES → fenêtre 24h gratuite ouverte.

### Architecture — 1 canal par pays (décision actée, remplace les 10 canaux thématiques ci-dessous)

> **Obsolète** : la table "10 Canaux Thématiques" (par ville/secteur) qui suivait initialement
> ici a été abandonnée au profit d'**1 canal WhatsApp par pays**, alignée sur le modèle
> multi-pays ELITE. Voir `docs/subscription_flow_elite.md` pour le détail du flow d'auto-join.

| **Canal** | **Contenu** | **Fréquence** | **Modération** |
|---|---|---|---|
| #Emploi-BF | Teasers toutes offres Burkina Faso (villes/secteurs mélangés) | 08:00 quotidien | 0 (bot auto-poste) |
| #Emploi-BJ | Teasers toutes offres Bénin | 08:00 quotidien | 0 |
| #Emploi-TG | Teasers toutes offres Togo | 08:00 quotidien | 0 |
| #Emploi-CI | Teasers toutes offres Côte d'Ivoire | 08:00 quotidien | 0 |

### Contenu Chaque Canal

```
Comptable Senior — Ouagadougou — CDI
Limite : 2 jours
Tapez OFFRES pour voir les contacts
wa.me/+226XXXXXXX
```

### Cycle Utilisateur

```
1. User voit teaser dans canal #Emploi-Ouagadougou
2. Clique wa.me/+226XXXXXXX
3. Écrit OFFRES au bot
4. Fenêtre de service 24h ouverte
5. Reçoit messages gratuits pendant 24h
6. Chaque action (VOIR PLUS, CONTACT, SUIVANT) prolonge la fenêtre 24h
```

### Implémentation

- **Bot auto-poste** teasers à 08:00 dans chaque canal
- **Aucune modération manuelle** — bot = source of truth
- **Archivage auto** après 15j (vieille offre supprimée du canal)
- **wa.me link** dans chaque message pour ouvrir conversation directe

### Coût

0 FCFA supplémentaire (inclus dans infrastructure bot).

---

## SPONSORED ALERTS — B2B

### Qu'est-ce que c'est ?

**L'employeur paie Tumaa pour que son offre soit VUE par les Freemium** (normalement ils ne voient que le teaser masqué).

#### Scénario Sans Sponsored

```
Freemium reçoit teaser :
  Comptable Senior — Ouagadougou — CDI
  [Contacts masqués]
  Répondez DÉBLOQUER

Résultat : La plupart ne paient pas → offre perd ses candidats
```

#### Scénario Avec Sponsored (payée employeur)

```
Employeur (Orange Burkina) dit :
  « Je veux que cette offre soit vue par TOUS les Freemium,
     même s'ils ne paient pas. Je paie pour ça. »

Tumaa facture employeur : 150k FCFA (exemple)

Résultat :
  Freemium reçoit offre COMPLÈTE :

  OFFRE SPONSORISÉE — Orange Burkina Faso
  Développeur Web — Ouagadougou — CDI
  [Contacts VISIBLES] — Débloquez gratuitement grâce au sponsoring

Win-win-win :
  Employeur atteint les Freemium (impossible sinon)
  Freemium voit les offres complètes (gratuitement)
  Tumaa gagne sans dépenser en templates payants Meta
```

### Flux Complet B2B

```
1. EMPLOYEUR (hors plateforme)
   Contacte Tumaa via email/WhatsApp/téléphone :
   « Je veux publier 2 offres : Comptable Senior, Dev Web
      Deadline 15/02 et 20/02 »

2. TUMAA envoie facture ProForma
   « 2 offres + options = [montant] FCFA »
   (hors plateforme — pas de UI employeur)

3. EMPLOYEUR paie
   Via CinetPay / Virement / Orange Money / Moov Money
   (hors plateforme)

4. ADMIN TUMAA (dashboard)
   Reçoit notification paiement
   Crée JobSubmission manuellement :
   - Employeur : Orange Burkina (ou crée si nouveau)
   - Détails offre #1 : Comptable Senior, Ouagadougou, CDI, 15/02
   - Détails offre #2 : Dev Web, Ouagadougou, CDI, 20/02
   - Valide format/complétude

5. ADMIN choisit OPTIONS (checkboxes pour chaque offre)
   Offre #1 :
     Mise en avant (offre prioritaire dans résultats)
     Sponsored Alert (employeur peut relancer alerte)

   Offre #2 :
     Mise en avant
     Sponsored Alert

6. OFFRES ACTIVES
   Publiées, visibles selon options choisies

7. EMPLOYEUR relance Sponsored (optionnel)
   Admin envoie alerte aux Freemium :
   - J1 : 8500 Freemium reçoivent alerte (contacts visibles)
   - J3 : 8500 Freemium reçoivent alerte (relance)
   - J5 : 8500 Freemium reçoivent alerte (relance)
```

### Options B2B

| **Option** | **Effet** | **Freemium voit** | **Coût employeur** |
|---|---|---|---|
| **Aucune** | Offre normale, diffusée via pull quotidien | Teaser + contacts masqués | Inclus |
| **Mise en avant** | Offre apparaît EN PREMIER dans résultats matching | Teaser + contacts masqués (sauf si aussi Sponsored) | Inclus ou +X |
| **Sponsored Alert** | Bot envoie alerte payante aux Freemium | Offre COMPLÈTE avec contacts VISIBLES | +X FCFA par relance |
| **Mise en avant + Sponsored** | Prioritaire + alerte | Complète avec contacts | Combo |

### Sponsored Alert — Mécanisme Relance

**L'employeur peut relancer l'alerte plusieurs fois (J1, J3, J5, etc.) via l'Admin Tumaa.**

#### Exemple

```
Offre : Comptable Senior
Deadline : 15/02/2026
Options : Mise en avant, Sponsored Alert

Admin Tumaa relance (hors plateforme) :

  J1 (30/01) → Admin lance alerte
    → Bot envoie à 8500 Freemium + tous Premium
    → Offre complète, contacts visibles
    → JobOffer.sponsoredSentCount = 1
    → JobOffer.sponsoredLastSentAt = 30/01

  J3 (01/02) → Admin relance
    → Bot envoie à 8500 Freemium + tous Premium
    → Même format
    → JobOffer.sponsoredSentCount = 2
    → JobOffer.sponsoredLastSentAt = 01/02

  J5 (03/02) → Admin relance
    → Bot envoie à 8500 Freemium + tous Premium
    → JobOffer.sponsoredSentCount = 3
    → JobOffer.sponsoredLastSentAt = 03/02
```

#### Comment Admin Relance ?

**Dashboard Button :**

```
[Offre ID : 123-Comptable-Senior]
Status : ACTIVE
Deadline : 15/02/2026
Options : Mise en avant, Sponsored Alert

Historique Sponsored :
  30/01 → Alerte envoyée
  01/02 → Alerte envoyée
  03/02 → Alerte envoyée

[Relancer Sponsored Alert maintenant]
  → Bot envoie immédiatement à Freemium
  → sponsoredSentCount++
  → sponsoredLastSentAt = NOW()
```

### Mise en Avant — Mécanisme

Offre avec `isFeatured = true` s'affiche **en premier** dans les résultats matching.

#### Exemple

```
Freemium tape OFFRES (Ouagadougou, Informatique)

Résultats :
1. Développeur Web — Orange Burkina [MISE EN AVANT]
   Contacts masqués (Sponsored Alert non activée pour cette offre)

2. Dev Junior — Startup locale
   Contacts masqués

3. Technicien IT — ANPE
   Contacts masqués

...
```

Le badge featured monte en priorité, même si les autres offres sont plus anciennes.

---

## SCHÉMA DONNÉES

### Nouvelles Tables

#### `Employer` (nouvelle)

```prisma
model Employer {
  id             String   @id @default(cuid())
  name           String   // Orange Burkina, ANPE, Startup XYZ...
  contactEmail   String   @unique
  contactPhone   String?
  isVerified     Boolean  @default(false) // Badge "Source vérifiée Tumaa"
  totalJobsPosted Int     @default(0)     // Historique
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  // Relations
  jobSubmissions JobSubmission[]
  jobOffers      JobOffer[]
}
```

#### `JobSubmission` (modifié)

```prisma
model JobSubmission {
  id           String   @id @default(cuid())

  // Employeur
  employerId   String   @db.Uuid
  employer     Employer @relation(fields: [employerId], references: [id])

  // Données brutes de l'offre (avant validation)
  rawData      Json

  // OPTIONS ADMIN
  isFeatured   Boolean  @default(false) // Mise en avant
  isSponsored  Boolean  @default(false) // Sponsored Alert disponible

  // VALIDATION
  isVerified   Boolean  @default(false)
  verifiedAt   DateTime?

  // CRÉATION JOBOFFER
  jobOfferId   String?  @db.Uuid
  jobOffer     JobOffer? @relation(fields: [jobOfferId], references: [id])

  submittedAt  DateTime @default(now())
  validatedAt  DateTime?

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

#### `JobOffer` (modifié)

```prisma
model JobOffer {
  id             String   @id @default(cuid())

  // OFFRE DE BASE
  title          String
  organization   String
  city           String
  sector         String
  level          String
  contractType   ContractType
  description    String?
  requirements   String?

  // CONTACTS (masqués pour Freemium)
  contactEmail   String?
  contactPhone   String?
  contactAddress String?
  applicationUrl String?

  // DEADLINE (admin entre date exacte JJ/MM/YYYY)
  deadline       DateTime @required

  // SOURCE
  sourceId       String   @db.Uuid
  source         Source   @relation(fields: [sourceId], references: [id])
  sourceUrl      String?

  // DÉDUPLICATION
  hash           String   @unique // SHA-256(title + org + date)
  scoreConfidence Float    @default(0.8)

  // OFFRE B2B (employeur direct)
  employerId     String?  @db.Uuid
  employer       Employer? @relation(fields: [employerId], references: [id])

  // OPTIONS B2B
  isFeatured     Boolean  @default(false) // Mise en avant = priorité résultats
  isSponsored    Boolean  @default(false) // Eligible Sponsored Alert

  // SUIVI SPONSORED ALERTS
  sponsoredSentCount    Int      @default(0)  // Combien de fois l'alerte a été envoyée
  sponsoredLastSentAt   DateTime? // Horodatage dernière alerte

  // STATUT
  status         JobOfferStatus @default(ACTIVE)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  // RELATIONS
  interactions   JobInteraction[]
  jobSubmission  JobSubmission?
  sponsoredAlertHistory SponsoredAlertHistory[]
}
```

#### `SponsoredAlertHistory` (optionnel, utile pour audit)

```prisma
model SponsoredAlertHistory {
  id        String   @id @default(cuid())

  jobId     String   @db.Uuid
  job       JobOffer @relation(fields: [jobId], references: [id])

  sentAt    DateTime @default(now())

  createdAt DateTime @default(now())

  @@index([jobId, sentAt])
}
```

### Relation Overall

```
Employer (1) —— (N) JobSubmission
Employer (1) —— (N) JobOffer

JobSubmission — JobOffer (1-to-1, via jobOfferId)

JobOffer (1) —— (N) SponsoredAlertHistory
JobOffer (1) —— (N) JobInteraction
```

---

## VALIDATION OFFRE B2B

### Règles Validation

Avant publication, admin vérifie :

```
Titre non vide
Organisation non vide
Ville valide (dans ontologie Tumaa : Ouagadougou, Bobo, Koudougou, etc.)
Secteur valide (dans ontologie : IT, Finance, RH, Santé, Éducation...)
Niveau valide (BAC, BAC+2, BAC+3, BAC+4, Licence, Master, etc.)
Type contrat valide (CDI, CDD, Stage, Alternance, Freelance, Bénévole, Autre)
Email contact : format valide
Deadline : JJ/MM/YYYY, ≥ aujourd'hui (pas du passé)
Description : min 50 caractères
```

### Niveau Validation

- **Format/complétude uniquement** (pas de fraude deepdive)
- Validé = JobSubmission.isVerified = true → crée JobOffer
- Invalide = form rejette, affiche erreur, admin rentre à nouveau

---

## RÉCAP — RÈGLES MÉTIER CRITIQUES

| **Règle** | **Détail** | **Priorité** |
|---|---|---|
| **Freemium** | 1 ville, 1 secteur, contacts masqués, **0 offre gratuite/semaine**, historique 7j | Critique |
| **Premium** | 3 villes, 3 secteurs, contacts visibles, alertes keywords, historique 30j | Critique |
| **Teaser** | Toujours masqué pour Freemium sauf Sponsored (payée employeur) | Critique |
| **Paiement** | CinetPay/Orange/Moov hors plateforme, retry manuel (VÉRIFIER), relance 7j avant expiration | Critique |
| **Canaux** | 10 canaux auto-post 08:00, 0 modération manuelle, wa.me link dans chaque message | Important |
| **Sponsored** | Employeur paie Admin, Admin choisit options, peut relancer alerte (J1, J3, J5...) | Important |
| **Admin B2B** | Point d'ingestion unique (JobSubmission manuelle), validation format/complétude | Important |
| **Mise en avant** | Offre prioritaire dans résultats matching (apparaît en premier) | Secondaire |

---

## STATUT VALIDATION — PRÊT À CODER

| **Domaine** | **Validé** | **Décisions** | **Prêt à coder ?** |
|---|---|---|---|
| **Freemium/Premium** | Oui | 1v/1s vs 3v/3s, 650 FCFA, 0 offre gratuite | OUI |
| **Teaser/Frustration** | Oui | Contacts masqués, DÉBLOQUER → Premium direct | OUI |
| **Paiement/Retry** | Oui | Manuel VÉRIFIER, relance 7j avant expiration | OUI |
| **Canaux WhatsApp** | Oui | 10 canaux, auto-post 08:00, wa.me links | OUI |
| **Sponsored Alerts** | Oui | Employeur paie, Admin relance (J1/J3/J5), offre complète vue Freemium | OUI |
| **Validation offre B2B** | Oui | Format/complétude seulement | OUI |

---

## PROCHAINES ÉTAPES

### Phase 1 — Schéma Prisma
- [ ] Créer Employer table
- [ ] Modifier JobSubmission (add isFeatured, isSponsored, employerId)
- [ ] Modifier JobOffer (add isFeatured, isSponsored, sponsoredSentCount, sponsoredLastSentAt, employerId)
- [ ] Optionnel : SponsoredAlertHistory table
- [ ] `pnpm db:migrate`

### Phase 2 — Admin Dashboard (JobSubmission)
- [ ] Form création offre B2B (title, org, city, sector, level, deadline, email, etc.)
- [ ] Checkboxes options (Mise en avant, Sponsored Alert)
- [ ] Validation format/complétude
- [ ] Test : créer offre → crée JobOffer → offre publiée

### Phase 3 — Bot (Sponsored Alert Delivery)
- [ ] Template Sponsored Alert
- [ ] Admin button « Relancer Sponsored Alert »
- [ ] Bot envoie alerte à Freemium (contacts visibles)
- [ ] Incrémente sponsoredSentCount
- [ ] Test : relancer alerte 3x → compteur = 3

### Phase 4 — Matching (Mise en Avant)
- [ ] Modifier scorer : isFeatured = +boost de score
- [ ] Offres featured apparaissent en premier
- [ ] Test : 2 offres (1 featured, 1 non) → featured en tête

### Phase 5 — Tests & Build
- [ ] All Jest passing
- [ ] TypeScript build clean
- [ ] Simulateur : Admin crée offre B2B → offre active → bot relance Sponsored

---

**Document validé — Prêt pour Claude Code.**

---

*Tumaa — Modèle Freemium/Premium/Sponsored Alerts — v1.0 Validée*
*Date : Juillet 2026*
