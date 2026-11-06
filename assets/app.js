/* Rotas, telas e formulários do painel. */
(function () {
  'use strict';

  const F = window.FIN, C = window.CH, A = window.AUTH;
  const { MES, MES_LONGO, PROFILES } = F;
  const brl = C.brl;
  const brl2 = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num2 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBR = iso => (iso ? iso.split('-').reverse().join('/') : '-');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const SAIDA_FORMAS = ['Crédito', 'Débito', 'Débito Aut.', 'PIX', 'Transferência', 'Boleto'];
  const ENTRADA_FORMAS = ['PIX', 'Transferência', 'Boleto', 'Dinheiro'];
  const TIPOS = ['Único', 'Recorrente', 'Parcelado'];
  const EMP_ENTRADA = ['Boleto', 'Transferência', 'PIX Corp'];
  const EMP_SAIDA = ['PIX Corp', 'Crédito PJ', 'Débito Aut.', 'Boleto', 'Transferência'];
  const CARTOES_CASA = ['PICPAY LUIZ', 'PICPAY CLEIDE', 'INTER LUIZ', 'NUBANK CLEIDE'];

  const ui = {
    month: new Date().getMonth(), year: new Date().getFullYear(), mode: 'real', card: {}, catIn: {}, catOut: {},
    drafts: {}, sort: {}, empresaAba: 'todas', lastProfile: 'luiz', lastLanc: 'luiz-lancamentos', relatorio: 'luiz'
  };

  const ROUTES = {
    luiz: { dash: 'luiz', perfil: 'luiz', title: 'Dashboard de Luiz' },
    'luiz-lancamentos': { lanc: 'luiz', perfil: 'luiz', title: 'Lançamentos de Luiz' },
    cleide: { dash: 'cleide', perfil: 'cleide', title: 'Dashboard de Cleide' },
    'cleide-lancamentos': { lanc: 'cleide', perfil: 'cleide', title: 'Lançamentos de Cleide' },
    casal: { dash: 'casal', perfil: 'casal', title: 'Dashboard do casal' },
    'casa-lancamentos': { lanc: 'casa', perfil: 'casal', title: 'Gastos da casa' },
    empresa: { emp: true, perfil: 'empresa', title: 'Painel executivo' },
    'empresa-lancamentos': { lanc: 'empresa', perfil: 'empresa', title: 'Lançamentos da empresa' },
    plano: { plano: true, title: 'Plano de contas' },
    relatorios: { rel: true, title: 'Relatórios' },
    conta: { conta: true, title: 'Minha conta' }
  };
  const PERFIS = [['luiz', 'Luiz', 'luiz', 'luiz-lancamentos'], ['cleide', 'Cleide', 'cleide', 'cleide-lancamentos'], ['casal', 'Casal', 'casal', 'casa-lancamentos'], ['empresa', 'Empresa', 'empresa', 'empresa-lancamentos']];

  /* ---------- Componentes ---------- */
  const IC = {
    card: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h3"/></svg>',
    check: '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6.5 5 9.5 10 3"/></svg>',
    clock: '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="6" r="4.6"/><path d="M6 3.4V6l1.8 1"/></svg>',
    x: '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m3 3 6 6M9 3l-6 6"/></svg>',
    warn: '<svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 1.5 11 10.5H1z"/><path d="M6 5v2.4M6 9h0"/></svg>'
  };

  const opts = (list, sel) => list.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`;
  }).join('');

  const select = (id, label, list, sel, cls) =>
    `<label class="sel ${cls || ''}" for="${id}"><span>${label}</span><select id="${id}" data-ui="${id}">${opts(list, sel)}</select></label>`;

  const monthSelect = () => select('sel-month', 'Mês', MES_LONGO.map((m, i) => [i, m.toUpperCase()]), ui.month);

  const pageHead = (title, right) => `<header class="pagehead card"><h1>${title}</h1>${right ? `<div class="pagehead-r">${right}</div>` : ''}</header>`;

  const modeToggle = () => `<div class="seg" role="group" aria-label="Valores considerados">
    <button data-mode="real" class="${ui.mode === 'real' ? 'on' : ''}" aria-pressed="${ui.mode === 'real'}">Somente realizado</button>
    <button data-mode="prev" class="${ui.mode === 'prev' ? 'on' : ''}" aria-pressed="${ui.mode === 'prev'}">Realizados + previstos</button></div>`;

  const yearSelect = () => select('sel-year', 'Ano', F.anos(), ui.year);

  const progress = (nome, txt, pct, tone, flag) => `<div class="prog">
    <div class="prog-h"><span>${esc(nome)}</span><b>${txt}</b></div>
    <div class="prog-t"><i class="tone-${tone}" style="width:${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct))}%"></i></div>
    ${flag ? `<div class="prog-flag">${IC.warn}${flag}</div>` : ''}
  </div>`;

  const metaTxt = (v, alvo, vazio) => `${brl(v)} / ${alvo > 0 ? brl(alvo) : vazio}`;
  const pctDe = (v, alvo) => (alvo > 0 ? v / alvo * 100 : 0);
  const aviso = (txt, href, acao) => `<p class="notice">${txt} <a href="#${href}">${acao}</a></p>`;

  const footer = t => `<footer class="pagefoot">Plataforma de Gestão Financeira — ${t}</footer>`;

  /* ---------- Dashboard pessoal e do casal ---------- */
  function renderDash(p) {
    const casal = p === 'casal';
    const titulo = casal ? 'Dashboard financeiro do casal — Cleide &amp; Luiz' : 'Dashboard financeiro pessoal — ' + PROFILES[p].nome;
    const m = ui.month, y = ui.year, mode = ui.mode;
    const t = F.totais(p, m, y, mode);
    const desp = F.despesas(p, m, y, mode).filter(d => d.val > 0);
    const maxDesp = Math.max(...desp.map(d => d.val), 1);
    const metas = casal ? [] : F.metas(p, m, y, mode);
    const serie = F.serieAnual(p, y, mode);

    const cards = casal ? Object.keys(F.CASAL_CARDS) : PROFILES[p].cartoes;
    if (!cards.includes(ui.card[p])) ui.card[p] = cards[0];
    const fat = F.faturas(p, ui.card[p], y, mode);

    const catsIn = casal ? [['luiz', 'LUIZ SANTOS'], ['cleide', 'CLEIDE NASCIMENTO']] : PROFILES[p].catIn;
    const catsOut = casal ? F.casalGrupos().map(g => g.nome) : PROFILES[p].catOut;
    const inVals = casal ? catsIn.map(c => c[0]) : catsIn;
    if (!inVals.includes(ui.catIn[p])) ui.catIn[p] = inVals[0];
    if (!catsOut.includes(ui.catOut[p])) ui.catOut[p] = catsOut[0];

    const pctSaldo = t.rec > 0 ? Math.round(Math.max(0, t.saldo) / t.rec * 100) : 0;

    $('#view').innerHTML = `
      ${pageHead(titulo, modeToggle() + yearSelect())}
      ${t.rec === 0 && t.gas === 0 ? aviso(`Nenhum lançamento em ${MES_LONGO[m].toLowerCase()} de ${y}.`, casal ? 'casa-lancamentos' : p + '-lancamentos', 'Fazer um lançamento') : ''}
      <div class="dash-grid">
        <section class="card panel" aria-label="Análise do mês">
          <div class="panel-h"><h2>Análise do mês${casal ? ' (casal)' : ''}</h2>${monthSelect()}</div>
          <div class="donut-wrap" id="ch-donut"></div>
          <div class="donut-legend">
            <span><i style="background:#10B981"></i>Saldo ${pctSaldo}%</span>
            <span><i style="background:#F2643D"></i>Gastos ${t.rec > 0 ? Math.min(100, Math.round(t.gas / t.rec * 100)) : 0}%</span>
          </div>
          <div class="kpi-duo">
            <div class="kpi"><span>${casal ? 'Vocês planejaram / receberam' : 'Planejou / recebeu'}</span><strong>${brl(t.rec)}</strong><i class="kpi-mark up" aria-hidden="true"></i></div>
            <div class="kpi"><span>${casal ? 'Vocês planejaram / gastaram' : 'Planejou / gastou'}</span><strong>${brl(t.gas)}</strong><i class="kpi-mark down" aria-hidden="true"></i></div>
          </div>
          ${casal ? '' : `<h3 class="sub">Meta vs real (centros de custo)</h3>
          <div class="progs">${metas.map(c => progress(c.nome, metaTxt(c.real, c.meta, 'sem meta'), pctDe(c.real, c.meta), 'cyan')).join('') || '<p class="muted">Defina as metas em <a href="#plano">Plano de Contas</a>.</p>'}</div>`}
          <h3 class="sub">Despesas por categoria${casal ? ' (conjunto)' : ''}</h3>
          <div class="progs">${desp.map(d => progress(d.nome, brl(d.val), d.val / maxDesp * 100, d.nome.startsWith('INVEST') ? 'cyan' : 'solar')).join('') || '<p class="muted">Sem despesas neste mês.</p>'}</div>
        </section>

        <section class="card panel" aria-label="Análise evolutiva">
          <div class="panel-h"><h2>Análise evolutiva${casal ? ' (casal)' : ' (anual)'}</h2>
            <span class="panel-note">${casal ? 'Gastos vs entrada líquida do casal' : 'Recebimentos (linha) vs gastos (colunas)'}</span></div>
          <div class="legend"><span><i class="lg-line"></i>${casal ? 'Entrada líquida' : 'Recebimentos'}</span><span><i class="lg-bar"></i>Gastos</span></div>
          <div class="chart" id="ch-annual" data-h="330"></div>
          <div class="evo-grid">
            <div class="evo">
              <div class="evo-h"><h3>Evolução recebimento</h3>${select('sel-catin', casal ? 'Origem' : 'Categoria', catsIn, ui.catIn[p], 'sel-sm')}</div>
              <div class="chart" id="ch-in" data-h="210"></div>
              <div class="legend sm"><span><i class="lg-sq" style="background:#CBD5E1"></i>Planejado</span><span><i class="lg-sq" style="background:#10B981"></i>Recebido</span></div>
            </div>
            <div class="evo">
              <div class="evo-h"><h3>Evolução gasto</h3>${select('sel-catout', 'Categoria', catsOut, ui.catOut[p], 'sel-sm')}</div>
              <div class="chart" id="ch-out" data-h="210"></div>
              <div class="legend sm"><span><i class="lg-sq" style="background:#CBD5E1"></i>Planejado</span><span><i class="lg-sq" style="background:#F2643D"></i>Gasto</span></div>
            </div>
          </div>
        </section>

        <section class="card panel" aria-label="Cartão de crédito">
          <div class="panel-h"><h2 class="withicon">${IC.card}${casal ? 'Cartões do casal' : 'Cartão de crédito'}</h2>${select('sel-card', 'Cartão', cards, ui.card[p])}</div>
          <h3 class="sub first">${casal ? 'Consolidado de faturas' : 'Faturas mensais (fatura vs limite)'}</h3>
          <div class="progs tight">${fat.meses.map((v, i) => `<div class="${i === m ? 'prog-on' : ''}">${progress(MES[i], metaTxt(v, fat.limite, 'sem limite'), pctDe(v, fat.limite), 'cyan', fat.limite > 0 && v > fat.limite ? 'Acima do limite' : '')}</div>`).join('')}</div>
        </section>
      </div>
      ${footer(casal ? 'Contas conjuntas do casal' : PROFILES[p].nome)}`;

    C.donut($('#ch-donut'), {
      size: 184, stroke: 15,
      aria: `Saldo de ${brl(t.saldo)}: ${brl(t.gas)} gastos de ${brl(t.rec)} recebidos`,
      segs: [
        { nome: 'Saldo', val: Math.max(0, t.saldo), grad: ['#2BE0A8', '#0E9F8E'] },
        { nome: 'Gastos', val: t.gas, grad: ['#FFB23E', '#F2643D'] }
      ],
      center: `<small>${casal ? 'Saldo casal' : 'Saldo líquido'}</small><strong>${brl(t.saldo)}</strong>`
    });
    C.annual($('#ch-annual'), {
      labels: MES, long: MES_LONGO.map(x => `${x} de ${y}`),
      line: serie.map(x => x.rec), bars: serie.map(x => x.gas),
      lineName: casal ? 'Entrada líquida' : 'Recebimentos', barName: 'Gastos', active: m,
      aria: `Recebimentos em linha e gastos em colunas por mês de ${y}. A tabela completa está em Relatórios.`
    });
    const evo = (el, nome, kind, tone, realName) => {
      const d = F.evolucaoCategoria(p, nome, kind, m, y, mode);
      C.pairs(el, {
        labels: d.meses.map(i => MES[i][0]), long: d.meses.map(i => MES_LONGO[i]),
        plan: d.plan, real: d.real, tone, realName,
        aria: `Planejado contra ${realName.toLowerCase()} nos seis meses até ${MES_LONGO[m]}`
      });
    };
    evo($('#ch-in'), ui.catIn[p], 'in', 'emerald', 'Recebido');
    evo($('#ch-out'), ui.catOut[p], 'out', 'solar', 'Gasto');
  }

  /* ---------- Painel executivo ---------- */
  function renderEmpresa() {
    const e = F.empresa(ui.year);
    const pct = (a, b) => (!b ? '-' : '') || (a / b * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    const labels = e.meses.map(m => MES[m][0]), long = e.meses.map(m => MES_LONGO[m]);
    const mixLegend = segs => `<div class="donut-legend">${segs.map((s, i) => `<span><i style="background:${s.c}"></i>${s.nome} ${brl(s.val)}</span>`).join('')}</div>`;
    const recSegs = e.mixRec.map((s, i) => Object.assign(s, { grad: i ? ['#FFB23E', '#F2643D'] : ['#2BE0A8', '#0E9F8E'], c: i ? '#F2643D' : '#10B981' }));
    const despSegs = e.mixDesp.map((s, i) => Object.assign(s, { grad: i === 0 ? ['#FFB23E', '#F2643D'] : i === 1 ? ['#25DCFF', '#0891D1'] : ['#CBD5E1', '#94A3B8'], c: i === 0 ? '#F2643D' : i === 1 ? '#0891D1' : '#94A3B8' }));
    const metaOk = e.res >= e.metaRes;
    const vazio = e.totalRec === 0 && e.totalGas === 0 && e.aReceber === 0 && e.aPagar === 0;

    $('#view').innerHTML = `
      ${pageHead('Dashboard financeiro geral empresarial — Painel executivo', yearSelect())}
      ${vazio ? aviso(`Nenhum lançamento em ${ui.year}.`, 'empresa-lancamentos', 'Fazer um lançamento') : ''}
      <div class="emp-top">
        <section class="card panel">
          <div class="panel-h"><h2>Receitas</h2></div>
          <div class="kpi-stack">
            <div class="kpi"><span>Total recebido</span><strong>${brl(e.totalRec)}</strong><i class="kpi-mark up"></i></div>
            <div class="kpi"><span>Meta de receitas</span><strong>${brl(e.metaRec)}</strong><i class="kpi-mark info"></i></div>
            <div class="kpi"><span>% atingimento</span><strong>${pct(e.totalRec, e.metaRec)}</strong><i class="kpi-mark up"></i></div>
          </div>
          <div class="donut-wrap" id="ch-mix-r"></div>${mixLegend(recSegs)}
        </section>
        <section class="card panel"><div class="panel-h"><h2>Evolução receitas</h2></div><div class="chart" id="ch-rec" data-h="330"></div></section>
        <section class="card panel">
          <div class="panel-h"><h2>Despesas</h2></div>
          <div class="kpi-stack">
            <div class="kpi"><span>Total gasto</span><strong>${brl(e.totalGas)}</strong><i class="kpi-mark down"></i></div>
            <div class="kpi"><span>Meta / limite teto</span><strong>${brl(e.tetoDesp)}</strong><i class="kpi-mark info"></i></div>
            <div class="kpi"><span>% controle</span><strong>${pct(e.totalGas, e.tetoDesp)}</strong><i class="kpi-mark down"></i></div>
          </div>
          <div class="donut-wrap" id="ch-mix-d"></div>${mixLegend(despSegs)}
        </section>
        <section class="card panel"><div class="panel-h"><h2>Evolução despesas</h2></div><div class="chart" id="ch-desp" data-h="330"></div></section>
      </div>
      <div class="emp-bottom">
        <section class="card panel"><div class="panel-h"><h2>Resultado &amp; lucratividade mensal</h2></div><div class="chart" id="ch-res" data-h="280"></div></section>
        <section class="card panel"><div class="panel-h"><h2>Contas a receber vs pagar</h2></div>
          <div class="kpi-stack">
            <div class="kpi"><span>A receber</span><strong>${brl(e.aReceber)}</strong><i class="kpi-mark up"></i></div>
            <div class="kpi"><span>A pagar</span><strong>${brl(e.aPagar)}</strong><i class="kpi-mark down"></i></div>
            <div class="kpi"><span>Saldo projetado</span><strong>${brl(e.aReceber - e.aPagar)}</strong><i class="kpi-mark info"></i></div>
          </div>
        </section>
        <section class="card panel"><div class="panel-h"><h2>Resultado consolidado &amp; saldo</h2></div>
          <div class="kpi-duo">
            <div class="kpi"><span>Resultado líquido</span><strong>${brl(e.res)}</strong><i class="kpi-mark up"></i></div>
            <div class="kpi"><span>Meta resultado</span><strong>${brl(e.metaRes)}</strong><i class="kpi-mark info"></i></div>
          </div>
          ${e.metaRes > 0 ? `<p class="meta-line">${metaOk ? IC.check + ' Meta de resultado atingida' : `Faltam ${brl(e.metaRes - e.res)} para a meta`}</p>` : '<p class="meta-line">Defina as metas em&nbsp;<a href="#plano">Plano de Contas</a>.</p>'}
          <h3 class="sub">Fluxo de saldo acumulado</h3>
          <div class="chart" id="ch-acc" data-h="180"></div>
        </section>
      </div>
      ${footer('Painel executivo empresarial')}`;

    const center = t => `<small>${t}</small>`;
    C.donut($('#ch-mix-r'), { size: 120, stroke: 13, segs: recSegs, center: center('R-P / R-S'), aria: 'Composição das receitas' });
    C.donut($('#ch-mix-d'), { size: 120, stroke: 13, segs: despSegs, center: center('D-RH / D-MKT'), aria: 'Composição das despesas' });
    C.wave($('#ch-rec'), { labels, long, values: e.rec, name: 'Receitas', from: '#00C8F0', to: '#10B981', aria: 'Evolução mensal das receitas' });
    C.wave($('#ch-desp'), { labels, long, values: e.gas, name: 'Despesas', from: '#FFB23E', to: '#F2643D', aria: 'Evolução mensal das despesas' });
    C.columns($('#ch-res'), { labels, long, values: e.resultado, name: 'Resultado', tone: 'cyan', aria: 'Resultado líquido por mês' });
    C.wave($('#ch-acc'), { labels, long, values: e.acumulado, name: 'Saldo acumulado', from: '#25DCFF', to: '#0E9F8E', aria: 'Saldo acumulado por mês' });
  }

  /* ---------- Lançamentos ---------- */
  function formHTML(p, kind) {
    const d = PROFILES[p];
    const emp = p === 'empresa', casa = p === 'casa', out = kind === 'out';
    const id = `f-${p}-${kind}`;
    const v = ui.drafts[id] || F.formPadrao(p, kind);
    const cats = out ? d.catOut : d.catIn;
    const formas = emp ? (out ? EMP_SAIDA : EMP_ENTRADA) : (out ? SAIDA_FORMAS : ENTRADA_FORMAS);
    let cardField = '';
    if (out) {
      const list = emp ? ['PJ ITAÚ', '-'] : casa ? ['-'].concat(CARTOES_CASA) : ['-'].concat(d.cartoes);
      cardField = `<div class="fld"><label for="${id}-card">${emp ? 'Cartão/conta' : 'Cartão'}</label><select id="${id}-card" name="card">${opts(list, v.card)}</select></div>`;
    }
    return `<form class="lform ${out ? 'is-out' : 'is-in'}" id="${id}" data-p="${p}" data-kind="${kind}" novalidate>
      <div class="fld"><label for="${id}-cat">Categoria</label><select id="${id}-cat" name="cat">${opts(cats, v.cat)}</select></div>
      <div class="fld grow"><label for="${id}-obs">Observações</label><input id="${id}-obs" name="obs" value="${esc(v.obs)}" maxlength="80" autocomplete="off"></div>
      <div class="fld"><label for="${id}-val">Valor (R$)</label><input id="${id}-val" name="val" value="${esc(v.val)}" inputmode="decimal" autocomplete="off" placeholder="0,00"></div>
      <div class="fld"><label for="${id}-forma">Forma</label><select id="${id}-forma" name="forma">${opts(formas, v.forma)}</select></div>
      <div class="fld"><label for="${id}-tipo">Tipo</label><select id="${id}-tipo" name="tipo">${opts(TIPOS, v.tipo)}</select></div>
      <div class="fld fld-parc" ${v.tipo === 'Parcelado' ? '' : 'hidden'}><label for="${id}-parc">Parcelas</label><input id="${id}-parc" name="parcelas" type="number" min="2" max="48" value="${esc(v.parcelas || '3')}"></div>
      ${cardField}
      <div class="fld"><label for="${id}-venc">Data venc.</label><input id="${id}-venc" name="venc" type="date" value="${esc(v.venc)}"></div>
      <div class="fld"><label for="${id}-pag">Data pagto.</label><input id="${id}-pag" name="pag" type="date" value="${esc(v.pag)}"></div>
      <button class="btn btn-lancar ${out ? 'out' : 'in'}" type="submit">Lançar</button>
      <p class="form-err" id="${id}-err" role="alert" hidden></p>
    </form>`;
  }

  const COL_IN = [['cat', 'Categoria'], ['obs', 'Observações'], ['val', 'Valor', 'num'], ['forma', 'Forma'], ['parc', 'Parcela'], ['venc', 'Data venc.'], ['pag', 'Data pagto.'], ['status', 'Status'], ['mes', 'Mês'], ['ano', 'Ano']];
  const COL_OUT = [['cat', 'Descrição'], ['obs', 'Observações'], ['val', 'Valores', 'num'], ['forma', 'Forma'], ['card', 'Cartão crédito'], ['parc', 'Nº parcela'], ['venc', 'Data venc.'], ['pag', 'Data pagto.'], ['status', 'Status'], ['mes', 'Mês'], ['ano', 'Ano']];

  const statusPill = (r, p, kind) => r.pag
    ? `<span class="pill ok">${IC.check}Concluído</span>`
    : (kind ? `<button class="pill wait" data-confirm="${r.id}" data-p="${p}" data-kind="${kind}" title="Confirmar pagamento com a data de hoje">${IC.clock}Pendente</button>` : `<span class="pill wait">${IC.clock}Pendente</span>`);

  function sortRows(rows, key) {
    const s = ui.sort[key];
    if (!s) return rows;
    const val = r => s.col === 'status' ? (r.pag ? 1 : 0) : s.col === 'mes' ? F.mesDe(r.venc) : s.col === 'ano' ? F.anoDe(r.venc) : r[s.col];
    return rows.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
      return s.dir * c;
    });
  }

  function tableHTML(p, kind, cols) {
    const key = `${p}:${kind}`;
    const rows = sortRows(F.linhas(p, kind).filter(r => F.mesDe(r.venc) === ui.month && F.anoDe(r.venc) === ui.year), key);
    const s = ui.sort[key];
    const head = cols.map(([c, l, cls]) => {
      const on = s && s.col === c;
      return `<th class="${cls || ''}" scope="col" aria-sort="${on ? (s.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-sort="${c}" data-key="${key}">${l}<span class="sortmark" aria-hidden="true">${on ? (s.dir > 0 ? '▴' : '▾') : '▾'}</span></button></th>`;
    }).join('');
    const body = rows.map(r => {
      const cell = c => {
        switch (c) {
          case 'cat': return `<td class="strong">${esc(r.cat)}</td>`;
          case 'obs': return `<td>${esc(r.obs)}</td>`;
          case 'val': return `<td class="num">${brl2(r.val)}</td>`;
          case 'forma': return `<td>${esc(r.forma)}</td>`;
          case 'card': return `<td>${esc(r.card)}</td>`;
          case 'parc': return `<td>${esc(r.parc)}</td>`;
          case 'venc': return `<td>${dataBR(r.venc)}</td>`;
          case 'pag': return `<td>${dataBR(r.pag)}</td>`;
          case 'status': return `<td>${statusPill(r, p, kind)}</td>`;
          case 'mes': return `<td>${MES[F.mesDe(r.venc)]}</td>`;
          case 'ano': return `<td>${F.anoDe(r.venc)}</td>`;
        }
        return '<td></td>';
      };
      const del = `<button class="rowdel" data-del="${r.id}" data-p="${p}" data-kind="${kind}" aria-label="Excluir ${esc(r.obs || r.cat)}" title="Excluir lançamento">${IC.x}</button>`;
      return `<tr>${cols.map(([c]) => cell(c)).join('')}<td class="rowact">${del}</td></tr>`;
    }).join('');
    const empty = `<tr><td colspan="${cols.length + 1}" class="empty">Nenhum lançamento em ${MES_LONGO[ui.month].toLowerCase()} de ${ui.year}. Use o formulário acima para adicionar o primeiro.</td></tr>`;
    return `<div class="tablewrap" tabindex="0" role="region" aria-label="Tabela de ${kind === 'in' ? 'entradas' : 'saídas'}"><table><thead><tr>${head}<th aria-label="Ações"></th></tr></thead><tbody>${body || empty}</tbody></table></div>`;
  }

  function resumo(p) {
    const t = F.totais(p, ui.month, ui.year, 'real');
    return `<div class="summary">
      <div><span>Entradas brutas</span><strong><i class="dot dot-emerald"></i>${brl2(t.rec)}</strong></div>
      <div><span>Saídas totais</span><strong><i class="dot dot-coral"></i>${brl2(t.gas)}</strong></div>
      <div><span>Total líquido</span><strong><i class="dot dot-cyan"></i>${brl2(t.saldo)}</strong></div>
    </div>`;
  }

  function resumoEmpresa() {
    return `<div class="seg" role="group" aria-label="Abas de lançamentos">
      ${[['todas', 'Todas'], ['entradas', 'Aba Entradas'], ['saidas', 'Aba Saídas']].map(([k, l]) => `<button data-aba="${k}" class="${ui.empresaAba === k ? 'on' : ''}" aria-pressed="${ui.empresaAba === k}">${l}</button>`).join('')}
    </div>`;
  }

  function renderLanc(p) {
    const casa = p === 'casa', emp = p === 'empresa';
    let html = '';
    if (casa) {
      const lz = F.totais('luiz', ui.month, ui.year, 'real').saldo;
      const cl = F.totais('cleide', ui.month, ui.year, 'real').saldo;
      const linha = (nome, val) => `<tr><td class="strong">${nome}</td><td>Saldo líquido do mês</td><td class="num">${brl2(val)}</td><td>${MES[ui.month]}</td><td>${ui.year}</td></tr>`;
      html = `${pageHead('Gastos e saídas da casa — Contas conjuntas (Cleide &amp; Luiz)', monthSelect() + yearSelect())}
        <section class="card panel lanc">
          <div class="panel-h"><h2 class="c-info">Entradas resumidas do casal (consolidado)</h2><span class="panel-note">Saldo líquido de cada pessoa no mês</span></div>
          <div class="tablewrap" tabindex="0" role="region" aria-label="Entradas do casal"><table><thead><tr>${['Origem', 'Observações', 'Valor líquido', 'Mês', 'Ano'].map((h, i) => `<th scope="col" class="${i === 2 ? 'num' : ''}"><span class="thtxt">${h}</span></th>`).join('')}</tr></thead>
          <tbody>${linha('LUIZ SANTOS', lz)}${linha('CLEIDE NASCIMENTO', cl)}</tbody></table></div>
        </section>
        <section class="card panel lanc">
          <div class="panel-h"><h2 class="c-out">Saídas e despesas da casa</h2></div>
          ${formHTML(p, 'out')}${tableHTML(p, 'out', COL_OUT)}
        </section>
        ${footer('Gastos da casa (Cleide &amp; Luiz)')}`;
    } else {
      const titulo = emp ? 'Módulo de lançamentos empresarial (alimentador de dados)' : 'Interface de lançamentos — ' + PROFILES[p].nome;
      const direita = emp ? monthSelect() + yearSelect() + resumoEmpresa() : monthSelect() + yearSelect() + resumo(p);
      const showIn = !emp || ui.empresaAba !== 'saidas', showOut = !emp || ui.empresaAba !== 'entradas';
      html = `${pageHead(titulo, direita)}
        ${showIn ? `<section class="card panel lanc"><div class="panel-h"><h2 class="c-in">${emp ? 'Formatação rápida de entradas empresariais' : 'Entradas (recebimentos)'}</h2></div>${formHTML(p, 'in')}${tableHTML(p, 'in', COL_IN)}</section>` : ''}
        ${showOut ? `<section class="card panel lanc"><div class="panel-h"><h2 class="c-out">${emp ? 'Formatação rápida de saídas empresariais' : 'Saídas (despesas)'}</h2></div>${formHTML(p, 'out')}${tableHTML(p, 'out', COL_OUT)}</section>` : ''}
        ${footer(emp ? 'Gestão de lançamentos empresariais' : 'Lançamentos de ' + PROFILES[p].nome)}`;
    }
    $('#view').innerHTML = html;
    $$('form.lform').forEach(syncCardField);
  }

  function syncCardField(form) {
    const p = form.dataset.p, card = form.elements.card;
    if (!card || p === 'empresa') return;
    const credito = form.elements.forma.value === 'Crédito';
    card.disabled = !credito;
    if (!credito) card.value = '-';
    else if (card.value === '-') card.value = card.options[1] ? card.options[1].value : '-';
  }

  function parseValor(s) {
    const t = String(s).trim().replace(/[R$\s]/g, '');
    if (!t) return NaN;
    const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t);
    return Number(n);
  }

  function submitForm(form) {
    const err = $('.form-err', form);
    const fail = (msg, field) => {
      err.textContent = msg; err.hidden = false;
      if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    };
    err.hidden = true;
    $$('[aria-invalid]', form).forEach(x => x.removeAttribute('aria-invalid'));
    const el = form.elements;
    const val = Math.round(parseValor(el.val.value) * 100) / 100;
    if (!(val > 0)) return fail('Informe um valor maior que zero, por exemplo 1.250,00.', el.val);
    if (!el.venc.value) return fail('Informe a data de vencimento.', el.venc);
    const tipo = el.tipo.value;
    const n = tipo === 'Parcelado' ? parseInt(el.parcelas.value, 10) : 1;
    if (tipo === 'Parcelado' && !(n >= 2 && n <= 48)) return fail('Informe de 2 a 48 parcelas.', el.parcelas);
    const p = form.dataset.p, kind = form.dataset.kind;
    const criados = F.adicionar(p, kind, {
      cat: el.cat.value, obs: el.obs.value.trim(), val, forma: el.forma.value, tipo,
      card: el.card && !el.card.disabled ? el.card.value : '-', venc: el.venc.value, pag: el.pag.value
    }, n);
    captureDrafts();
    ui.drafts[form.id] = {
      cat: el.cat.value, obs: '', val: '', forma: el.forma.value, tipo, parcelas: el.parcelas.value,
      card: el.card ? el.card.value : '-', venc: el.venc.value, pag: el.pag.value
    };
    const r = criados[0], m = F.mesDe(r.venc), y = F.anoDe(r.venc);
    const onde = (m !== ui.month || y !== ui.year) ? ` em ${MES_LONGO[m].toLowerCase()} de ${y}` : '';
    const qtde = n > 1 ? ` em ${n} parcelas` : '';
    toast(`${r.cat}: ${brl2(val)} lançado${qtde}${onde}.`);
    route();
    const again = document.getElementById(form.id);
    if (again) again.elements.val.focus();
  }

  function captureDrafts() {
    $$('form.lform').forEach(f => {
      const e = f.elements;
      ui.drafts[f.id] = {
        cat: e.cat.value, obs: e.obs.value, val: e.val.value, forma: e.forma.value, tipo: e.tipo.value,
        parcelas: e.parcelas.value, card: e.card ? e.card.value : '-', venc: e.venc.value, pag: e.pag.value
      };
    });
  }

  /* ---------- Plano de contas: metas e limites ---------- */
  function renderPlano() {
    const campo = (attrs, val, label) => `<input class="plan-input" ${attrs} value="${val > 0 ? num2(val) : ''}" inputmode="decimal" placeholder="0,00" autocomplete="off" aria-label="${esc(label)}">`;
    const bloco = (titulo, p, sub, comMeta) => {
      const d = PROFILES[p];
      const lin = (tipo, lista, cod, kind) => lista.map((c, i) => `<tr><td class="mono">${cod}.${String(i + 1).padStart(2, '0')}</td><td class="strong">${esc(c)}</td><td><span class="tag">${tipo}</span></td>${comMeta ? `<td class="num">${campo(`data-goal="${p}" data-kind="${kind}" data-cat="${esc(c)}"`, F.metaDe(p, kind, c), `Meta mensal de ${c}`)}</td>` : ''}</tr>`).join('');
      return `<section class="card panel"><div class="panel-h"><h2>${titulo}</h2><a class="linkarrow" href="#${sub}">Lançar <span aria-hidden="true">→</span></a></div>
        <div class="tablewrap" tabindex="0" role="region" aria-label="Plano de contas: ${titulo}"><table class="tbl-compact"><thead><tr><th scope="col"><span class="thtxt">Código</span></th><th scope="col"><span class="thtxt">Conta</span></th><th scope="col"><span class="thtxt">Tipo</span></th>${comMeta ? '<th scope="col" class="num"><span class="thtxt">Meta mensal (R$)</span></th>' : ''}</tr></thead>
        <tbody>${lin('Entrada', d.catIn, '1', 'in')}${lin('Saída', d.catOut, '2', 'out')}</tbody></table></div></section>`;
    };
    const cartoes = [['luiz', 'PICPAY'], ['luiz', 'INTER'], ['cleide', 'PICPAY'], ['cleide', 'NUBANK']];
    const empMetas = [['metaRec', 'Meta de receitas no ano'], ['tetoDesp', 'Limite de despesas no ano'], ['metaRes', 'Meta de resultado no ano']];
    $('#view').innerHTML = `${pageHead('Plano de contas')}
      <p class="notice">Preencha metas e limites com os seus valores. Cada campo é salvo assim que você sai dele.</p>
      <div class="plan-grid">
        <section class="card panel"><div class="panel-h"><h2>Limites dos cartões</h2></div>
          <div class="plan-fields">${cartoes.map(([p, c]) => `<label>${c} — ${PROFILES[p].curto}<span class="plan-prefix">R$</span>${campo(`data-limit="${p}" data-card="${c}"`, F.limiteDe(p, c), `Limite do cartão ${c} de ${PROFILES[p].curto}`)}</label>`).join('')}</div>
        </section>
        <section class="card panel"><div class="panel-h"><h2>Metas da empresa</h2></div>
          <div class="plan-fields">${empMetas.map(([k, l]) => `<label>${l}<span class="plan-prefix">R$</span>${campo(`data-emp="${k}"`, F.metaEmpresa(k), l)}</label>`).join('')}</div>
        </section>
        ${bloco('Luiz Santos', 'luiz', 'luiz-lancamentos', true)}${bloco('Cleide Nascimento', 'cleide', 'cleide-lancamentos', true)}${bloco('Casa (casal)', 'casa', 'casa-lancamentos', true)}${bloco('Empresa', 'empresa', 'empresa-lancamentos', false)}
      </div>
      ${footer('Plano de contas')}`;
  }

  /* ---------- Relatórios ---------- */
  function renderRelatorios() {
    const p = ui.relatorio, y = ui.year, mode = ui.mode;
    let linhas;
    if (p === 'empresa') {
      const e = F.empresa(y);
      linhas = e.meses.map((m, i) => ({ m, rec: e.rec[i], gas: e.gas[i], saldo: e.resultado[i] }));
    } else {
      linhas = F.serieAnual(p, y, mode).map((t, m) => ({ m, rec: t.rec, gas: t.gas, saldo: t.saldo }));
    }
    const sum = k => linhas.reduce((s, l) => s + l[k], 0);
    const nomes = [['luiz', 'LUIZ SANTOS'], ['cleide', 'CLEIDE NASCIMENTO'], ['casal', 'CASAL'], ['empresa', 'EMPRESA']];
    $('#view').innerHTML = `
      ${pageHead('Relatórios', (p === 'empresa' ? '' : modeToggle()) + yearSelect() + select('sel-rel', 'Perfil', nomes, p))}
      <section class="card panel">
        <div class="panel-h"><h2>Resultado mês a mês</h2></div>
        <div class="kpi-trio">
          <div class="kpi"><span>Recebido no período</span><strong>${brl(sum('rec'))}</strong><i class="kpi-mark up"></i></div>
          <div class="kpi"><span>Gasto no período</span><strong>${brl(sum('gas'))}</strong><i class="kpi-mark down"></i></div>
          <div class="kpi"><span>Saldo do período</span><strong>${brl(sum('saldo'))}</strong><i class="kpi-mark info"></i></div>
        </div>
        <div class="tablewrap" tabindex="0" role="region" aria-label="Resultado mês a mês"><table class="tbl-compact">
          <thead><tr><th scope="col"><span class="thtxt">Mês</span></th><th scope="col" class="num"><span class="thtxt">Recebido</span></th><th scope="col" class="num"><span class="thtxt">Gasto</span></th><th scope="col" class="num"><span class="thtxt">Saldo</span></th><th scope="col" class="num"><span class="thtxt">% gasto</span></th></tr></thead>
          <tbody>${linhas.map(l => `<tr><td class="strong">${MES_LONGO[l.m]}</td><td class="num">${brl(l.rec)}</td><td class="num">${brl(l.gas)}</td><td class="num strong">${brl(l.saldo)}</td><td class="num">${l.rec ? Math.round(l.gas / l.rec * 100) : 0}%</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${brl(sum('rec'))}</td><td class="num">${brl(sum('gas'))}</td><td class="num">${brl(sum('saldo'))}</td><td class="num">${sum('rec') ? Math.round(sum('gas') / sum('rec') * 100) : 0}%</td></tr></tfoot>
        </table></div>
      </section>
      ${F.temDados() && A.ehDono() ? `<div class="reset-row">${ui.confirmaApagar
        ? `<span>${A.ativo ? 'Apagar todos os lançamentos, metas e limites para as duas contas?' : 'Apagar todos os lançamentos, metas e limites deste navegador?'} Isso não pode ser desfeito.</span><button class="btn btn-ghost btn-sm" data-reset-cancel>Cancelar</button><button class="btn btn-danger btn-sm" data-reset-ok>Apagar tudo</button>`
        : `<button class="btn btn-ghost btn-sm" data-reset>Apagar todos os meus dados</button>`}</div>` : ''}
      ${footer('Relatórios')}`;
  }

  /* ---------- Login e conta ---------- */
  const IC_GOOGLE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.1 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>';
  const IC_APPLE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5a4.3 4.3 0 0 0-3.4-1.8c-1.4-.2-2.8.8-3.5.8s-1.9-.8-3.1-.8a4.6 4.6 0 0 0-3.9 2.4c-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.3 1.2 0 1.6-.8 3.1-.8s1.8.8 3.1.7 2.1-1.1 2.9-2.3c.9-1.3 1.3-2.6 1.3-2.7s-2.7-1-2.7-3.8zM14 5.8a4.2 4.2 0 0 0 1-3.1 4.3 4.3 0 0 0-2.8 1.4 4 4 0 0 0-1 3c1.1.1 2.1-.5 2.8-1.3z"/></svg>';

  const MARCA = `<div class="gate-marca"><svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
      <defs><linearGradient id="marca-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00C8F0"/><stop offset="1" stop-color="#10B981"/></linearGradient>
      <linearGradient id="marca-b" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FF8A3D"/><stop offset="1" stop-color="#10B981"/></linearGradient></defs>
      <path d="M3 8c9 0 10 8 18 8h8" fill="none" stroke="url(#marca-a)" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M3 24c9 0 10-8 18-8h8" fill="none" stroke="url(#marca-b)" stroke-width="3.4" stroke-linecap="round"/>
    </svg><span>Controle Financeiro <b>Integrado</b></span></div>`;

  function renderPortao() {
    const v = $('#view');
    const erro = A.erro ? `<p class="form-err gate-err" role="alert">${esc(A.erro)}</p>` : '';
    if (A.estado === 'carregando') {
      v.innerHTML = `<section class="card gate" aria-busy="true">${MARCA}<p>${A.usuario ? 'Carregando seus dados…' : 'Só um instante…'}</p></section>`;
    } else if (A.estado === 'anonimo') {
      v.innerHTML = `<section class="card gate">
        ${MARCA}
        <h1>Todo o seu dinheiro em um único fluxo.</h1>
        <p>Entradas, saídas e metas reunidas em um só painel. Entre para continuar.</p>
        ${erro}
        <div class="gate-actions">
          <button class="btn btn-provider" data-login="google">${IC_GOOGLE}Continuar com Google</button>
          ${A.apple ? `<button class="btn btn-provider apple" data-login="apple">${IC_APPLE}Continuar com Apple</button>` : ''}
        </div>
      </section>`;
    } else if (A.estado === 'sem-espaco') {
      v.innerHTML = `<section class="card gate">
        ${MARCA}
        <h1>Quase lá</h1>
        <p>Conectado como ${esc(A.usuario.email || 'sua conta')}. Entre na conta conjunta que você recebeu ou crie uma.</p>
        <form class="gate-form" id="form-convite">
          <label for="campo-convite">Código de convite</label>
          <div class="gate-row"><input id="campo-convite" autocomplete="off" maxlength="20" required><button class="btn btn-ink btn-sm" type="submit">Entrar</button></div>
        </form>
        <form class="gate-form" id="form-espaco">
          <label for="campo-espaco">Criar uma conta conjunta</label>
          <div class="gate-row"><input id="campo-espaco" value="Conta conjunta" maxlength="80" required><button class="btn btn-ghost btn-sm" type="submit">Criar</button></div>
        </form>
        <p class="form-err gate-err" id="gate-erro" role="alert" hidden></p>
        <button class="linkbtn" data-sair>Sair e usar outra conta</button>
      </section>`;
    } else {
      v.innerHTML = `<section class="card gate">${MARCA}<h1>Algo não saiu como esperado</h1>${erro}
        <div class="gate-actions">${A.usuario ? '<button class="btn btn-ink btn-sm" data-tentar>Tentar de novo</button>' : ''}</div></section>`;
    }
  }

  function renderConta() {
    const w = A.espaco, vagas = w.max_members - A.membros.length;
    const papel = { owner: 'Titular', member: 'Membro' };
    $('#view').innerHTML = `${pageHead('Minha conta', '<button class="btn btn-ghost btn-sm" data-sair>Sair</button>')}
      <section class="card panel">
        <div class="panel-h"><h2>${esc(w.name)}</h2><span class="panel-note">${A.membros.length} de ${w.max_members} contas</span></div>
        <ul class="members">${A.membros.map(m => `<li><span><b>${esc(m.display_name || m.email || 'Conta')}</b>${m.user_id === A.usuario.id ? ' (você)' : ''}<small>${esc(m.email || '')}</small></span><span class="tag">${papel[m.role] || m.role}</span></li>`).join('')}</ul>
      </section>
      ${vagas > 0 ? `<section class="card panel">
        <div class="panel-h"><h2>Convidar a outra pessoa</h2></div>
        <p class="muted">Peça para ela entrar no site com a própria conta e informar este código. Os dados de vocês passam a ser os mesmos.</p>
        <div class="invite"><code id="codigo-convite">${esc(w.invite_code)}</code>
          <button class="btn btn-ink btn-sm" data-copiar>Copiar</button>
          ${A.papel === 'owner' ? '<button class="btn btn-ghost btn-sm" data-novo-convite>Gerar outro código</button>' : ''}
        </div>
      </section>` : ''}
      ${footer('Minha conta')}`;
  }

  /* ---------- Toast ---------- */
  let toastTimer = 0;
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    t.hidden = false;
    if (action) $('button', t).addEventListener('click', () => { action.fn(); t.hidden = true; });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 7000 : 3600);
  }

  /* ---------- Roteador ---------- */
  function setNav(key) {
    $$('#mainnav a').forEach(a => {
      const on = a.dataset.nav === key;
      a.classList.toggle('on', on);
      if (on) {
        a.setAttribute('aria-current', 'page');
        const nav = a.parentElement;
        nav.scrollLeft = a.offsetLeft - nav.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
      } else a.removeAttribute('aria-current');
    });
    $('#topcta').hidden = !A.ativo;
    $('.brand').href = '#' + ui.lastProfile;
    $('#mainnav a[data-nav="lancamentos"]').href = '#' + ui.lastLanc;
    $('#mainnav a[data-nav="dashboards"]').href = '#' + ui.lastProfile;
  }

  function route(scroll) {
    C.hideTip();
    const h = location.hash.slice(1);

    /* Sem login concluído, nenhuma tela abre: só a entrada, seja qual for o endereço. */
    const bloqueado = A.ativo && A.estado !== 'pronto';
    document.body.classList.toggle('portao', bloqueado);
    if (bloqueado) {
      if (ROUTES[h]) A.guardarDestino(h);
      document.title = 'Controle Financeiro Integrado';
      $('.profilenav').hidden = true;
      renderPortao();
      if (scroll) window.scrollTo(0, 0);
      return;
    }

    const r = ROUTES[h];
    if (!r || (r.conta && !A.ativo)) { location.replace('#' + ui.lastProfile); return; }
    document.title = r.title + ' · Controle Financeiro Integrado';

    if (r.dash || r.emp) ui.lastProfile = h;
    if (r.lanc) ui.lastLanc = h;
    setNav(r.lanc ? 'lancamentos' : r.dash || r.emp ? 'dashboards' : r.plano ? 'plano' : r.conta ? '' : 'relatorios');

    const pnav = $('.profilenav');
    pnav.hidden = !r.perfil;
    if (r.perfil) {
      const isLanc = !!r.lanc;
      $('#profile-seg').innerHTML = PERFIS.map(([k, l, d, la]) => `<a href="#${isLanc ? la : d}" class="${r.perfil === k ? 'on' : ''}"${r.perfil === k ? ' aria-current="true"' : ''}>${l}</a>`).join('');
      const per = PERFIS.find(x => x[0] === r.perfil);
      $('#view-seg').innerHTML = `<a href="#${per[2]}" class="${!isLanc ? 'on' : ''}">Dashboard</a><a href="#${per[3]}" class="${isLanc ? 'on' : ''}">Lançamentos</a>`;
    }

    if (r.dash) renderDash(r.dash);
    else if (r.emp) renderEmpresa();
    else if (r.lanc) renderLanc(r.lanc);
    else if (r.plano) renderPlano();
    else if (r.rel) renderRelatorios();
    else if (r.conta) renderConta();

    if (scroll) window.scrollTo(0, 0);
  }

  /* ---------- Eventos ---------- */
  const view = $('#view');

  view.addEventListener('change', e => {
    const t = e.target;
    const h = location.hash.slice(1), r = ROUTES[h] || {};
    if (t.classList.contains('plan-input')) {
      const txt = t.value.trim();
      const v = txt === '' ? 0 : Math.round(parseValor(txt) * 100) / 100;
      if (!(v >= 0)) { t.setAttribute('aria-invalid', 'true'); toast('Valor inválido. Use o formato 1.250,00.'); return; }
      t.removeAttribute('aria-invalid');
      if (t.dataset.goal) F.definirMeta(t.dataset.goal, t.dataset.kind, t.dataset.cat, v);
      else if (t.dataset.limit) F.definirLimite(t.dataset.limit, t.dataset.card, v);
      else F.definirMetaEmpresa(t.dataset.emp, v);
      t.value = v > 0 ? num2(v) : '';
      toast(v > 0 ? `Salvo: ${brl2(v)}.` : 'Valor removido.');
      return;
    }
    const form = t.closest('form.lform');
    if (form) {
      if (t.name === 'forma') syncCardField(form);
      if (t.name === 'tipo') $('.fld-parc', form).hidden = t.value !== 'Parcelado';
      return;
    }
    const pid = r.dash;
    switch (t.id) {
      case 'sel-month': ui.month = Number(t.value); break;
      case 'sel-year': ui.year = Number(t.value); break;
      case 'sel-card': ui.card[pid] = t.value; break;
      case 'sel-catin': ui.catIn[pid] = t.value; break;
      case 'sel-catout': ui.catOut[pid] = t.value; break;
      case 'sel-rel': ui.relatorio = t.value; break;
      default: return;
    }
    captureDrafts();
    route();
    const again = document.getElementById(t.id);
    if (again) again.focus();
  });

  async function enviarPortao(form, acao) {
    const erro = $('#gate-erro');
    erro.hidden = true;
    const btn = $('button', form);
    btn.disabled = true;
    const msg = await acao();
    if (msg) { erro.textContent = msg; erro.hidden = false; btn.disabled = false; }
  }

  view.addEventListener('submit', e => {
    if (e.target.id === 'form-convite') { e.preventDefault(); enviarPortao(e.target, () => A.aceitarConvite($('#campo-convite').value)); return; }
    if (e.target.id === 'form-espaco') { e.preventDefault(); enviarPortao(e.target, () => A.criarEspaco($('#campo-espaco').value)); return; }
    if (e.target.matches('form.lform')) { e.preventDefault(); submitForm(e.target); }
  });

  view.addEventListener('focusout', e => {
    if (e.target.name === 'val' && e.target.closest('form.lform')) {
      const n = parseValor(e.target.value);
      if (n > 0) e.target.value = num2(n);
    }
  });

  view.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.login) { b.disabled = true; A.entrar(b.dataset.login); return; }
    if ('sair' in b.dataset) { A.sair(); return; }
    if ('tentar' in b.dataset) { A.tentarDeNovo(); return; }
    if ('copiar' in b.dataset) {
      const code = $('#codigo-convite').textContent;
      navigator.clipboard.writeText(code).then(() => toast('Código copiado.'), () => toast('Copie o código manualmente: ' + code));
      return;
    }
    if ('novoConvite' in b.dataset) {
      A.novoConvite().then(msg => { if (msg) toast(msg); else { route(); toast('Novo código gerado. O anterior deixou de funcionar.'); } });
      return;
    }
    if (b.dataset.mode) { ui.mode = b.dataset.mode; route(); return; }
    if (b.dataset.aba) { captureDrafts(); ui.empresaAba = b.dataset.aba; route(); return; }
    if (b.dataset.sort) {
      const k = b.dataset.key, c = b.dataset.sort, cur = ui.sort[k];
      ui.sort[k] = { col: c, dir: cur && cur.col === c ? -cur.dir : 1 };
      captureDrafts(); route(); return;
    }
    if (b.dataset.confirm) {
      const hoje = F.hoje();
      const r = F.confirmar(b.dataset.p, b.dataset.kind, b.dataset.confirm, hoje);
      captureDrafts(); route();
      if (r) toast(`${r.cat}: pagamento confirmado em ${dataBR(hoje)}.`);
      return;
    }
    if (b.dataset.del) {
      const p = b.dataset.p, k = b.dataset.kind;
      const pos = F.remover(p, k, b.dataset.del);
      captureDrafts(); route();
      if (pos) toast(`${pos.r.cat}: lançamento excluído.`, { label: 'Desfazer', fn: () => { F.restaurarLinha(p, k, pos); route(); } });
      return;
    }
    if ('reset' in b.dataset) { ui.confirmaApagar = true; route(); return; }
    if ('resetCancel' in b.dataset) { ui.confirmaApagar = false; route(); return; }
    if ('resetOk' in b.dataset) { F.apagarTudo(); ui.confirmaApagar = false; ui.drafts = {}; route(); toast('Todos os dados foram apagados.'); }
  });

  window.addEventListener('hashchange', () => route(true));

  /* Mudança de sessão: ao concluir o login, segue para a tela que a pessoa pediu. */
  window.addEventListener('cfi:auth', () => {
    if (A.estado === 'pronto') { const d = A.pegarDestino(); if (d && '#' + d !== location.hash) { location.hash = d; return; } }
    if (A.estado === 'anonimo') ui.drafts = {};
    route();
  });
  window.addEventListener('cfi:aviso', e => toast(e.detail));

  /* Dados que chegaram do outro aparelho. O texto digitado nos formulários é
     preservado; só um menu aberto ou um campo de meta em edição fazem esperar. */
  let espera = 0;
  const redesenhar = () => {
    clearTimeout(espera);
    const a = document.activeElement;
    const dentro = a && a.closest && a.closest('#view');
    if (dentro && (a.matches('select') || a.classList.contains('plan-input'))) { espera = setTimeout(redesenhar, 1000); return; }
    const foco = dentro && a.id ? a.id : '';
    const cursor = foco && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    captureDrafts();
    const x = window.scrollX, y = window.scrollY;
    route();
    window.scrollTo(x, y);
    const novo = foco && document.getElementById(foco);
    if (novo) { novo.focus(); if (cursor) novo.setSelectionRange(cursor[0], cursor[1]); }
  };
  window.addEventListener('cfi:remoto', redesenhar);

  route(true);
})();
