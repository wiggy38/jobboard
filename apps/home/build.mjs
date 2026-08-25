// Assembles apps/home/*.html from src/pages/*.html + src/partials/*.html.
// No template engine dependency: {{var}} substitution and {{#if var}}...{{/if}} blocks only.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// css/js sont servis avec un cache navigateur immutable de 30j (voir
// nginx.conf.template) et aucun hash dans leur nom de fichier — sans
// cache-busting, un déploiement qui change main.js reste invisible pour un
// navigateur ayant déjà chargé la page jusqu'à expiration du cache. On
// suffixe donc chaque référence js/css d'un hash du contenu du fichier
// (?v=<hash>), qui change automatiquement dès que le fichier change.
function cacheBust(page) {
  return page.replace(/((?:src|href)="(?:css|js)\/[^"?]+\.(?:css|js))"/g, (match, prefix) => {
    const relPath = prefix.replace(/^(?:src|href)="/, '');
    const hash = createHash('md5').update(readFileSync(path.join(__dirname, relPath))).digest('hex').slice(0, 8);
    return `${prefix}?v=${hash}"`;
  });
}
const partialsDir = path.join(__dirname, 'src', 'partials');
const pagesDir = path.join(__dirname, 'src', 'pages');

const HOME_CTX = { logoHref: '#top', prefix: '', offresCurrentAttr: '', logoWidth: '140', logoHeight: '55', headerClass: ' site-header-hero' };
const SUBPAGE_CTX = { logoHref: 'index.html', prefix: 'index.html', offresCurrentAttr: ' class="is-current"', logoWidth: '110', logoHeight: '43', headerClass: ' site-header-vivid' };

const PAGE_CONTEXTS = {
  'index.html': HOME_CTX,
  'offres.html': SUBPAGE_CTX,
  'offre-detail.html': SUBPAGE_CTX,
  'cgu.html': SUBPAGE_CTX,
  'mentions-legales.html': SUBPAGE_CTX,
};

function renderTemplate(template, ctx) {
  let out = template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, block) => (ctx[key] ? block : ''));
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in ctx)) throw new Error(`Missing template var "${key}"`);
    return String(ctx[key]);
  });
  return out;
}

const partials = {};
for (const file of readdirSync(partialsDir)) {
  const name = path.basename(file, '.html');
  partials[name] = readFileSync(path.join(partialsDir, file), 'utf8');
}

for (const file of readdirSync(pagesDir)) {
  const ctx = PAGE_CONTEXTS[file];
  if (!ctx) throw new Error(`No context defined for page "${file}"`);

  let page = readFileSync(path.join(pagesDir, file), 'utf8');
  page = page.replace(/\{\{>\s*(\w+)\s*\}\}/g, (_, name) => {
    const partial = partials[name];
    if (!partial) throw new Error(`Unknown partial "${name}" (in ${file})`);
    return renderTemplate(partial, ctx).trimEnd();
  });
  page = cacheBust(page);

  const outPath = path.join(__dirname, file);
  writeFileSync(outPath, page, 'utf8');
  console.log(`built ${file}`);
}
