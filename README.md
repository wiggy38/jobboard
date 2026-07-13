# Tumaa

Plateforme de matching offres d'emploi / profils via WhatsApp, avec support multi-pays
(Burkina Faso, Bénin, Côte d'Ivoire, Sénégal, Togo).

## Architecture

Monorepo pnpm avec trois briques principales :

- `apps/bot/` — webhook WhatsApp, parser de commandes, boucle pull
- `apps/scraper/` — scrapers d'offres (1 fichier = 1 source), pipeline Playwright + Claude Haiku
- `apps/api/` — REST interne, B2B, dashboard
- `apps/web/` — pages d'abonnement (React/Vite)
- `packages/db/` — schéma Prisma
- `packages/matching/` — scoring offres/profils, pur TS sans dépendances
- `packages/shared/` — types partagés

## Stack

Node.js + TypeScript, Fastify, Prisma, PostgreSQL, Redis/Upstash, BullMQ, Playwright,
Cheerio, Meta Cloud API, Claude Haiku, CinetPay/PayDunya, Hetzner VPS, Docker, GitHub Actions.

## Modèle produit

Trois tiers d'abonnement (Freemium / Premium / Elite) plus des Sponsored Alerts B2B pour
les employeurs. Voir `docs/freemium_v1.1.md` et `docs/subscription_flow_elite.md` pour le
détail du modèle et du flow ELITE multi-pays.

## Commandes utiles

```bash
pnpm dev              # démarre tout en hot reload
pnpm test             # tests Jest
pnpm db:migrate       # migrations Prisma
pnpm scraper:run [source]  # teste un scraper isolé
pnpm scraper:scheduler     # démarre le scheduler des jobs planifiés (scraping périodique, rapport quotidien 22h30)
docker compose up     # PostgreSQL + Redis en local
ngrok http 3000       # expose le webhook pour tests WhatsApp
```

## Lancer le projet en local

1. **Prérequis** : Node.js ≥ 20, pnpm ≥ 9, Docker (pour PostgreSQL + Redis).

2. **Installer les dépendances**
   ```bash
   pnpm install
   ```

3. **Démarrer PostgreSQL et Redis**
   ```bash
   docker compose up -d
   ```

4. **Configurer les variables d'environnement**
   Copier chaque `.env.example` en `.env` et renseigner les valeurs (jamais commiter les `.env`) :
   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/bot/.env.example apps/bot/.env
   cp apps/scraper/.env.example apps/scraper/.env
   cp apps/web/.env.local.example apps/web/.env.local   # si présent
   cp packages/db/.env.example packages/db/.env         # si présent
   ```
   Champs clés à remplir : `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`,
   `META_PHONE_NUMBER_ID` / `META_ACCESS_TOKEN` / `META_VERIFY_TOKEN` (WhatsApp Business),
   `CINETPAY_*` / `PAYDUNYA_*` (paiement), `SMTP_*` (rapport quotidien du scheduler).

5. **Appliquer le schéma Prisma**
   ```bash
   pnpm db:migrate
   ```

6. **Démarrer les apps en hot reload** (bot, api, web, scraper)
   ```bash
   pnpm dev
   ```

7. **Exposer le webhook WhatsApp** (si test de messages entrants Meta Cloud API)
   ```bash
   ngrok http 3000
   ```
   Renseigner l'URL ngrok + `META_VERIFY_TOKEN` dans la configuration du webhook Meta.

8. **Lancer le scheduler des scrapers** (en parallèle, dans un terminal séparé)
   ```bash
   pnpm scraper:scheduler
   ```

9. **Tester un scraper isolément** (optionnel, sans passer par le scheduler)
   ```bash
   pnpm scraper:run lefaso
   ```

## Documentation

- `docs/collecte_offres.md` — sources, challenges, architecture de scraping
- `docs/freemium_v1.1.md` — modèle Freemium/Premium, Sponsored Alerts B2B
- `docs/stack_technique.md` — stack complète, ordre de dev
- `docs/subscription_flow_elite.md` — flow ELITE multi-pays
- `.claude/CLAUDE.md` — règles métier et conventions de développement

## Configuration locale

Chaque app (`apps/api`, `apps/bot`, `apps/scraper`, `apps/web`) et `packages/db` a son
propre `.env` (voir `.env.example` correspondant). Ces fichiers ne sont jamais commités.
