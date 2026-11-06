/* Landing: as fitas de Luiz (ciano) e Cleide (coral) convergem no fluxo do
   casal (esmeralda), e a prévia usa os mesmos cálculos do painel. */
(function () {
  'use strict';

  const canvas = document.getElementById('flow');
  const ctx = canvas.getContext('2d');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, visible = true, raf = 0;

  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  /* Linha central da fita: parte de startY e converge até o meio em 62% da largura. */
  function ribbon(startY, colors, phase, time) {
    const strands = W < 640 ? 14 : 24;
    const step = W < 640 ? 14 : 10;
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    colors.forEach(([o, c]) => grad.addColorStop(o, c));
    ctx.strokeStyle = grad;

    const point = (x, s) => {
      const u = x / W, k = smooth(u / .62);
      const center = startY * H * (1 - k) + .5 * H * k;
      const swell = Math.sin(u * 7 + time * .5 + phase) * H * .05;
      const spread = (H * .07) * (1 - k * .55) * (1 + .45 * Math.sin(u * 5 - time * .35 + phase * 2));
      const twist = Math.sin(u * 9 + time * .4 + s * 2.4 + phase);
      return center + swell + s * spread * twist;
    };

    /* Halo largo, depois os fios finos. */
    ctx.globalAlpha = .1;
    ctx.lineWidth = H * .1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = 0; x <= W + step; x += step) { const y = point(x, 0); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();

    ctx.lineWidth = 1.1;
    ctx.globalAlpha = .42;
    for (let i = 0; i < strands; i++) {
      const s = (i / (strands - 1)) * 2 - 1;
      ctx.beginPath();
      for (let x = 0; x <= W + step; x += step) { const y = point(x, s); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function frame(ms) {
    const t = ms / 1000;
    ctx.clearRect(0, 0, W, H);
    ribbon(.2, [[0, '#00D5FF'], [.5, '#00C2E0'], [.8, '#10B981'], [1, '#10B981']], 0, t);
    ribbon(.8, [[0, '#FFB23E'], [.3, '#FF6B4A'], [.62, '#2CC7A0'], [1, '#10B981']], 1.7, t);
  }

  function loop(ms) {
    raf = 0;
    if (!visible || document.getElementById('landing').hidden) return;
    frame(ms);
    raf = requestAnimationFrame(loop);
  }

  function kick() {
    size();
    if (still) { frame(4000); return; }
    if (!raf) raf = requestAnimationFrame(loop);
  }

  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(canvas);
  window.addEventListener('resize', kick);
  window.addEventListener('cfi:landing', kick);
  kick();

  /* ---------- Prévia ---------- */
  const { MES, MES_LONGO } = window.FIN;
  const REF = new Date().getMonth(), ANO = new Date().getFullYear();
  const mesAtual = MES_LONGO[REF].toLowerCase();
  const brl = window.CH.brl;
  const kpi = (l, v, sub) => `<div class="pk"><span>${l}</span><strong>${v}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;

  function preview(p) {
    const kpis = document.getElementById('preview-kpis');
    const legend = document.getElementById('preview-legend');
    const chart = document.getElementById('preview-chart');
    document.getElementById('preview-link').href = '#' + p;
    if (p === 'empresa') {
      const e = window.FIN.empresa(ANO);
      kpis.innerHTML = kpi('Resultado líquido', brl(e.res), e.metaRes ? 'meta de ' + brl(e.metaRes) : 'em ' + ANO)
        + kpi('Total recebido', brl(e.totalRec), e.metaRec ? (e.totalRec / e.metaRec * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% da meta' : '')
        + kpi('Total gasto', brl(e.totalGas), e.tetoDesp ? (e.totalGas / e.tetoDesp * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% do teto' : '');
      legend.innerHTML = '<span><i class="lg-line"></i>Receitas</span><span><i class="lg-bar"></i>Despesas</span>';
      window.CH.annual(chart, {
        labels: MES, long: e.meses.map(m => MES_LONGO[m]),
        line: e.rec, bars: e.gas, lineName: 'Receitas', barName: 'Despesas', active: REF,
        aria: 'Receitas em linha e despesas em colunas, de janeiro a dezembro de ' + ANO
      });
      return;
    }
    const t = window.FIN.totais(p, REF, ANO, 'real');
    kpis.innerHTML = kpi(p === 'casal' ? 'Saldo do casal' : 'Saldo líquido', brl(t.saldo), mesAtual + ' de ' + ANO)
      + kpi('Recebido', brl(t.rec)) + kpi('Gasto', brl(t.gas));
    legend.innerHTML = '<span><i class="lg-line"></i>Recebimentos</span><span><i class="lg-bar"></i>Gastos</span>';
    const s = window.FIN.serieAnual(p, ANO, 'real');
    window.CH.annual(chart, {
      labels: MES, long: MES_LONGO, line: s.map(x => x.rec), bars: s.map(x => x.gas),
      lineName: 'Recebimentos', barName: 'Gastos', active: REF,
      aria: 'Recebimentos em linha e gastos em colunas, de janeiro a dezembro de ' + ANO
    });
  }

  /* Saldos reais do mês atual nos cartões do hero e no passo 2. */
  function saldos() {
    const t = p => window.FIN.totais(p, REF, ANO, 'real');
    const a = t('luiz'), b = t('cleide'), c = t('casal');
    document.querySelectorAll('[data-saldo]').forEach(el => {
      el.textContent = brl({ luiz: a, cleide: b, casal: c }[el.dataset.saldo].saldo);
    });
    document.querySelectorAll('[data-mes-sub]').forEach(el => { el.textContent = 'saldo líquido de ' + mesAtual; });
    document.getElementById('fc-casal-sub').textContent = brl(c.rec) + ' recebidos, ' + brl(c.gas) + ' gastos';
  }
  window.addEventListener('cfi:landing', saldos);
  saldos();

  let current = 'luiz';
  document.getElementById('preview-tabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('#preview-tabs button').forEach(x => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-selected', String(x === b));
    });
    current = b.dataset.p;
    preview(current);
  });
  window.addEventListener('cfi:landing', () => preview(current));
  preview(current);
})();
