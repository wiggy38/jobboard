# Déploiement Railway

5 services applicatifs partagent un seul repo. Chaque service pointe vers son propre
fichier `railway.*.json` (config-as-code) situé à la racine du repo — Railway ne
déduit pas automatiquement le "Root Directory" ni le "Config File Path" d'un
monorepo, ces deux réglages doivent être faits manuellement par service dans le
dashboard (Settings → Build).

## Add-ons

- **PostgreSQL** (plugin Railway officiel) → expose `DATABASE_URL`
- **Redis** (plugin Railway officiel, ou Upstash externe) → expose `REDIS_URL`

Référencer ces deux add-ons dans les variables d'env de chaque service via les
[références de variables Railway](https://docs.railway.app/guides/variables#reference-variables)
(`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}`) plutôt que copier les valeurs en dur.

## Services

| Service Railway | Root Directory | Config File Path | Notes |
|---|---|---|---|
| `tumaa-api` | `/` (racine repo) | `railway.api.json` | REST interne + dashboard admin. Applique les migrations Prisma au démarrage (`migrate:deploy`) — un seul service doit le faire, ne pas dupliquer sur bot/scraper |
| `tumaa-bot` | `/` (racine repo) | `railway.bot.json` | Webhook WhatsApp, doit être joignable publiquement (générer un domaine Railway) |
| `tumaa-scraper` | `/` (racine repo) | `railway.scraper.json` | Scheduler BullMQ + Playwright (Chromium headless). Le build installe les libs système via `playwright install --with-deps` |
| `tumaa-web-nginx` | `/` (racine repo) | `railway.web-nginx.json` (`dockerfilePath: apps/web/nginx/Dockerfile`) | Landing statique + app React `/subscribe` (buildée dans le même Dockerfile, Root Directory à la racine pour résoudre `@tumaa/shared` en `workspace:*`) + reverse proxy vers `tumaa-web-app` et `tumaa-api`. Générer un domaine Railway (ou domaine custom `tumaa.bf`) |
| `tumaa-web-app` | `/` (racine repo) | `railway.web-app.json` (`dockerfilePath: apps/backoffice/Dockerfile`) | SvelteKit (admin, B2B, liens tokenisés `/offre/`). Pas de domaine public nécessaire — accédé uniquement via le réseau interne par `tumaa-web-nginx` |

`tumaa-api`, `tumaa-bot`, `tumaa-scraper` utilisent le builder RAILPACK avec
`buildCommand`/`startCommand` définis dans leur JSON — le Root Directory reste la
racine du repo car `pnpm turbo run build --filter=...` a besoin du workspace complet.
`tumaa-web-app` utilise le builder DOCKERFILE avec Root Directory à la racine du repo
(comme `tumaa-web-nginx` ci-dessous) : `@tumaa/backoffice` dépend de `@tumaa/shared` en
`workspace:*`, donc a besoin du monorepo complet — un Root Directory sur `apps/backoffice`
seul fait échouer `pnpm install` (`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`, le workspace
n'existe pas dans ce sous-répertoire). Son Dockerfile
(`apps/backoffice/Dockerfile`) build via `pnpm turbo run build --filter=...@tumaa/backoffice`
depuis la racine, comme `tumaa-web-nginx`. `tumaa-web-nginx`
utilise aussi le builder DOCKERFILE avec Root Directory à la racine du repo : son
Dockerfile (`apps/web/nginx/Dockerfile`) build l'app React `@tumaa/web` dans un premier
stage via `pnpm turbo run build --filter=...@tumaa/web` (elle dépend de `@tumaa/shared`
en `workspace:*`, donc a besoin du monorepo complet), puis copie `apps/web/dist`, la
landing statique et le template Nginx dans un second stage `nginx:alpine`.

## Watch Paths (Settings → Source → Watch Paths)

Réglage dashboard uniquement, absent des `railway.*.json` — à vérifier/corriger
manuellement par service. Par défaut Railway ne surveille que le Root Directory
du service (ex. `/apps/api/**` pour `tumaa-api`), ce qui **rate tout changement
dans les dépendances du monorepo** : `packages/db/**` (schéma Prisma),
`packages/shared/**`, `packages/matching/**`, ou même le `railway.*.json` du
service lui-même à la racine. Un commit qui ne touche que ces chemins ne
déclenche alors **aucun redeploy automatique**, même si le build en dépend
directement (`pnpm turbo run build --filter=...@tumaa/x` compile ces packages
avant l'app).

Vécu le 2026-08-23 : le fix du filter direction turbo (commit `60c9367`) n'a
modifié que `railway.api.json`/`railway.bot.json`/`railway.scraper.json` (racine)
— aucun des trois services ne l'a auto-déployé, il a fallu un redeploy manuel.

Patterns recommandés (à saisir un par ligne dans le dashboard) :

| Service | Watch Paths |
|---|---|
| `tumaa-api` | `apps/api/**`, `packages/db/**`, `packages/shared/**`, `railway.api.json`, `turbo.json`, `pnpm-lock.yaml`, `package.json` |
| `tumaa-bot` | `apps/bot/**`, `packages/db/**`, `packages/shared/**`, `packages/matching/**`, `railway.bot.json`, `turbo.json`, `pnpm-lock.yaml`, `package.json` |
| `tumaa-scraper` | `apps/scraper/**`, `packages/db/**`, `packages/shared/**`, `railway.scraper.json`, `turbo.json`, `pnpm-lock.yaml`, `package.json` |
| `tumaa-web-nginx` | `apps/web/**`, `packages/shared/**`, `railway.web-nginx.json`, `turbo.json`, `pnpm-lock.yaml`, `package.json` |
| `tumaa-web-app` | `apps/backoffice/**`, `packages/shared/**`, `railway.web-app.json`, `turbo.json`, `pnpm-lock.yaml`, `package.json` |

Après toute modification d'un `railway.*.json` ou d'un package partagé sans
changement dans le répertoire de l'app elle-même, **déclencher un redeploy
manuel** pour le(s) service(s) concerné(s) plutôt que de compter sur l'auto-deploy.

## Réseau interne — nginx → SvelteKit / API

`tumaa-web-nginx` proxy vers `tumaa-web-app` (routes `/app/`, `/offre/`) via
`SVELTEKIT_UPSTREAM`, et vers `tumaa-api` (route `/api/`, appelée en relatif par
l'app React `/subscribe`) via `API_UPSTREAM` — les deux résolues par `envsubst`
dans [default.conf.template](../apps/web/nginx/templates/default.conf.template).
En local (`docker-compose.web.yml`) elles valent `sveltekit:3000` et `api:3000`.
Sur Railway, positionner sur `tumaa-web-nginx` :

```
SVELTEKIT_UPSTREAM=${{tumaa-web-app.RAILWAY_PRIVATE_DOMAIN}}:3000
API_UPSTREAM=${{tumaa-api.RAILWAY_PRIVATE_DOMAIN}}:3000
```

(remplacer `tumaa-web-app`/`tumaa-api` par les noms exacts donnés aux services
dans le dashboard). Le réseau privé Railway route ces domaines sans sortir sur
Internet.

L'app React `/subscribe` est buildée avec `base: '/subscribe/'` (Vite) et
`BrowserRouter basename="/subscribe"` (React Router) pour cohabiter avec la
landing statique et le proxy SvelteKit sur le même domaine — voir
[vite.config.ts](../apps/web/vite.config.ts) et [main.tsx](../apps/web/src/main.tsx).

## Variables d'environnement par service

Voir les `.env.example` de chaque app comme source de vérité — ne rien copier en
dur ici, ils évoluent. Points d'attention au moment du déploiement :

- `tumaa-api` : `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ADMIN_JWT_SECRET`,
  `ADMIN_PASSWORD`, `TOKEN_SECRET`, `WEB_BASE_URL`, `API_BASE_URL`,
  `CHANNEL_INVITE_LINK_*`, `PAYDUNYA_*` (mode `live` en prod)
- `tumaa-bot` : `DATABASE_URL`, `REDIS_URL`, `META_*` (webhook WhatsApp),
  `ANTHROPIC_API_KEY`, `PAYDUNYA_*`, `INTERNAL_API_URL` →
  pointer vers le domaine privé de `tumaa-api`, `CHANNEL_INVITE_LINK_*`
- `tumaa-scraper` : `DATABASE_URL`, `REDIS_URL`, `SMTP_*` (rapport quotidien —
  utiliser un mot de passe d'application dédié, jamais commité)
- `tumaa-web-nginx` : `SVELTEKIT_UPSTREAM`, `API_UPSTREAM` (voir ci-dessus)
- `tumaa-web-app` : `PORT=3000`, `VITE_API_URL` → domaine public/privé de `tumaa-api`

Tous les secrets réels vivent uniquement dans les variables d'env Railway —
jamais dans `.env.example`, qui ne doit contenir que des placeholders.

## Ordre de premier déploiement

1. Provisionner PostgreSQL + Redis
2. Déployer `tumaa-api` en premier (applique les migrations au démarrage via
   `migrate:deploy`)
3. Déployer `tumaa-bot` et `tumaa-scraper`
4. Déployer `tumaa-web-app` (SvelteKit), noter son domaine privé Railway
5. Déployer `tumaa-web-nginx` avec `SVELTEKIT_UPSTREAM` pointant vers ce domaine
   et `API_UPSTREAM` pointant vers le domaine privé de `tumaa-api`
6. Générer un domaine public pour `tumaa-web-nginx` (et `tumaa-bot` pour le
   webhook Meta) ; brancher le domaine custom `tumaa.bf` si applicable
