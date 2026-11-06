/* Fundo da tela de entrada: duas fitas que convergem em um único fluxo.
   Só desenha enquanto o canvas está visível (ele some depois do login). */
(function () {
  'use strict';

  const canvas = document.getElementById('flow');
  const ctx = canvas.getContext('2d');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, visible = false, raf = 0;

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
    if (!visible) return;
    frame(ms);
    raf = requestAnimationFrame(loop);
  }

  function kick() {
    if (!visible) return;
    size();
    if (still) { frame(4000); return; }
    if (!raf) raf = requestAnimationFrame(loop);
  }

  new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }).observe(canvas);
  window.addEventListener('resize', kick);
})();
