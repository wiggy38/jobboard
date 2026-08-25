function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daysUntil(iso) {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const detailEl = document.querySelector('[data-offer-detail]');

  if (!id) {
    if (detailEl) detailEl.innerHTML = '<p class="job-empty">Offre introuvable.</p>';
    return;
  }

  const apiBase = window.TUMAA_API_BASE || '';

  let job;
  try {
    const res = await fetch(`${apiBase}/api/offre/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    job = data.job;
    job.accessLevel = data.accessLevel;
  } catch (err) {
    if (detailEl) detailEl.innerHTML = '<p class="job-empty">Cette offre est introuvable ou n\'est plus disponible.</p>';
    return;
  }

  document.title = `${job.title} — Tumaa`;

  const badgesEl = document.querySelector('[data-offer-badges]');
  badgesEl.innerHTML = `
    <span class="offer-badge">${job.sector}</span>
    <span class="offer-badge">${job.city}</span>
  `;

  const expireDays = daysUntil(job.deadline);
  const expiryEl = document.querySelector('[data-offer-expiry]');
  if (expireDays !== null) {
    expiryEl.textContent = `⏱ Expire dans ${Math.max(expireDays, 0)}j`;
  } else {
    expiryEl.style.display = 'none';
  }
  document.querySelector('[data-offer-title]').textContent = job.title;
  document.querySelector('[data-offer-source]').textContent = `${job.organization} · ${job.city}`;
  document.querySelector('[data-offer-city]').textContent = job.city;
  document.querySelector('[data-offer-level]').textContent = job.level || 'Non précisé';
  document.querySelector('[data-offer-published]').textContent = '—';
  document.querySelector('[data-offer-deadline]').textContent = formatDate(job.deadline);
  document.querySelector('[data-offer-preview]').textContent = job.description || 'Aucune description disponible.';
  document.querySelector('[data-offer-publisher]').textContent = job.sourceName || job.organization;
  document.querySelector('[data-offer-source-name]').textContent = job.sourceName || '—';

  const externalBtn = document.querySelector('[data-offer-external]');
  if (job.accessLevel === 'FULL' && job.sourceUrl) {
    externalBtn.href = job.sourceUrl;
    externalBtn.target = '_blank';
    externalBtn.addEventListener('click', () => {
      fetch(`${apiBase}/api/offre/${encodeURIComponent(id)}/click`, { method: 'POST', keepalive: true }).catch(() => {});
    });
  } else {
    externalBtn.href = 'offres.html';
    externalBtn.removeAttribute('target');
    externalBtn.addEventListener('click', () => {
      fetch(`${apiBase}/api/offre/${encodeURIComponent(id)}/click-locked`, { method: 'POST', keepalive: true }).catch(() => {});
    });
  }

  const waMsg = `Regarde cette offre sur Tumaa : ${job.title} (${job.city}) — ${window.location.href}`;
  const shareWaLink = document.querySelector('[data-offer-share-wa]');
  fetch(`${apiBase}/api/public/whatsapp-number?country=${encodeURIComponent(job.country || 'BF')}`)
    .then((res) => res.json())
    .then((data) => {
      shareWaLink.href = `https://wa.me/${data.number}?text=${encodeURIComponent(waMsg)}`;
    })
    .catch(() => {
      shareWaLink.href = `https://wa.me/22600000000?text=${encodeURIComponent(waMsg)}`;
    });

  document.querySelector('[data-offer-share-friend]').addEventListener('click', () => {
    fetch(`${apiBase}/api/offre/${encodeURIComponent(id)}/share`, { method: 'POST', keepalive: true }).catch(() => {});
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
    window.open(shareUrl, '_blank', 'noopener');
  });
});
