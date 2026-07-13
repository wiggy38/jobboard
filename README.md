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
docker compose up     # PostgreSQL + Redis en local
ngrok http 3000       # expose le webhook pour tests WhatsApp
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
