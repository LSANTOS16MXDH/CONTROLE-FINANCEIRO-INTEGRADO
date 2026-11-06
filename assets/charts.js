/* Gráficos em SVG, sem dependências. Cada um redesenha na largura real do
   contêiner, então o texto nunca escala junto com o desenho. */
(function () {
  'use strict';

  let uid = 0;
  const tip = () => document.getElementById('tip');
  const brl = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const curto = v => {
    const a = Math.abs(v);
    if (a >= 1000) return (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return Math.round(v).toLocaleString('pt-BR');
  };

  /* Quantas divisões deixam todos os rótulos do eixo em números redondos. */
  function tickCount(max) {
    const n = max / Math.pow(10, Math.floor(Math.log10(max)));
    return { 1: 4, 1.5: 3, 2: 4, 3: 3, 4: 4, 5: 5, 6: 3, 8: 4, 10: 5 }[n] || 4;
  }

  function niceMax(v) {
    v = Math.max(v, 100); // eixo legível mesmo sem dados
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const s = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10;
    return s * p;
  }

  const observer = 'ResizeObserver' in window ? new ResizeObserver(entries => {
    entries.forEach(e => {
      const el = e.target;
      const w = Math.round(el.clientWidth);
      if (el.__draw && w && w !== el.__w) { el.__w = w; el.__draw(false); }
    });
  }) : null;

  function mount(el, draw) {
    if (!el) return;
    el.__w = Math.round(el.clientWidth);
    el.__draw = draw;
    if (observer) observer.observe(el);
    draw(true);
  }

  function showTip(evt, html) {
    const t = tip();
    t.innerHTML = html;
    t.hidden = false;
    const pad = 14, r = t.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY - r.height - pad;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y < 8) y = evt.clientY + pad;
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = y + 'px';
  }
  const hideTip = () => { tip().hidden = true; };

  const row = (cor, nome, val) =>
    `<div class="tip-row"><i style="background:${cor}"></i><span>${nome}</span><b>${val}</b></div>`;

  function bindBands(el, tips, onBand) {
    el.querySelectorAll('[data-band]').forEach(b => {
      const i = Number(b.dataset.band);
      b.addEventListener('pointermove', e => { showTip(e, tips(i)); if (onBand) onBand(i); });
      b.addEventListener('pointerleave', () => { hideTip(); if (onBand) onBand(-1); });
    });
  }

  function wavePath(pts) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
      d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
    }
    return d;
  }

  const roundedTop = (x, y, w, h, r) => {
    const rr = Math.min(r, w / 2, h);
    return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
  };

  function gridAxis(W, H, m, max) {
    const ticks = tickCount(max);
    let s = '';
    for (let i = 0; i <= ticks; i++) {
      const v = (max / ticks) * i, y = H - m.b - (v / max) * (H - m.t - m.b);
      s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>`;
      s += `<text class="tick" x="${m.l - 8}" y="${y + 4}" text-anchor="end">${curto(v)}</text>`;
    }
    return s;
  }

  const GRADS = {
    solar: ['#FFB23E', '#F2643D'],
    emerald: ['#2BE0A8', '#0E9F8E'],
    cyan: ['#25DCFF', '#0891D1']
  };
  const defGrad = (id, [a, b]) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

  /* Recebimentos em onda, gastos em colunas, ambos na mesma escala. */
  function annual(el, o) {
    mount(el, anim => {
      const W = el.clientWidth || 600, H = Number(el.dataset.h) || 320;
      const compact = W < 520;
      const m = { t: 14, r: 10, b: 26, l: compact ? 40 : 50 };
      const max = niceMax(Math.max(...o.line, ...o.bars));
      const iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.labels.length, band = iw / n;
      const yOf = v => m.t + ih - (v / max) * ih;
      const id = 'c' + (++uid);
      const bw = Math.min(compact ? 11 : 20, band * .5);
      const pts = o.line.map((v, i) => [m.l + band * i + band / 2, yOf(v)]);
      const area = wavePath(pts) + ` L${pts[n - 1][0]},${m.t + ih} L${pts[0][0]},${m.t + ih} Z`;
      let bars = '', labels = '', hits = '';
      o.bars.forEach((v, i) => {
        const x = m.l + band * i + (band - bw) / 2, y = yOf(v), h = m.t + ih - y;
        bars += `<path class="${anim ? 'grow' : ''} ${o.active === i ? '' : 'soft'}" style="--i:${i}" fill="url(#${id}b)" d="${roundedTop(x, y, bw, h, 4)}"/>`;
        const lab = compact ? o.labels[i][0] : o.labels[i];
        labels += `<text class="tick ${o.active === i ? 'tick-on' : ''}" x="${m.l + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${lab}</text>`;
        hits += `<rect data-band="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>`;
      });
      const dots = pts.map((p, i) => `<circle class="wave-dot" data-dot="${i}" cx="${p[0]}" cy="${p[1]}" r="5" fill="#fff" stroke="#0891D1" stroke-width="2"${o.active === i ? '' : ' opacity="0"'}/>`).join('');
      el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${o.aria}">
        <defs>${defGrad(id + 'b', GRADS.solar)}
          <linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00C8F0"/><stop offset=".55" stop-color="#0AB6C8"/><stop offset="1" stop-color="#10B981"/></linearGradient>
          <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00C8F0" stop-opacity=".16"/><stop offset="1" stop-color="#10B981" stop-opacity="0"/></linearGradient>
          <filter id="${id}g" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
        </defs>
        ${gridAxis(W, H, m, max)}
        <path d="${area}" fill="url(#${id}a)" class="${anim ? 'fadein' : ''}"/>
        ${bars}
        <line class="cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" opacity="0"/>
        <path d="${wavePath(pts)}" fill="none" stroke="url(#${id}l)" stroke-width="7" opacity=".35" filter="url(#${id}g)"/>
        <path d="${wavePath(pts)}" fill="none" stroke="url(#${id}l)" stroke-width="2.5" stroke-linecap="round" class="${anim ? 'fadein' : ''}"/>
        ${dots}${labels}${hits}
      </svg>`;
      const cross = el.querySelector('.cross');
      bindBands(el, i => `<div class="tip-h">${o.long[i]}</div>${row('#0AB6C8', o.lineName, brl(o.line[i]))}${row('#F2643D', o.barName, brl(o.bars[i]))}${row('#94A3B8', 'Saldo', brl(o.line[i] - o.bars[i]))}`, i => {
        el.querySelectorAll('[data-dot]').forEach((c, k) => c.setAttribute('opacity', k === i || (i < 0 && k === o.active) ? '1' : '0'));
        if (i < 0) { cross.setAttribute('opacity', '0'); return; }
        const x = pts[i][0];
        cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', '1');
      });
    });
  }

  /* Planejado (cinza) ao lado do realizado (cor). */
  function pairs(el, o) {
    mount(el, anim => {
      const W = el.clientWidth || 300, H = Number(el.dataset.h) || 220;
      const m = { t: 10, r: 6, b: 24, l: 40 };
      const max = niceMax(Math.max(...o.plan, ...o.real, 1));
      const iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.labels.length, band = iw / n;
      const yOf = v => m.t + ih - (v / max) * ih, id = 'c' + (++uid);
      const bw = Math.min(14, (band - 8) / 2);
      let s = '', labels = '', hits = '';
      o.real.forEach((v, i) => {
        const x0 = m.l + band * i + (band - bw * 2 - 2) / 2;
        const yp = yOf(o.plan[i]), yr = yOf(v);
        s += `<path class="${anim ? 'grow' : ''}" style="--i:${i}" fill="#CBD5E1" d="${roundedTop(x0, yp, bw, m.t + ih - yp, 4)}"/>`;
        if (v > 0) s += `<path class="${anim ? 'grow' : ''}" style="--i:${i}" fill="url(#${id})" d="${roundedTop(x0 + bw + 2, yr, bw, m.t + ih - yr, 4)}"/>`;
        labels += `<text class="tick" x="${m.l + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${o.labels[i]}</text>`;
        hits += `<rect data-band="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>`;
      });
      el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${o.aria}"><defs>${defGrad(id, GRADS[o.tone])}</defs>
        ${gridAxis(W, H, m, max)}${s}${labels}${hits}</svg>`;
      bindBands(el, i => `<div class="tip-h">${o.long[i]}</div>${row('#CBD5E1', 'Planejado', brl(o.plan[i]))}${row(GRADS[o.tone][1], o.realName, brl(o.real[i]))}`);
    });
  }

  /* Onda simples com área luminosa. */
  function wave(el, o) {
    mount(el, anim => {
      const W = el.clientWidth || 300, H = Number(el.dataset.h) || 220;
      const m = { t: 14, r: 14, b: 24, l: 44 };
      const max = niceMax(Math.max(...o.values));
      const iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.values.length;
      const xOf = i => m.l + (iw / (n - 1)) * i, yOf = v => m.t + ih - (v / max) * ih, id = 'c' + (++uid);
      const pts = o.values.map((v, i) => [xOf(i), yOf(v)]);
      const area = wavePath(pts) + ` L${xOf(n - 1)},${m.t + ih} L${xOf(0)},${m.t + ih} Z`;
      const band = iw / (n - 1);
      const last = pts[n - 1];
      el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${o.aria}">
        <defs>
          <linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${o.from}"/><stop offset="1" stop-color="${o.to}"/></linearGradient>
          <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.to}" stop-opacity=".28"/><stop offset="1" stop-color="${o.from}" stop-opacity="0"/></linearGradient>
          <filter id="${id}g" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
        </defs>
        ${gridAxis(W, H, m, max)}
        <path d="${area}" fill="url(#${id}a)" class="${anim ? 'fadein' : ''}"/>
        <path d="${wavePath(pts)}" fill="none" stroke="url(#${id}l)" stroke-width="7" opacity=".35" filter="url(#${id}g)"/>
        <path d="${wavePath(pts)}" fill="none" stroke="url(#${id}l)" stroke-width="2.5" stroke-linecap="round"/>
        <circle data-mk cx="${last[0]}" cy="${last[1]}" r="5" fill="#fff" stroke="${o.to}" stroke-width="2"/>
        ${o.labels.map((l, i) => `<text class="tick" x="${xOf(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${l}</text>`).join('')}
        ${pts.map((p, i) => `<rect data-band="${i}" x="${Math.max(m.l, p[0] - band / 2)}" y="${m.t}" width="${(i === 0 || i === n - 1) ? band / 2 : band}" height="${ih}" fill="transparent"/>`).join('')}
      </svg>`;
      const mk = el.querySelector('[data-mk]');
      bindBands(el, i => `<div class="tip-h">${o.long[i]}</div>${row(o.to, o.name, brl(o.values[i]))}`, i => {
        const p = pts[i < 0 ? n - 1 : i];
        mk.setAttribute('cx', p[0]); mk.setAttribute('cy', p[1]);
      });
    });
  }

  /* Colunas que aceitam valor negativo, ancoradas no zero. */
  function columns(el, o) {
    mount(el, anim => {
      const W = el.clientWidth || 300, H = Number(el.dataset.h) || 260;
      const m = { t: 22, r: 8, b: 24, l: 44 };
      const hi = Math.max(...o.values, 0), lo = Math.min(...o.values, 0);
      const max = niceMax(hi), span = max - lo;
      const iw = W - m.l - m.r, ih = H - m.t - m.b, n = o.values.length, band = iw / n;
      const yOf = v => m.t + ih - ((v - lo) / span) * ih, id = 'c' + (++uid);
      const bw = Math.min(24, band * .46);
      let grid = '';
      const ticks = tickCount(max);
      for (let i = 0; i <= ticks; i++) {
        const v = (max / ticks) * i, y = yOf(v);
        grid += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="tick" x="${m.l - 8}" y="${y + 4}" text-anchor="end">${curto(v)}</text>`;
      }
      const best = o.values.indexOf(hi);
      let s = '', labels = '', hits = '';
      o.values.forEach((v, i) => {
        const x = m.l + band * i + (band - bw) / 2, y0 = yOf(0), y = yOf(Math.abs(v) * Math.sign(v));
        if (v >= 0) s += `<path class="${anim ? 'grow' : ''}" style="--i:${i}" fill="url(#${id})" d="${roundedTop(x, y, bw, y0 - y, 4)}"/>`;
        else s += `<rect x="${x}" y="${y0}" width="${bw}" height="${y - y0}" rx="4" fill="#F2643D"/>`;
        if (i === best && hi > 0) s += `<text class="val" x="${x + bw / 2}" y="${y - 7}" text-anchor="middle">${curto(v)}</text>`;
        labels += `<text class="tick" x="${m.l + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${o.labels[i]}</text>`;
        hits += `<rect data-band="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>`;
      });
      el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${o.aria}"><defs>${defGrad(id, GRADS[o.tone])}</defs>${grid}${s}${labels}${hits}</svg>`;
      bindBands(el, i => `<div class="tip-h">${o.long[i]}</div>${row(GRADS[o.tone][1], o.name, brl(o.values[i]))}`);
    });
  }

  /* Rosca com 2px de respiro entre os segmentos. */
  function donut(el, o) {
    const size = o.size || 180, sw = o.stroke || 16, r = (size - sw) / 2, c = 2 * Math.PI * r, id = 'c' + (++uid);
    const total = o.segs.reduce((s, g) => s + Math.max(0, g.val), 0) || 1;
    let off = 0, defs = '', arcs = '';
    const multi = o.segs.filter(g => g.val > 0).length > 1;
    o.segs.forEach((g, i) => {
      const v = Math.max(0, g.val);
      if (!v) return;
      const len = (v / total) * c, gap = multi ? Math.min(sw * .55 + 2, len * .4) : 0;
      defs += `<linearGradient id="${id}${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g.grad[0]}"/><stop offset="1" stop-color="${g.grad[1]}"/></linearGradient>`;
      arcs += `<circle data-seg="${i}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id}${i})" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${Math.max(.01, len - gap)} ${c - Math.max(.01, len - gap)}" stroke-dashoffset="${-off - gap / 2}"/>`;
      off += len;
    });
    el.innerHTML = `<div class="donut" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${o.aria}" style="transform:rotate(-90deg)"><defs>${defs}</defs>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EEF1F6" stroke-width="${sw}"/>${arcs}</svg>
      <div class="donut-c">${o.center}</div></div>`;
    el.querySelectorAll('[data-seg]').forEach(a => {
      const g = o.segs[Number(a.dataset.seg)];
      a.addEventListener('pointermove', e => showTip(e, row(g.grad[1], g.nome, brl(g.val) + ' · ' + Math.round(g.val / total * 100) + '%')));
      a.addEventListener('pointerleave', hideTip);
    });
  }

  window.CH = { annual, pairs, wave, columns, donut, brl, hideTip };
})();
