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
| `tumaa-web-nginx` | `apps/web` | `railway.web-nginx.json` (`dockerfilePath: nginx/Dockerfile`) | Landing statique + reverse proxy vers `tumaa-web-app`. Générer un domaine Railway (ou domaine custom `tumaa.bf`) |
| `tumaa-web-app` | `apps/web/app` | `railway.web-app.json` (`dockerfilePath: Dockerfile`) | SvelteKit (admin, B2B, liens tokenisés `/offre/`). Pas de domaine public nécessaire — accédé uniquement via le réseau interne par `tumaa-web-nginx` |

`tumaa-api`, `tumaa-bot`, `tumaa-scraper` utilisent le builder RAILPACK avec
`buildCommand`/`startCommand` définis dans leur JSON — le Root Directory reste la
racine du repo car `pnpm turbo run build --filter=...` a besoin du workspace complet.
`tumaa-web-nginx` et `tumaa-web-app` utilisent le builder DOCKERFILE : leur Root
Directory doit être positionné sur le sous-dossier correspondant pour que
`dockerfilePath` (relatif à ce Root Directory) résolve correctement.

## Réseau interne — nginx → SvelteKit

`tumaa-web-nginx` proxy vers `tumaa-web-app` via la variable d'env
`SVELTEKIT_UPSTREAM` (résolue par `envsubst` dans
[default.conf.template](../apps/web/nginx/templates/default.conf.template)).
En local (`docker-compose.web.yml`) elle vaut `sveltekit:3000`. Sur Railway,
positionner sur `tumaa-web-nginx` :

```
SVELTEKIT_UPSTREAM=${{tumaa-web-app.RAILWAY_PRIVATE_DOMAIN}}:3000
```

(remplacer `tumaa-web-app` par le nom exact donné au service SvelteKit dans le
dashboard). Le réseau privé Railway route ce domaine sans sortir sur Internet.

## Variables d'environnement par service

Voir les `.env.example` de chaque app comme source de vérité — ne rien copier en
dur ici, ils évoluent. Points d'attention au moment du déploiement :

- `tumaa-api` : `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ADMIN_JWT_SECRET`,
  `ADMIN_PASSWORD`, `TOKEN_SECRET`, `WEB_BASE_URL`, `API_BASE_URL`,
  `CHANNEL_INVITE_LINK_*`, `PAYDUNYA_*` (mode `live` en prod)
- `tumaa-bot` : `DATABASE_URL`, `REDIS_URL`, `META_*` (webhook WhatsApp),
  `ANTHROPIC_API_KEY`, `PAYDUNYA_*`/`CINETPAY_*`, `INTERNAL_API_URL` →
  pointer vers le domaine privé de `tumaa-api`, `CHANNEL_INVITE_LINK_*`
- `tumaa-scraper` : `DATABASE_URL`, `REDIS_URL`, `SMTP_*` (rapport quotidien —
  utiliser un mot de passe d'application dédié, jamais commité)
- `tumaa-web-nginx` : `SVELTEKIT_UPSTREAM` (voir ci-dessus)
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
6. Générer un domaine public pour `tumaa-web-nginx` (et `tumaa-bot` pour le
   webhook Meta) ; brancher le domaine custom `tumaa.bf` si applicable
