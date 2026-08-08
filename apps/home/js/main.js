// ==== Config: numéro WhatsApp Tumaa ====
// ⚠️ REMPLACER par le vrai numéro Tumaa au format international sans + (ex: 22670000000)
const TUMAA_WHATSAPP_NUMBER = '22600000000';

function waLink(message) {
  return `https://wa.me/${TUMAA_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

document.addEventListener('DOMContentLoaded', () => {
  // Fill all [data-wa] links from their data-wa-text
  document.querySelectorAll('[data-wa]').forEach((el) => {
    const msg = el.getAttribute('data-wa-text') || 'OFFRES';
    el.setAttribute('href', waLink(msg));
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener');
  });

  // Mobile menu toggle
  const menuToggle = document.querySelector('.menu-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
    });
    mobileMenu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // FAQ accordion
  document.querySelectorAll('.faq-item').forEach((item) => {
    const btn = item.querySelector('.faq-q');
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach((o) => {
        o.classList.remove('open');
        o.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Hero slider (cinematic)
  const sliderEl = document.querySelector('[data-cine]');
  if (sliderEl && !sliderEl.dataset.sliderInit) {
    sliderEl.dataset.sliderInit = 'true';
    const slides = Array.from(sliderEl.querySelectorAll('.cine-slide'));
    const barsWrap = sliderEl.querySelector('[data-cine-bar]');
    slides.forEach(() => {
      const span = document.createElement('span');
      span.innerHTML = '<i></i>';
      barsWrap.appendChild(span);
    });
    const bars = Array.from(barsWrap.children);
    let index = 0;
    let autoplayId = null;

    function render() {
      slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
      bars.forEach((b, i) => {
        b.classList.remove('active', 'done');
        if (i < index) b.classList.add('done');
        if (i === index) {
          b.classList.add('active');
          const bar = b.querySelector('i');
          bar.style.animation = 'none';
          requestAnimationFrame(() => { bar.style.animation = ''; });
        }
      });
    }
    function goTo(i) {
      index = (i + slides.length) % slides.length;
      render();
      restartAutoplay();
    }
    function next() { goTo(index + 1); }
    function restartAutoplay() {
      if (autoplayId !== null) clearInterval(autoplayId);
      autoplayId = setInterval(next, 6000);
    }

    sliderEl.addEventListener('mouseenter', () => { if (autoplayId !== null) { clearInterval(autoplayId); autoplayId = null; } });
    sliderEl.addEventListener('mouseleave', restartAutoplay);
    render();
    restartAutoplay();
  }
});

// Tweaks panel — persists to localStorage
document.addEventListener('DOMContentLoaded', () => {
  const html = document.documentElement;
  const toggle = document.querySelector('[data-tweaks-toggle]');
  const panel = document.querySelector('[data-tweaks-panel]');
  const closeBtn = document.querySelector('[data-tweaks-close]');
  if (!toggle || !panel) return;

  const TWEAK_KEYS = {
    vibe: 'vif',
    'hero-focus': 'equilibre',
    tone: 'energique',
  };

  function applyTone(tone) {
    html.setAttribute('data-tone', tone);
    document.querySelectorAll('[data-copy-pro]').forEach((el) => {
      if (!el.dataset.copyEnergique) {
        // stash the original energetic copy once
        el.dataset.copyEnergique = el.textContent.trim();
      }
      el.textContent = tone === 'pro' ? el.getAttribute('data-copy-pro') : el.dataset.copyEnergique;
    });
  }

  function applyTweak(key, value) {
    if (key === 'tone') {
      applyTone(value);
    } else {
      html.setAttribute('data-' + key, value);
    }
    localStorage.setItem('tumaa-tweak-' + key, value);
    document.querySelectorAll(`[data-tweak="${key}"] button`).forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-value') === value);
    });
  }

  Object.keys(TWEAK_KEYS).forEach((key) => {
    const saved = localStorage.getItem('tumaa-tweak-' + key) || TWEAK_KEYS[key];
    applyTweak(key, saved);
  });

  document.querySelectorAll('[data-tweak] button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.parentElement.getAttribute('data-tweak');
      applyTweak(key, btn.getAttribute('data-value'));
    });
  });

  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    panel.setAttribute('aria-hidden', String(!panel.classList.contains('open')));
  });
  closeBtn.addEventListener('click', () => {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  });
});
