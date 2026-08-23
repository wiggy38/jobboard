# Stack technique — Tumaa

**Document de référence** — reflète l'état réel du monorepo (voir `package.json` de chaque
app/package). En cas de divergence avec `.claude/CLAUDE.md`, ce document fait foi sur le détail
des dépendances ; `CLAUDE.md` fait foi sur les règles métier.

## Monorepo

- **Gestionnaire** : pnpm workspaces (`pnpm@9.0.0`) + Turborepo (`turbo run dev|build|test`)
- **Node** : >= 20
- **TypeScript** partout (apps et packages)

```
apps/
  api/          @tumaa/api        — REST interne, B2B, dashboard (Fastify)
  bot/          @tumaa/bot        — webhook WhatsApp, parser commandes, boucle pull (Fastify)
  scraper/      @tumaa/scraper    — 1 fichier = 1 source, pipeline Playwright + Claude Haiku
  web/          @tumaa/web        — app React /subscribe (Vite)
  backoffice/   @tumaa/backoffice — admin/employer/offres, liens tokenisés /offre/ (SvelteKit)
  home/         (site statique)   — landing publique tumaajob.com, HTML/CSS/JS sans dépendance workspace
packages/
  db/           @tumaa/db         — schéma Prisma, migrations, seed
  matching/     @tumaa/matching   — scoring offres/profils, pur TS sans dépendances runtime
  shared/       @tumaa/shared     — types partagés, PLAN_LIMITS, options de profil
```

## Détail par app/package

### apps/api — REST interne, B2B, dashboard
- Fastify 4 + `@fastify/jwt`, `@fastify/formbody`, `@fastify/static`
- Prisma Client (`@tumaa/db`), BullMQ, ioredis
- `ts-node-dev` en dev, `tsc` en build, tests Jest

### apps/bot — Bot WhatsApp
- Fastify 4 (webhook), Meta Cloud API en direct (pas de SDK tiers)
- `@tumaa/matching` pour le scoring, `@tumaa/db` pour l'accès Prisma
- BullMQ + ioredis (fenêtre de service, compteurs de templates)
- `jsonwebtoken` (liens tokenisés), `axios`
- Tests Jest + `ioredis-mock`

### apps/scraper — Scraping des offres
- Playwright (navigation, phase 1) + Cheerio (parsing HTML léger)
- `@anthropic-ai/sdk` — extraction sémantique via Claude Haiku (phase 2)
- `@azure/ai-projects` / `@azure/identity` — utilisés par certains extracteurs (Bing/Azure)
- `pdf-parse` — extraction depuis sources PDF
- `nodemailer` — notifications
- Prisma Client direct (`@prisma/client`), BullMQ
- Scripts : `scraper:run`, `scraper:diagnose`, `scheduler`, `backfill:hash`, `seed:sources`

### apps/web — App React /subscribe
- Vite + React 19 + React Router 7
- Tailwind CSS 4 (`@tailwindcss/vite`)
- `axios` pour les appels API, `@tumaa/shared` pour les types/options partagés
- Lint : oxlint
- Build React servi dans un conteneur nginx (voir `docs/railway_deploy.md`) ; `/` redirige vers
  `tumaajob.com` (`apps/home`)

### apps/home — Landing publique (tumaajob.com)
- Site statique autonome, HTML/CSS/JS sans dépendance au workspace pnpm
- Build via `node build.mjs` (assemble `src/pages/` + `src/partials/`), servi par `nginx:alpine`
- Service Railway dédié (`tumaa-home`), indépendant de `tumaa-web-nginx`

### apps/backoffice — Admin, employeurs, pages offre
- SvelteKit 2 + Svelte 5, adapter-node
- Tiptap (éditeur riche) pour la saisie d'offres B2B
- Playwright pour les tests e2e (`@playwright/test`)
- Pas de domaine public — accédé uniquement via le réseau interne (reverse proxy nginx)

### packages/db — Schéma Prisma
- Prisma 5, PostgreSQL
- `migrate` (dev), `migrate:deploy` (prod, appliqué uniquement par `tumaa-api` au démarrage)
- Seed via `ts-node prisma/seed.ts`

### packages/matching — Moteur de scoring
- TypeScript pur, aucune dépendance runtime (testable en isolation, cf. `docs/stack_technique.md`
  historique et TODO matching dans `CLAUDE.md`)
- Tests Jest (`test:coverage` disponible)

### packages/shared — Types et constantes partagées
- `PLAN_LIMITS` (source de vérité des limites de plan), options de profil (`SECTOR_OPTIONS`, etc.)
- Consommé par toutes les apps (`workspace:*`)

## Infrastructure

- **Base de données** : PostgreSQL (plugin Railway managé, expose `DATABASE_URL`)
- **Cache / queues** : Redis (plugin Railway ou Upstash externe, expose `REDIS_URL`) + BullMQ
- **Hébergement** : Railway, 6 services applicatifs sur un seul repo (config-as-code
  `railway.*.json` par service) — voir `docs/railway_deploy.md` pour le détail complet
  (root directory, builder, réseau interne nginx → SvelteKit/API)
  - `tumaa-api`, `tumaa-bot`, `tumaa-scraper` : builder RAILPACK, root à la racine du repo
  - `tumaa-web-nginx` : builder DOCKERFILE, sert l'app React `/subscribe` et fait reverse proxy
    vers `tumaa-web-app` et `tumaa-api`
  - `tumaa-home` : builder DOCKERFILE, sert la landing statique (`apps/home`) sur `tumaajob.com`
  - `tumaa-web-app` (backoffice SvelteKit) : builder DOCKERFILE, pas de domaine public
- **IA** : Claude Haiku (`@anthropic-ai/sdk`) pour l'extraction sémantique des offres scrapées
- **Paiement** : PayDunya (Checkout Invoice API) — Orange Money / Moov Money / carte bancaire,
  voir `apps/api/src/lib/paydunya.ts` et `docs/subscription_flow_elite.md`
- **WhatsApp** : Meta Cloud API en accès direct (pas de wrapper tiers)
- **Dev local** : `docker-compose.yml` (PostgreSQL + Redis)

> Note : `CLAUDE.md` mentionne Hetzner VPS et GitHub Actions comme cible d'hébergement/CI
> d'origine ; le déploiement effectivement en place est Railway (voir `docs/railway_deploy.md`).
> Pas de pipeline GitHub Actions constaté dans le repo à ce jour.

## Commandes utiles (racine du monorepo)

```bash
pnpm install              # installe tout le workspace
pnpm dev                  # turbo run dev — démarre tout en hot reload
pnpm build                # turbo run build
pnpm test                 # turbo run test
pnpm db:migrate           # prisma migrate dev (packages/db)
pnpm scraper:run [source] # teste un scraper isolé
pnpm scraper:scheduler    # scheduler BullMQ du scraper
pnpm bot:scheduler        # scheduler du bot
pnpm test:matching        # tests du moteur de matching
pnpm web:dev              # app React /subscribe (Vite)
pnpm backoffice:dev       # backoffice SvelteKit
docker compose up         # PostgreSQL + Redis en local
ngrok http 3000           # expose le webhook bot pour tests WhatsApp
```

## Ordre de dev (historique, toujours valable pour de nouvelles briques)

1. Schéma DB (Prisma) → 2. Scraper source → 3. Webhook bot
→ 4. Matching engine → 5. Compteurs Redis → 6. Paiement → 7. Scouts B2B
