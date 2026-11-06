/* Página inicial: a prévia e os saldos usam os mesmos cálculos do painel. */
(function () {
  'use strict';

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
