// Apparition douce des sections au scroll (fade + léger déplacement),
// pilotée par IntersectionObserver — aucun calcul déclenché par le scroll
// lui-même, uniquement quand une section entre réellement dans l'écran.
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });

document.querySelectorAll('main > section').forEach((section) => {
  revealObserver.observe(section);
});

// Effet glassmorphism sur la nav dès qu'on scrolle.
// Un seul recalcul par frame (via requestAnimationFrame) au lieu de réagir
// à chaque événement "scroll" brut, qui peut se déclencher des dizaines de
// fois par seconde. { passive: true } indique au navigateur qu'on ne bloque
// jamais le scroll, ce qui évite tout à-coup pendant le défilement.
const nav = document.getElementById('site-nav');
let navTicking = false;
window.addEventListener('scroll', () => {
  if (navTicking) return;
  navTicking = true;
  requestAnimationFrame(() => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
    navTicking = false;
  });
}, { passive: true });

// Menu mobile (bouton ☰)
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.querySelector('.nav-links');
navToggle.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

// Défilement animé et personnalisé vers chaque section (courbe douce
// d'accélération/décélération), pour tous les liens internes du site
// (menu, bouton Reservar, boutons du hero) — remplace le saut brut du
// navigateur. Utilise son propre requestAnimationFrame ponctuel qui
// s'arrête dès que la destination est atteinte : ce n'est pas une 2e
// boucle permanente, juste une petite animation autonome et temporaire.
let scrollAnimationId = 0; // à chaque nouvel appel, invalide toute animation encore en cours

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothScrollTo(targetY) {
  const startY = window.scrollY;
  const distance = targetY - startY;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    window.scrollTo(0, targetY);
    return;
  }

  const duration = Math.min(1200, Math.max(500, Math.abs(distance) * 0.6));
  const startTime = performance.now();
  const thisAnimationId = ++scrollAnimationId;

  function step(now) {
    if (thisAnimationId !== scrollAnimationId) return; // une autre animation a pris le relais : on s'arrête
    const t = Math.min((now - startTime) / duration, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Si l'utilisateur scrolle lui-même (molette/trackpad/doigt) pendant qu'une
// animation de clic est en cours, on lui rend immédiatement la main plutôt
// que de continuer à lutter contre son geste.
['wheel', 'touchstart'].forEach((evt) => {
  window.addEventListener(evt, () => { scrollAnimationId++; }, { passive: true });
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    navLinks.classList.remove('open');
    const targetId = link.getAttribute('href');
    const targetEl = document.querySelector(targetId);
    if (targetEl) {
      e.preventDefault();
      smoothScrollTo(targetEl.getBoundingClientRect().top + window.scrollY);
    }
  });
});


// ---------- MENU ----------

const menuData = [
  {
    id: 'cafes',
    label: 'Cafés',
    items: [
      { name: 'Espresso', priceFull: '1,50 €', icon: '☕' },
      { name: 'Café con leche', priceFull: '1,70 €', icon: '☕' },
      { name: 'Cappuccino', priceFull: '2,80 €', icon: '☕' },
      { name: 'Café cortado', priceFull: '1,50 €', icon: '☕' },
      { name: 'Café bombón', priceFull: '1,50 €', icon: '☕' },
      { name: 'Cola Cao', priceFull: '2,10 €', icon: '🍫' },
      { name: 'Leche', priceFull: '1,70 €', icon: '🥛' },
      { name: 'Infusión', priceFull: '1,70 €', icon: '🍵' },
      { name: 'Carajillo', priceFull: '2,20 €', icon: '☕' },
    ]
  },
  {
    id: 'boissons',
    label: 'Bebidas',
    items: [
      { name: 'Agua mineral', priceFull: '1,50 €', icon: '💧' },
      { name: 'Agua grande', priceFull: '2,50 €', icon: '💧' },
      { name: 'Zumo de naranja natural', priceFull: '2,50 €', icon: '🍊' },
      { name: 'Refresco', priceFull: '—', icon: '🥤' },
    ]
  },
  {
    id: 'tapas',
    label: 'Tapas',
    items: [
      { name: 'Ensaladilla', priceHalf: '6,50 €', priceFull: '8,50 €', icon: '🥗' },
      { name: 'Pincho de tortilla', priceFull: '3,50 €', icon: '🍳' },
      { name: 'Patatas bravas', priceHalf: '6,50 €', priceFull: '9,00 €', icon: '🌶️' },
      { name: 'Queso frito', priceHalf: '7,00 €', priceFull: '10,00 €', icon: '🧀' },
      { name: 'Queso plancha', priceHalf: '7,50 €', priceFull: '10,50 €', icon: '🧀' },
      { name: 'Cheese bacon', priceHalf: '7,00 €', priceFull: '10,00 €', icon: '🥓' },
      { name: 'Marinera', priceFull: '3,50 €', icon: '🐟' },
      { name: 'Croquetas', priceFull: '3,00 €', icon: '🧆' },
      { name: 'Magra con tomate', priceHalf: '6,50 €', priceFull: '10,00 €', icon: '🍅' },
      { name: 'Chopitos rebozados', priceHalf: '6,50 €', priceFull: '10,00 €', icon: '🦑' },
      { name: 'Cazuela (gambas, chopitos, mixta)', priceFull: '11,50 €', icon: '🍤' },
      { name: 'Boquerones', priceHalf: '7,00 €', priceFull: '10,50 €', icon: '🐟' },
      { name: 'Mejillones al vapor', priceHalf: '6,50 €', priceFull: '10,50 €', icon: '🦪' },
      { name: 'Calamar andaluza', priceHalf: '6,50 €', priceFull: '13,50 €', icon: '🦑' },
      { name: 'Sepia', priceFull: '15,50 €', icon: '🦑' },
      { name: 'Bacalao Brass', priceHalf: '7,50 €', priceFull: '12,50 €', icon: '🐟' },
      { name: 'Patatas revolconas', priceHalf: '7,50 €', priceFull: '11,50 €', icon: '🥔' },
      { name: 'Torrezno', priceHalf: '7,50 €', priceFull: '12,50 €', icon: '🥓' },
      { name: 'Rabo frito', priceHalf: '6,50 €', priceFull: '9,50 €', icon: '🍖' },
      { name: 'Oreja plancha', priceHalf: '6,50 €', priceFull: '9,50 €', icon: '🍖' },
      { name: 'Caracoles', priceFull: '8,50 €', icon: '🐌' },
      { name: 'Lomo de orza', priceHalf: '6,50 €', priceFull: '9,50 €', icon: '🍖' },
      { name: 'Zamburiña', priceFull: '3,50 €', icon: '🦪' },
      { name: 'Morro frito', priceHalf: '6,50 €', priceFull: '9,50 €', icon: '🍖' },
      { name: 'Secreto ibérico con ajetes', priceHalf: '9,50 €', priceFull: '16,50 €', icon: '🥩' },
      { name: 'Solomillo salsa de setas', priceHalf: '8,50 €', priceFull: '12,50 €', icon: '🥩' },
      { name: 'Pincho de solomillo', priceFull: '5,00 €', icon: '🍢' },
      
   ]
  },
  {
    id: 'ensaladas',
    label: 'Ensaladas',
    items: [
      { name: 'Tomate con ventresca', priceHalf: '8,50 €', priceFull: '13,50 €', icon: '🍅' },
      { name: 'Ensalada mixta', priceHalf: '7,00 €', priceFull: '10,00 €', icon: '🥗' },
      { name: 'Ensalada césar', priceHalf: '7,00 €', priceFull: '10,00 €', icon: '🥗' },
      { name: 'Ensalada de salmón', priceHalf: '12,50 €', priceFull: '15,50 €', icon: '🥗' },
    ]
  },
  {
    id: 'molletes',
    label: 'Molletes',
    items: [
      { name: 'Salmón (crema, nata, huevo)', priceFull: '10,50 €', icon: '🥪' },
      { name: 'Salmón (tomate, queso fresco, aguacate)', priceFull: '10,50 €', icon: '🥪' },
      { name: 'Solomillo (cebolla frita, crema trufa, q. cabra)', priceFull: '10,50 €', icon: '🥪' },
      { name: 'Secreto ibérico (cebolla caramelizada)', priceFull: '10,50 €', icon: '🥪' },
      { name: 'Jamón ibérico (pimientos y ali-oli)', priceFull: '10,50 €', icon: '🥪' },
            { name: 'Solomillo de ternera', priceFull: '10,50 €', icon: '🥪' },
      { name: 'Estofado de rabo', priceFull: '17,00 €', icon: '🍖' },
    ]
  },
    {
    id: 'petits-dejeuners',
    label: 'Desayunos',
    items: [
      { name: 'Tostada con tomate', priceFull: '1,50 €', icon: '🍅' },
      { name: 'Tostada con mantequilla y mermelada', priceFull: '1,50 €', icon: '🍞' },
      { name: 'Tostada salada (2 ingredientes)', priceFull: '3,50 €', icon: '🥪' },
    ]
  },
  {
    id: 'desserts',
    label: 'Postres',
    items: [
      { name: 'Tarta de queso', priceFull: '5,50 €', icon: '🍰' },
      { name: 'Churros con chocolate', priceFull: '5,50 €', icon: '🍫' },
    ]
  }
  
];

function renderMenu() {
  const tabsEl = document.getElementById('menu-tabs');
  const gridEl = document.getElementById('menu-grid');

  menuData.forEach((category, index) => {
    const tab = document.createElement('button');
    tab.className = 'menu-tab' + (index === 0 ? ' active' : '');
    tab.textContent = category.label;
    tab.dataset.category = category.id;
    tab.addEventListener('click', () => showMenuCategory(category.id));
    tabsEl.appendChild(tab);

    const group = document.createElement('div');
    group.className = 'menu-category-group' + (index === 0 ? ' active' : '');
    group.id = 'menu-cat-' + category.id;

    category.items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'menu-card';
      const priceLabel = item.priceHalf
        ? `Media ${item.priceHalf} · Entera ${item.priceFull}`
        : item.priceFull;
      card.innerHTML = `
        <div class="menu-card-icon">${item.icon}</div>
        <div class="menu-card-body">
          <h3>${item.name}</h3>
          ${item.description ? `<p>${item.description}</p>` : ''}
          <span class="menu-card-price">${priceLabel}</span>
        </div>
      `;
      group.appendChild(card);
    });

    gridEl.appendChild(group);
  });
}

function showMenuCategory(categoryId) {
  document.querySelectorAll('.menu-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.category === categoryId);
  });
  document.querySelectorAll('.menu-category-group').forEach((group) => {
    group.classList.toggle('active', group.id === 'menu-cat-' + categoryId);
  });
}

renderMenu();

// ---------- AVIS CLIENTS ----------

const testimonials = [
  { name: 'Luis M. G. P.', rating: 5, date: 'hace 3 semanas', text: 'Establecimiento muy recomendable, he vuelto en más ocasiones y siempre hemos salido satisfechos con lo consumido, trato recibido y precio razonable.' },
  { name: 'Ana', rating: 5, date: 'hace 7 meses', text: 'Comimos genial y a buen precio. Todo lo que pedimos estaba riquísimo. Ideal para compartir. Volveremos.' },
  { name: 'Maica Martinez Denia', rating: 5, date: 'hace 4 meses', text: 'Estamos encantadas con Esteban, el camarero, que siempre nos saca una sonrisa aunque esté muy agobiado. Es un crack. La comida que traen está para chuparse los dedos.' },
  { name: 'Claudia Sánchez Lanau', rating: 5, date: 'hace 4 meses', text: 'El trato agradable y muy atentos los camareros, la comida estaba buenísima, repetiremos más veces, estamos encantados.' },
  { name: 'Rocío Rodiel', rating: 5, date: 'hace un año', text: 'Soy habitual, y quedé maravillada con la croqueta de albahaca, curry y pollo. En general desde los empleados hasta el jefe siempre sobresalientes.' },
  { name: 'Juan Marlo', rating: 5, date: 'hace 9 meses', text: 'Lugar bien situado, cálido y acogedor. Café con leche 👌🏻👌🏻, quién me atendió muy amable y agradable. Volveré, gracias.' },
  { name: 'Ana Martínez', rating: 5, date: 'hace 3 meses', text: 'Atención excelente y la comida muy buena. Raciones caseras, buena cantidad y de calidad. Volvería sin dudarlo 😌' },
  { name: 'Irene', rating: 5, date: 'hace 8 meses', text: 'Cafetería tradicional donde tomar un buen desayuno y también unas excelentes tapas!' },
];

function renderStars(rating) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function renderReviews() {
  const grid = document.getElementById('reviews-grid');

  testimonials.forEach((review) => {
    const card = document.createElement('div');
    card.className = 'review-card';
    card.innerHTML = `
      <div class="review-stars">${renderStars(review.rating)}</div>
      <p class="review-text">"${review.text}"</p>
      <div class="review-footer">
        <span class="review-name">${review.name}</span>
        <span class="review-date">${review.date}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

renderReviews();


// ---------- HORARIO ----------

const hoursData = [
  { day: 'Lunes', hours: '7:00 – 23:30' },
  { day: 'Martes', hours: '7:00 – 23:30' },
  { day: 'Miércoles', hours: '7:00 – 23:30' },
  { day: 'Jueves', hours: '7:00 – 23:30' },
  { day: 'Viernes', hours: '7:00 – 23:30' },
  { day: 'Sábado', hours: '7:00 – 23:30' },
  { day: 'Domingo', hours: 'Cerrado' },
];

function renderHours() {
  const list = document.getElementById('hours-list');
  const todayIndex = (new Date().getDay() + 6) % 7;

  hoursData.forEach((entry, index) => {
    const li = document.createElement('li');
    if (index === todayIndex) li.classList.add('today');
    li.innerHTML = `<span class="hours-day">${entry.day}</span><span>${entry.hours}</span>`;
    list.appendChild(li);
  });
}

renderHours();