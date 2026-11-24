// Tarjetas desplegables en todas las pestañas: clic en el título contrae o
// despliega. Al abrir la app los gráficos arrancan contraídos; los listados
// principales (los que tienen buscador) arrancan desplegados. El estado se
// recuerda mientras la pestaña del navegador siga abierta, así un filtro
// (que vuelve a dibujar la pantalla) no cierra lo que el usuario abrió.
const abiertos = new Map(); // ruta|título -> true/false
const SIN_PLEGAR = new Set(['usuarios', 'importar', 'login']);
// Contenido principal de la pestaña: arranca desplegado aunque no tenga buscador.
const PRINCIPALES = new Set(['posiciones|Sillas por área y sector']);

const tituloDe = (h) => {
  const c = h.cloneNode(true);
  c.querySelectorAll('small').forEach((s) => s.remove());
  return c.textContent.split(':')[0].replace(/\s+/g, ' ').trim();
};

function tarjetas(root) {
  return [...root.querySelectorAll('.card')].filter((card) => !card.classList.contains('filters') && !card.closest('.m-cuerpo') && card.querySelector('.card-title'));
}

function preparar(root, ruta) {
  for (const card of tarjetas(root)) {
    const h = card.querySelector('.card-title');
    let cab = h; while (cab.parentElement && cab.parentElement !== card) cab = cab.parentElement;
    if (cab.parentElement !== card) continue;
    const clave = `${ruta}|${tituloDe(h)}`;
    if (!abiertos.has(clave)) abiertos.set(clave, PRINCIPALES.has(clave) || !!card.querySelector('input[type="search"]'));
    card.dataset.fold = clave;
    cab.classList.add('fold-head');
    h.classList.add('fold-title');
    if (!h.hasAttribute('tabindex')) { h.tabIndex = 0; h.setAttribute('role', 'button'); }
    h.setAttribute('aria-expanded', String(abiertos.get(clave)));
    card.classList.toggle('is-folded', !abiertos.get(clave));
  }
  botonTodo(root);
}

function botonTodo(root) {
  const cards = root.querySelectorAll('[data-fold]');
  let btn = root.querySelector('[data-fold-all]');
  if (!cards.length) { btn?.remove(); return; }
  if (!btn) {
    const head = root.querySelector('.page-head');
    if (!head) return;
    let acts = head.querySelector('.head-actions');
    if (!acts) { acts = document.createElement('div'); acts.className = 'head-actions'; head.appendChild(acts); }
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn'; btn.dataset.foldAll = '';
    acts.prepend(btn);
  }
  const algunoCerrado = [...cards].some((c) => c.classList.contains('is-folded'));
  const txt = algunoCerrado ? 'Desplegar todo' : 'Contraer todo';
  if (btn.textContent !== txt) btn.textContent = txt;
}

function alternar(card, abrir) {
  abiertos.set(card.dataset.fold, abrir);
  card.classList.toggle('is-folded', !abrir);
  card.querySelector('.fold-title')?.setAttribute('aria-expanded', String(abrir));
}

export function initFolds(root, rutaActual) {
  let pendiente = false;
  const correr = () => {
    pendiente = false;
    const ruta = rutaActual();
    const view = root.querySelector('#view');
    if (!view || SIN_PLEGAR.has(ruta)) return;
    preparar(view, ruta);
  };
  new MutationObserver(() => { if (!pendiente) { pendiente = true; queueMicrotask(correr); } })
    .observe(root, { childList: true, subtree: true });
  root.addEventListener('click', (e) => {
    const view = root.querySelector('#view');
    if (!view) return;
    const all = e.target.closest('[data-fold-all]');
    if (all) {
      const cards = [...view.querySelectorAll('[data-fold]')];
      const abrir = cards.some((c) => c.classList.contains('is-folded'));
      cards.forEach((c) => alternar(c, abrir));
      botonTodo(view);
      return;
    }
    const t = e.target.closest('.fold-title');
    if (!t || e.target.closest('a, button, input, select, label')) return;
    const card = t.closest('[data-fold]');
    if (!card) return;
    alternar(card, card.classList.contains('is-folded'));
    botonTodo(view);
  }, true);
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('fold-title')) { e.preventDefault(); e.target.click(); }
  });
}
