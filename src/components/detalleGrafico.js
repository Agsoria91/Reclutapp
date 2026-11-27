// Detalle al apoyar el mouse en un gráfico (solo computadora): valor exacto, % del total
// y, en las columnas por mes, la variación contra la columna anterior.
const num = (t) => { const m = String(t || '').replace(/\./g, '').match(/-?\d+(,\d+)?/); return m ? Number(m[0].replace(',', '.')) : null; };
const fmt = (n) => n.toLocaleString('es-AR');
let caja = null;

function texto(el) {
  const col = el.closest('.cols .col');
  if (col) {
    const grupo = [...col.parentElement.querySelectorAll(':scope > .col')];
    const i = grupo.indexOf(col);
    const v = num(col.querySelector('.col-val')?.textContent);
    if (v == null) return null;
    const total = grupo.reduce((a, c) => a + (num(c.querySelector('.col-val')?.textContent) || 0), 0);
    const ant = i > 0 ? num(grupo[i - 1].querySelector('.col-val')?.textContent) : null;
    const dif = ant != null ? v - ant : null;
    return { t: col.querySelector('.col-lbl')?.textContent?.trim() || '', l: [`${fmt(v)}${total ? ` · ${Math.round((v / total) * 100)}% del total` : ''}`,
      dif != null ? `${dif > 0 ? '▲ +' : dif < 0 ? '▼ ' : '= '}${dif !== 0 ? fmt(dif) : 'sin cambios'}${dif !== 0 && ant ? ` (${dif > 0 ? '+' : ''}${Math.round((dif / ant) * 100)}%)` : ''} vs. anterior` : ''].filter(Boolean), dif };
  }
  const li = el.closest('.bars li');
  if (li) {
    const lbl = li.querySelector('.bars-label')?.textContent?.trim();
    const val = li.querySelector('.bars-val'); if (!lbl || !val) return null;
    const n = num(val.childNodes[0]?.textContent ?? val.textContent);
    const p = val.querySelector('small')?.textContent?.trim();
    const todos = [...li.parentElement.children].map((x) => num(x.querySelector('.bars-val')?.childNodes[0]?.textContent)).filter((x) => x != null);
    const tot = todos.reduce((a, b) => a + b, 0);
    return { t: lbl, l: [`${n != null ? fmt(n) : val.textContent.trim()}${p ? ` · ${p}` : tot && n != null ? ` · ${Math.round((n / tot) * 100)}% del total` : ''}`] };
  }
  return null;
}

export function initDetalleGrafico() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let sobre = null;
  const ocultar = () => { sobre = null; caja?.classList.remove('is-on'); };
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest?.('.cols .col, .bars li');
    if (!el) { if (sobre) ocultar(); return; }
    if (el !== sobre) {
      const d = texto(el); if (!d) return ocultar();
      sobre = el;
      if (!caja) { caja = document.createElement('div'); caja.className = 'detalle-grafico'; caja.setAttribute('role', 'tooltip'); document.body.appendChild(caja); }
      caja.innerHTML = '';
      const b = document.createElement('b'); b.textContent = d.t; caja.appendChild(b);
      d.l.forEach((x, i) => { const s = document.createElement('span'); s.textContent = x; if (i === 1 && d.dif) s.className = d.dif > 0 ? 'is-up' : 'is-down'; caja.appendChild(s); });
      caja.classList.add('is-on');
    }
    const w = caja.offsetWidth, h = caja.offsetHeight;
    caja.style.left = Math.min(e.clientX + 14, innerWidth - w - 10) + 'px';
    caja.style.top = (e.clientY - h - 12 < 8 ? e.clientY + 18 : e.clientY - h - 12) + 'px';
  }, { passive: true });
  window.addEventListener('scroll', ocultar, { passive: true, capture: true });
}
