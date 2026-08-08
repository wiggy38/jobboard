// Assembles apps/home/*.html from src/pages/*.html + src/partials/*.html.
// No template engine dependency: {{var}} substitution and {{#if var}}...{{/if}} blocks only.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

  const outPath = path.join(__dirname, file);
  writeFileSync(outPath, page, 'utf8');
  console.log(`built ${file}`);
}
