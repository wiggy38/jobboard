// ==== Config: numéro WhatsApp Tumaa ====
// ⚠️ REMPLACER par le vrai numéro Tumaa au format international sans + (ex: 22670000000)
const TUMAA_WHATSAPP_NUMBER = '22600000000';

function waLink(message) {
  return `https://wa.me/${TUMAA_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-wa]').forEach((el) => {
    const msg = el.getAttribute('data-wa-text') || 'OFFRES';
    el.setAttribute('href', waLink(msg));
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener');
  });

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

  const sliderEl = document.querySelector('[data-slider]');
  if (sliderEl) {
    const track = sliderEl.querySelector('.slider-track');
    const slides = Array.from(sliderEl.querySelectorAll('.slide'));
    const dotsWrap = sliderEl.querySelector('[data-slider-dots]');
    let index = 0;
    let autoplayId = null;

    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.setAttribute('aria-label', `Aller au message ${i + 1}`);
      if (i === 0) dot.classList.add('is-active');
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });
    const dots = Array.from(dotsWrap.children);

    function render() {
      track.style.transform = `translateX(-${index * 100}%)`;
      slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    }
    function goTo(i) {
      index = (i + slides.length) % slides.length;
      render();
      restartAutoplay();
    }
    function next() { goTo(index + 1); }
    function prev() { goTo(index - 1); }
    function restartAutoplay() {
      if (autoplayId !== null) clearInterval(autoplayId);
      autoplayId = setInterval(next, 6000);
    }

    sliderEl.querySelector('[data-slider-next]').addEventListener('click', next);
    sliderEl.querySelector('[data-slider-prev]').addEventListener('click', prev);
    sliderEl.addEventListener('mouseenter', () => { if (autoplayId !== null) { clearInterval(autoplayId); autoplayId = null; } });
    sliderEl.addEventListener('mouseleave', restartAutoplay);
    restartAutoplay();
  }
});
