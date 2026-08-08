const COUNTRY_FLAGS = { bf: '🇧🇫', ci: '🇨🇮', bj: '🇧🇯', sn: '🇸🇳', tg: '🇹🇬' };
const CONTRACT_LABELS = {
  CDI: 'CDI',
  CDD: 'CDD',
  STAGE: 'Stage',
  ALTERNANCE: 'Alternance',
  FREELANCE: 'Freelance',
  BENEVOLE: 'Bénévolat',
  AUTRE: 'Autre',
};

function buildJobCard(offer) {
  const countryCode = (offer.country || '').toLowerCase();
  const flag = COUNTRY_FLAGS[countryCode] || '🌍';
  const contractLabel = CONTRACT_LABELS[offer.contractType] || offer.contractType || '';

  const card = document.createElement('article');
  card.className = 'job-card';
  card.dataset.country = countryCode;
  card.dataset.sector = offer.sector || '';
  card.dataset.id = offer.id;

  const tag = offer.isUrgent ? '<span class="job-tag tag-yellow">Urgent</span>'
    : offer.isNew ? '<span class="job-tag tag-yellow">Nouveau</span>'
    : '';

  card.innerHTML = `
    <div class="job-card-top"><h3 class="job-title">${escapeHtml(offer.title)}</h3><span class="job-flag">${flag}</span></div>
    <div class="job-meta">${escapeHtml(offer.city)}${contractLabel ? ' · ' + escapeHtml(contractLabel) : ''}</div>
    <div class="job-tags"><span class="job-tag">${escapeHtml(offer.sector)}</span>${tag}</div>
    <div class="job-card-footer"><a class="btn btn-secondary job-view-btn" href="offre-detail.html?id=${encodeURIComponent(offer.id)}">Voir</a></div>
  `;
  return card;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.addEventListener('DOMContentLoaded', async () => {
  const tabs = document.querySelectorAll('[data-country-tabs] .country-tab');
  const countEl = document.querySelector('[data-jobs-count]');
  const emptyEl = document.querySelector('[data-jobs-empty]');
  const grid = document.querySelector('[data-jobs-grid]');
  const pagination = document.querySelector('[data-jobs-pagination]');

  if (!grid) return;

  // Custom sector dropdown
  const dropdown = document.querySelector('[data-sector-dropdown]');
  const dropdownBtn = document.querySelector('[data-sector-btn]');
  const dropdownLabel = document.querySelector('[data-sector-label]');
  const dropdownList = document.querySelector('[data-sector-list]');
  let sector = 'all';

  function populateSectorDropdown(sectors) {
    if (!dropdownList) return;
    dropdownList.innerHTML = '<li role="option" data-value="all" class="is-selected">🔎 Tous les secteurs</li>';
    sectors.forEach((s) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.value = s;
      li.textContent = s;
      dropdownList.appendChild(li);
    });
  }

  if (dropdown) {
    dropdownBtn.addEventListener('click', () => {
      const open = dropdown.classList.toggle('is-open');
      dropdownBtn.setAttribute('aria-expanded', String(open));
    });
    dropdownList.addEventListener('click', (e) => {
      const opt = e.target.closest('li');
      if (!opt) return;
      dropdownList.querySelectorAll('li').forEach((o) => o.classList.remove('is-selected'));
      opt.classList.add('is-selected');
      sector = opt.dataset.value;
      dropdownLabel.textContent = opt.textContent.trim();
      dropdown.classList.remove('is-open');
      dropdownBtn.setAttribute('aria-expanded', 'false');
      currentPage = 1;
      apply();
    });
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) dropdown.classList.remove('is-open');
    });
  }

  let country = 'all';
  let currentPage = 1;
  const PAGE_SIZE = 6;
  let cards = [];

  function apply() {
    const filtered = cards.filter((card) => {
      const matchCountry = country === 'all' || card.dataset.country === country;
      const matchSector = sector === 'all' || card.dataset.sector === sector;
      return matchCountry && matchSector;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    cards.forEach((card) => { card.style.display = 'none'; });
    pageItems.forEach((card) => { card.style.display = ''; });

    if (countEl) countEl.textContent = `${filtered.length} offre${filtered.length > 1 ? 's' : ''} trouvée${filtered.length > 1 ? 's' : ''}`;
    if (emptyEl) emptyEl.style.display = filtered.length === 0 ? 'block' : 'none';
    grid.style.display = filtered.length === 0 ? 'none' : '';

    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    if (!pagination) return;
    pagination.innerHTML = '';
    if (totalPages <= 1) return;
    const prev = document.createElement('button');
    prev.className = 'page-btn page-nav';
    prev.textContent = '‹';
    prev.disabled = currentPage === 1;
    prev.addEventListener('click', () => { currentPage -= 1; apply(); });
    pagination.appendChild(prev);

    for (let i = 1; i <= totalPages; i += 1) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (i === currentPage ? ' is-active' : '');
      btn.textContent = String(i);
      btn.addEventListener('click', () => { currentPage = i; apply(); });
      pagination.appendChild(btn);
    }

    const next = document.createElement('button');
    next.className = 'page-btn page-nav';
    next.textContent = '›';
    next.disabled = currentPage === totalPages;
    next.addEventListener('click', () => { currentPage += 1; apply(); });
    pagination.appendChild(next);
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      country = tab.dataset.country;
      currentPage = 1;
      apply();
    });
  });

  try {
    const apiBase = window.TUMAA_API_BASE || '';
    const res = await fetch(`${apiBase}/api/offres`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const offers = Array.isArray(data.offres) ? data.offres : [];

    grid.innerHTML = '';
    cards = offers.map((offer) => {
      const card = buildJobCard(offer);
      grid.appendChild(card);
      return card;
    });

    const sectors = Array.from(new Set(offers.map((o) => o.sector).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'fr'));
    populateSectorDropdown(sectors);

    if (!tabs.length) return;
    apply();
  } catch (err) {
    if (countEl) countEl.textContent = '';
    if (emptyEl) {
      emptyEl.textContent = "Impossible de charger les offres pour le moment. Réessaie dans un instant.";
      emptyEl.style.display = 'block';
    }
    grid.style.display = 'none';
  }
});
