// Base URL de l'API interne. En prod, nginx proxifie /api/ vers le service
// API sur le même domaine (voir apps/web/nginx) : chaîne vide = fetch relatif.
// En dev local (apps/home servi statiquement, ex. WAMP), l'API tourne sur un
// port séparé : on la cible en direct.
window.TUMAA_API_BASE = window.TUMAA_API_BASE || (
  ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:2999'
    : ''
);
