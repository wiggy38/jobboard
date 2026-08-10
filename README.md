# Tumaa

Assistant emploi WhatsApp pour l'Afrique de l'Ouest (Burkina Faso, Bénin, Togo, Côte d'Ivoire).
Monorepo pnpm : voir `CLAUDE.md` pour l'architecture détaillée et les règles métier.

## Prérequis

- Node.js ≥ 20
- pnpm ≥ 9 (`corepack enable` ou `npm i -g pnpm`)
- Docker (PostgreSQL + Redis en local)
- [ngrok](https://ngrok.com/) (optionnel — pour exposer le webhook WhatsApp en local)

## 1. Installation

```bash
pnpm install
```

## 2. Base de données et Redis

```bash
docker compose up -d
```

Démarre PostgreSQL (`localhost:5432`, user/db `tumaa`) et Redis (`localhost:6379`) — voir
`docker-compose.yml`.

Puis appliquer les migrations Prisma :

```bash
pnpm db:migrate
```

(équivaut à `pnpm --filter @tumaa/db migrate`, exécute `prisma migrate dev` sur
`packages/db/prisma/schema.prisma`)

Optionnel — créer un compte admin backoffice :

```bash
pnpm --filter @tumaa/api run create:admin
```

## 3. Variables d'environnement

Chaque app lit son propre fichier `.env` (non versionné). Copier les `.env.example` fournis :

```bash
cp apps/api/.env.example apps/api/.env
cp apps/bot/.env.example apps/bot/.env
cp apps/scraper/.env.example apps/scraper/.env
```

Points d'attention :

- **`apps/api/.env`** : `DATABASE_URL`, `REDIS_URL`, `TOKEN_SECRET` (signature JWT, partagé avec
  `apps/bot` pour que les liens `/offre/[token]` et `/subscribe` restent valides), clés PayDunya
  (`PAYDUNYA_*`) pour tester le paiement, `PORT` — **en local, les proxys Vite de `apps/web` et
  `apps/backoffice` pointent vers `http://localhost:2999`** (voir `apps/web/vite.config.ts` et
  `apps/backoffice/vite.config.ts`), donc mettre `PORT=2999` plutôt que la valeur par défaut
  `3000` de `.env.example`, sauf si vous adaptez les proxys.
- **`apps/bot/.env`** : `DATABASE_URL`, `REDIS_URL`, `TOKEN_SECRET` (même valeur que côté API),
  `WEB_BASE_URL=http://localhost:5173` (pointe vers `apps/backoffice` en local, qui sert
  `/offre/[token]`), identifiants Meta Cloud API (`WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `WEBHOOK_VERIFY_TOKEN`) pour tester le webhook réel.
- **`apps/scraper/.env`** : `DATABASE_URL`, `ANTHROPIC_API_KEY` (extraction sémantique Phase 2 —
  voir "Architecture scraping" dans `CLAUDE.md`).
- **`apps/web/.env.local`** / **`apps/backoffice/.env.local`** : `VITE_API_URL` (URL de l'API,
  ex. `http://localhost:2999`), et pour `apps/web` : `VITE_BOT_PHONE`,
  `VITE_ENABLE_PAYMENT_SIMULATION=true` pour activer le bouton "🧪 Simuler le paiement (dev)" sur
  `/subscribe` sans passer par PayDunya (actif par défaut en mode `vite dev`).

## 4. Lancer chaque brique

| Commande | Brique | Port par défaut |
|---|---|---|
| `pnpm --filter @tumaa/api dev` | API REST (Fastify) | `PORT` (voir `.env`, `2999` recommandé en local) |
| `pnpm --filter @tumaa/bot dev` | Webhook WhatsApp (Fastify) | `PORT` de `apps/bot/.env` |
| `pnpm backoffice:dev` | Backoffice + pages `/offre/[token]` (SvelteKit) | `5173` |
| `pnpm web:dev` | Pages `/subscribe/*` (React/Vite) | `3001` |
| `pnpm --filter @tumaa/home build` | Site vitrine statique (assemble `apps/home/*.html`) | servi en statique (WAMP/Apache, ou tout serveur statique pointant sur `apps/home/`) |

Tout démarrer en parallèle (API, bot, backoffice, web) :

```bash
pnpm dev
```

(`turbo run dev` — lance le script `dev` de chaque package qui en définit un ; `apps/home` n'a pas
de script `dev`, seulement `build`, à relancer après modification des fichiers dans
`apps/home/src/`.)

## 5. Webhook WhatsApp en local

Après avoir lancé `apps/bot` :

```bash
ngrok http <PORT_BOT>
```

Configurer l'URL ngrok comme webhook dans Meta for Developers (avec `WEBHOOK_VERIFY_TOKEN`).
Voir `apps/bot/test/webhook.http` pour des exemples de payloads à rejouer sans passer par Meta.

## 6. Scraper

Tester une source isolée :

```bash
pnpm scraper:run <source>
# ex : pnpm scraper:run lefaso
```

Lancer le scheduler (cron des scrapers) :

```bash
pnpm scraper:scheduler
```

Autres commandes utiles (`apps/scraper/package.json`) : `scraper:diagnose`, `backfill:hash`,
`seed:sources`.

## 7. Bot — scheduler (teaser quotidien, relances paiement)

```bash
pnpm bot:scheduler
```

## 8. Tests

```bash
pnpm test              # tous les packages (turbo run test)
pnpm test:matching     # packages/matching uniquement
```

## 9. Build production

```bash
pnpm build              # turbo run build (tous les packages)
pnpm --filter @tumaa/home build   # site vitrine statique
```
