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

  const { TIPOS } = F;

  const ui = {
    month: new Date().getMonth(), year: new Date().getFullYear(), mode: 'real', card: {}, catIn: {}, catOut: {},
    drafts: {}, sort: {}, empresaAba: 'todas', lastProfile: 'titular', lastLanc: 'titular-lancamentos', relatorio: 'titular',
    entrar: { email: '', nome: '' }
  };

  /* As telas e os títulos usam os nomes do CFI de quem está logado. */
  const nomeDe = p => PROFILES[p] ? PROFILES[p].nome : '';
  const casal = () => F.CFI.casal;
  function rotas() {
    const r = {
      titular: { dash: 'titular', perfil: 'titular', title: 'Dashboard de ' + nomeDe('titular') },
      'titular-lancamentos': { lanc: 'titular', perfil: 'titular', title: 'Lançamentos de ' + nomeDe('titular') },
      empresa: { emp: true, perfil: 'empresa', title: 'Painel da ' + nomeDe('empresa') },
      'empresa-lancamentos': { lanc: 'empresa', perfil: 'empresa', title: 'Lançamentos da ' + nomeDe('empresa') },
      plano: { plano: true, title: 'Plano de contas' },
      relatorios: { rel: true, title: 'Relatórios' },
      conta: { conta: true, title: 'Minha conta' },
      agentes: { agentes: true, title: 'Agentes inteligentes' }
    };
    if (casal()) Object.assign(r, {
      parceiro: { dash: 'parceiro', perfil: 'parceiro', title: 'Dashboard de ' + nomeDe('parceiro') },
      'parceiro-lancamentos': { lanc: 'parceiro', perfil: 'parceiro', title: 'Lançamentos de ' + nomeDe('parceiro') },
      casal: { dash: 'casal', perfil: 'casal', title: 'Dashboard do casal' },
      'casa-lancamentos': { lanc: 'casa', perfil: 'casal', title: 'Gastos da casa' }
    });
    return r;
  }
  const perfisNav = () => (casal()
    ? [['titular', nomeDe('titular'), 'titular', 'titular-lancamentos'], ['parceiro', nomeDe('parceiro'), 'parceiro', 'parceiro-lancamentos'], ['casal', 'Casal', 'casal', 'casa-lancamentos'], ['empresa', nomeDe('empresa'), 'empresa', 'empresa-lancamentos']]
    : [['titular', nomeDe('titular'), 'titular', 'titular-lancamentos'], ['empresa', nomeDe('empresa'), 'empresa', 'empresa-lancamentos']]);
  const doCasal = () => `${esc(nomeDe('titular'))} &amp; ${esc(nomeDe('parceiro'))}`;

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
    const titulo = casal ? 'Dashboard financeiro do casal — ' + doCasal() : 'Dashboard financeiro pessoal — ' + esc(PROFILES[p].nome);
    const m = ui.month, y = ui.year, mode = ui.mode;
    const t = F.totais(p, m, y, mode);
    const desp = F.despesas(p, m, y, mode).filter(d => d.val > 0);
    const maxDesp = Math.max(...desp.map(d => d.val), 1);
    const metas = casal ? [] : F.metas(p, m, y, mode);
    const serie = F.serieAnual(p, y, mode);

    const cards = casal ? Object.keys(F.CASAL_CARDS) : PROFILES[p].cartoes;
    if (!cards.includes(ui.card[p])) ui.card[p] = cards[0];
    const fat = F.faturas(p, ui.card[p], y, mode);

    const catsIn = casal ? [['titular', nomeDe('titular').toUpperCase()], ['parceiro', nomeDe('parceiro').toUpperCase()]] : PROFILES[p].catIn;
    const catsOut = casal ? F.casalGrupos().map(g => g.nome) : PROFILES[p].catOut;
    const inVals = casal ? catsIn.map(c => c[0]) : catsIn;
    if (!inVals.includes(ui.catIn[p])) ui.catIn[p] = inVals[0];
    if (!catsOut.includes(ui.catOut[p])) ui.catOut[p] = catsOut[0];


    $('#view').innerHTML = `
      ${pageHead(titulo, modeToggle() + yearSelect())}
      ${t.rec === 0 && t.gas === 0 ? aviso(`Nenhum lançamento em ${MES_LONGO[m].toLowerCase()} de ${y}.`, casal ? 'casa-lancamentos' : p + '-lancamentos', 'Fazer um lançamento') : ''}
      <div class="dash-grid">
        <section class="card panel" aria-label="Análise do mês">
          <div class="panel-h"><h2>Análise do mês${casal ? ' (casal)' : ''}</h2>${monthSelect()}</div>
          <div class="donut-wrap" id="ch-donut"></div>
          <div class="donut-legend">
            <span><i style="background:#10B981"></i>Resultado do mês ${brl(t.saldo)}</span>
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
      ${footer(casal ? 'Contas conjuntas do casal' : esc(PROFILES[p].nome))}`;

    C.donut($('#ch-donut'), {
      size: 184, stroke: 15,
      aria: `Saldo em caixa hoje de ${brl2(F.saldoCaixa(p))}. No mês, ${brl(t.gas)} gastos de ${brl(t.rec)} recebidos`,
      segs: [
        { nome: 'Saldo', val: Math.max(0, t.saldo), grad: ['#2BE0A8', '#0E9F8E'] },
        { nome: 'Gastos', val: t.gas, grad: ['#FFB23E', '#F2643D'] }
      ],
      center: `<small>${casal ? 'Caixa do casal hoje' : 'Saldo em caixa hoje'}</small><strong>${brl2(F.saldoCaixa(p))}</strong>`
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
      ${pageHead('Dashboard financeiro — ' + esc(nomeDe('empresa')), yearSelect())}
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
      ${footer('Painel da ' + esc(nomeDe('empresa')))}`;

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
    const out = kind === 'out';
    const id = `f-${p}-${kind}`;
    const v = ui.drafts[id] || F.formPadrao(p, kind);
    const desc = (out ? d.descOut : d.descIn) || {};
    const cats = (out ? d.catOut : d.catIn).map(c => [c, desc[c] ? `${c} — ${desc[c]}` : c]);
    const { formas, cartoes: list } = F.opcoes(p, kind);
    let cardField = '';
    if (out) {
      cardField = `<div class="fld"><label for="${id}-card">Cartão/conta</label><select id="${id}-card" name="card">${opts(list, v.card)}</select></div>`;
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

  /* Sem pagamento: "Atrasado" depois do vencimento, "Previsto" até ele. */
  const atrasado = r => !r.pag && r.venc < F.hoje();
  const statusPill = (r, p, kind) => r.pag
    ? `<span class="pill ok">${IC.check}Concluído</span>`
    : `<button class="pill ${atrasado(r) ? 'late' : 'wait'}" data-confirm="${r.id}" data-p="${p}" data-kind="${kind}" title="Confirmar pagamento com a data de hoje">${atrasado(r) ? IC.warn + 'Atrasado' : IC.clock + 'Previsto'}</button>`;

  function sortRows(rows, key) {
    const s = ui.sort[key];
    if (!s) return rows;
    const val = r => s.col === 'status' ? (r.pag ? 2 : atrasado(r) ? 0 : 1) : s.col === 'mes' ? F.mesDe(r.venc) : s.col === 'ano' ? F.anoDe(r.venc) : r[s.col];
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
          case 'cat': return `<td class="strong">${esc(r.cat)}${r.origem === 'whatsapp' ? ' <span class="tag-wa" title="Lançado pelo WhatsApp">WhatsApp</span>' : ''}</td>`;
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
      <div><span>Resultado do mês</span><strong><i class="dot dot-cyan"></i>${brl2(t.saldo)}</strong></div>
      <div><span>Saldo em caixa hoje${PROFILES[p].conta ? ` (${esc(PROFILES[p].conta)})` : ''}</span><strong>${brl2(F.saldoCaixa(p))}</strong></div>
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
      const lz = F.totais('titular', ui.month, ui.year, 'real').saldo;
      const cl = F.totais('parceiro', ui.month, ui.year, 'real').saldo;
      const linha = (nome, val) => `<tr><td class="strong">${esc(nome.toUpperCase())}</td><td>Saldo líquido do mês</td><td class="num">${brl2(val)}</td><td>${MES[ui.month]}</td><td>${ui.year}</td></tr>`;
      html = `${pageHead('Gastos e saídas da casa — Contas conjuntas (' + doCasal() + ')', monthSelect() + yearSelect())}
        <section class="card panel lanc">
          <div class="panel-h"><h2 class="c-info">Entradas resumidas do casal (consolidado)</h2><span class="panel-note">Saldo líquido de cada pessoa no mês</span></div>
          <div class="tablewrap" tabindex="0" role="region" aria-label="Entradas do casal"><table><thead><tr>${['Origem', 'Observações', 'Valor líquido', 'Mês', 'Ano'].map((h, i) => `<th scope="col" class="${i === 2 ? 'num' : ''}"><span class="thtxt">${h}</span></th>`).join('')}</tr></thead>
          <tbody>${linha(nomeDe('titular'), lz)}${linha(nomeDe('parceiro'), cl)}</tbody></table></div>
        </section>
        <section class="card panel lanc">
          <div class="panel-h"><h2 class="c-out">Saídas e despesas da casa</h2></div>
          ${formHTML(p, 'out')}${tableHTML(p, 'out', COL_OUT)}
        </section>
        ${footer('Gastos da casa (' + doCasal() + ')')}`;
    } else {
      const titulo = (emp ? 'Lançamentos — ' : 'Interface de lançamentos — ') + esc(PROFILES[p].nome);
      const direita = emp ? monthSelect() + yearSelect() + resumoEmpresa() : monthSelect() + yearSelect() + resumo(p);
      const showIn = !emp || ui.empresaAba !== 'saidas', showOut = !emp || ui.empresaAba !== 'entradas';
      html = `${pageHead(titulo, direita)}
        ${showIn ? `<section class="card panel lanc"><div class="panel-h"><h2 class="c-in">${emp ? 'Entradas da ' + esc(nomeDe('empresa')) : 'Entradas (recebimentos)'}</h2></div>${formHTML(p, 'in')}${tableHTML(p, 'in', COL_IN)}</section>` : ''}
        ${showOut ? `<section class="card panel lanc"><div class="panel-h"><h2 class="c-out">${emp ? 'Saídas da ' + esc(nomeDe('empresa')) : 'Saídas (despesas)'}</h2></div>${formHTML(p, 'out')}${tableHTML(p, 'out', COL_OUT)}</section>` : ''}
        ${footer((emp ? 'Lançamentos da ' : 'Lançamentos de ') + esc(PROFILES[p].nome))}`;
    }
    $('#view').innerHTML = html;
    $$('form.lform').forEach(syncCardField);
  }

  /* Crédito sempre pede um cartão; nas outras formas, o cartão/conta é opcional
     (um PIX pode sair da conta Inter, por exemplo) e não entra na fatura. */
  function syncCardField(form) {
    const p = form.dataset.p, card = form.elements.card;
    if (!card || p === 'empresa') return;
    if (form.elements.forma.value === 'Crédito' && card.value === '-') card.value = card.options[1] ? card.options[1].value : '-';
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
      const lin = (tipo, lista, cod, kind) => lista.map((c, i) => `<tr><td class="mono">${cod}.${String(i + 1).padStart(2, '0')}</td><td class="strong">${esc(c)}${(kind === 'in' ? d.descIn : d.descOut) && (kind === 'in' ? d.descIn : d.descOut)[c] ? `<small class="plan-desc">${esc((kind === 'in' ? d.descIn : d.descOut)[c])}</small>` : ''}</td><td><span class="tag">${tipo}</span></td>${comMeta ? `<td class="num">${campo(`data-goal="${p}" data-kind="${kind}" data-cat="${esc(c)}"`, F.metaDe(p, kind, c), `Meta mensal de ${c}`)}</td>` : ''}</tr>`).join('');
      return `<section class="card panel"><div class="panel-h"><h2>${titulo}</h2><a class="linkarrow" href="#${sub}">Lançar <span aria-hidden="true">→</span></a></div>
        <div class="tablewrap" tabindex="0" role="region" aria-label="Plano de contas: ${titulo}"><table class="tbl-compact"><thead><tr><th scope="col"><span class="thtxt">Código</span></th><th scope="col"><span class="thtxt">Conta</span></th><th scope="col"><span class="thtxt">Tipo</span></th>${comMeta ? '<th scope="col" class="num"><span class="thtxt">Meta mensal (R$)</span></th>' : ''}</tr></thead>
        <tbody>${lin('Entrada', d.catIn, '1', 'in')}${lin('Saída', d.catOut, '2', 'out')}</tbody></table></div></section>`;
    };
    const cartoes = (casal() ? ['titular', 'parceiro'] : ['titular']).flatMap(p => PROFILES[p].cartoes.map(c => [p, c]));
    const empMetas = [['metaRec', 'Meta de receitas no ano'], ['tetoDesp', 'Limite de despesas no ano'], ['metaRes', 'Meta de resultado no ano']];
    $('#view').innerHTML = `${pageHead('Plano de contas')}
      <p class="notice">Preencha metas e limites com os seus valores. Cada campo é salvo assim que você sai dele.</p>
      <div class="plan-grid">
        <section class="card panel"><div class="panel-h"><h2>Limites dos cartões</h2></div>
          <div class="plan-fields">${cartoes.map(([p, c]) => `<label>${esc(c)} — ${esc(PROFILES[p].curto)}<span class="plan-prefix">R$</span>${campo(`data-limit="${p}" data-card="${esc(c)}"`, F.limiteDe(p, c), `Limite do cartão ${c} de ${PROFILES[p].curto}`)}</label>`).join('')}</div>
        </section>
        <section class="card panel"><div class="panel-h"><h2>Metas da ${esc(nomeDe('empresa'))}</h2></div>
          <div class="plan-fields">${empMetas.map(([k, l]) => `<label>${l}<span class="plan-prefix">R$</span>${campo(`data-emp="${k}"`, F.metaEmpresa(k), l)}</label>`).join('')}</div>
        </section>
        ${bloco(esc(nomeDe('titular')), 'titular', 'titular-lancamentos', true)}${casal() ? bloco(esc(nomeDe('parceiro')), 'parceiro', 'parceiro-lancamentos', true) + bloco('Casa (casal)', 'casa', 'casa-lancamentos', true) : ''}${bloco(esc(nomeDe('empresa')), 'empresa', 'empresa-lancamentos', false)}
      </div>
      ${footer('Plano de contas')}`;
  }

  /* ---------- Relatórios ---------- */
  function renderRelatorios() {
    const nomes = perfisNav().map(([k, l]) => [k, k === 'casal' ? 'CASAL' : l.toUpperCase()]);
    if (!nomes.some(n => n[0] === ui.relatorio)) ui.relatorio = 'titular';
    const p = ui.relatorio, y = ui.year, mode = ui.mode;
    let linhas;
    if (p === 'empresa') {
      const e = F.empresa(y);
      linhas = e.meses.map((m, i) => ({ m, rec: e.rec[i], gas: e.gas[i], saldo: e.resultado[i] }));
    } else {
      linhas = F.serieAnual(p, y, mode).map((t, m) => ({ m, rec: t.rec, gas: t.gas, saldo: t.saldo }));
    }
    const sum = k => linhas.reduce((s, l) => s + l[k], 0);
    $('#view').innerHTML = `
      ${pageHead('Relatórios', (p === 'empresa' ? '' : modeToggle()) + yearSelect() + select('sel-rel', 'Perfil', nomes, p))}
      <section class="card panel">
        <div class="panel-h"><h2>Resultado mês a mês</h2>${p === 'empresa' ? '' : `<span class="panel-note">Saldo em caixa hoje: ${brl2(F.saldoCaixa(p))}</span>`}</div>
        <div class="kpi-trio">
          <div class="kpi"><span>Recebido no período</span><strong>${brl(sum('rec'))}</strong><i class="kpi-mark up"></i></div>
          <div class="kpi"><span>Gasto no período</span><strong>${brl(sum('gas'))}</strong><i class="kpi-mark down"></i></div>
          <div class="kpi"><span>Resultado do período</span><strong>${brl(sum('saldo'))}</strong><i class="kpi-mark info"></i></div>
        </div>
        <div class="tablewrap" tabindex="0" role="region" aria-label="Resultado mês a mês"><table class="tbl-compact">
          <thead><tr><th scope="col"><span class="thtxt">Mês</span></th><th scope="col" class="num"><span class="thtxt">Recebido</span></th><th scope="col" class="num"><span class="thtxt">Gasto</span></th><th scope="col" class="num"><span class="thtxt">Resultado</span></th><th scope="col" class="num"><span class="thtxt">% gasto</span></th></tr></thead>
          <tbody>${linhas.map(l => `<tr><td class="strong">${MES_LONGO[l.m]}</td><td class="num">${brl(l.rec)}</td><td class="num">${brl(l.gas)}</td><td class="num strong">${brl(l.saldo)}</td><td class="num">${l.rec ? Math.round(l.gas / l.rec * 100) : 0}%</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${brl(sum('rec'))}</td><td class="num">${brl(sum('gas'))}</td><td class="num">${brl(sum('saldo'))}</td><td class="num">${sum('rec') ? Math.round(sum('gas') / sum('rec') * 100) : 0}%</td></tr></tfoot>
        </table></div>
      </section>
      ${F.temDados() && A.ehDono() ? `<div class="reset-row">${ui.confirmaApagar
        ? `<span>${A.ativo ? (casal() ? 'Apagar todos os lançamentos, metas e limites para as duas contas?' : 'Apagar todos os lançamentos, metas e limites do seu CFI?') : 'Apagar todos os lançamentos, metas e limites deste navegador?'} Isso não pode ser desfeito.</span><button class="btn btn-ghost btn-sm" data-reset-cancel>Cancelar</button><button class="btn btn-danger btn-sm" data-reset-ok>Apagar tudo</button>`
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

  /* ---------- Entrada: criar um CFI ou entrar em um existente ----------
     Antes do login, a pessoa escolhe o caminho. Depois do Google:
     - quem já participa de um CFI vai direto para ele;
     - "criar" (quem comprou) escolhe conjunta ou individual e dá os nomes;
     - "entrar" digita o e-mail de quem comprou, confirma o nome e pede
       autorização. O titular aceita ou recusa dentro do próprio CFI. */
  const primeiroNome = () => {
    const u = A.usuario || {}, md = u.user_metadata || {};
    return String(md.full_name || md.name || '').trim().split(/\s+/)[0] || '';
  };
  const sairLink = () => `<p class="gate-quem">Conectado como <b>${esc((A.usuario && A.usuario.email) || 'sua conta')}</b>. <button class="linkbtn" data-sair>Sair e usar outra conta</button></p>`;
  const erroGate = '<p class="form-err gate-err" id="gate-erro" role="alert" hidden></p>';

  function formCriar(completar) {
    const w = completar ? A.espaco : null;
    const conj = !w || w.max_members !== 1;
    const membro = w ? A.membros.find(m => m.user_id !== A.usuario.id) : null;
    return `<form class="gate-form cfi-form" id="form-criar" novalidate>
      <fieldset class="cfi-tipos">
        <legend>Como vai ser o seu CFI?</legend>
        <label class="cfi-tipo"><input type="radio" name="tipo" value="conjunto"${conj ? ' checked' : ''}>
          <span><b>Conta conjunta</b><small>Você, seu namorado(a) ou cônjuge, o casal e a empresa</small></span></label>
        <label class="cfi-tipo"><input type="radio" name="tipo" value="individual"${conj ? '' : ' checked'}${membro ? ' disabled' : ''}>
          <span><b>Conta individual</b><small>Você e a sua empresa</small></span></label>
      </fieldset>
      <div class="cfi-campo"><label for="cfi-titular">Seu nome</label>
        <input id="cfi-titular" name="titular" maxlength="40" autocomplete="given-name" value="${esc(primeiroNome())}" placeholder="Ex.: Ana" required></div>
      <div class="cfi-conjunto"${conj ? '' : ' hidden'}>
        <div class="cfi-campo"><label for="cfi-parceiro">Nome do(a) parceiro(a)</label>
          <input id="cfi-parceiro" name="parceiro" maxlength="40" value="${esc(membro ? (membro.display_name || '').split(/\s+/)[0] : '')}" placeholder="Ex.: Bruno"></div>
        <div class="cfi-campo"><label for="cfi-email">E-mail Google do(a) parceiro(a)</label>
          <input id="cfi-email" name="email" type="email" maxlength="120" autocomplete="off" value="${esc(membro ? membro.email || '' : '')}" placeholder="email@gmail.com">
          <small>É a chave de entrada: só este e-mail poderá pedir para entrar no seu CFI, e a entrada só acontece depois da sua autorização.</small></div>
      </div>
      <div class="cfi-campo"><label for="cfi-empresa">Nome da empresa</label>
        <input id="cfi-empresa" name="empresa" maxlength="60" autocomplete="organization" placeholder="Ex.: Studio Aurora" required></div>
      <p class="cfi-nota cfi-conjunto"${conj ? '' : ' hidden'}>A área do casal não precisa de nome: ela se chama <b>Casal</b>.</p>
      ${erroGate}
      <button class="btn btn-ink" type="submit">${completar ? 'Salvar e abrir o CFI' : 'Criar meu CFI'}</button>
    </form>`;
  }

  function formEntrar() {
    const e = ui.entrar;
    const recusado = A.pedido && A.pedido.status === 'recusado'
      ? `<p class="notice">O pedido para entrar no CFI de ${esc(A.pedido.nome_titular || 'quem comprou')} foi recusado. Confira com a pessoa e tente de novo.</p>` : '';
    if (e.nome) {
      return `${recusado}<div class="cfi-achado">
        <p>Encontramos o Controle Financeiro Integrado de</p>
        <strong>${esc(e.nome)}</strong>
        <small>${esc(e.email)}</small>
      </div>
      <p class="gate-txt">É essa pessoa? Vamos enviar um pedido com o seu nome e o seu e-mail (<b>${esc(A.usuario.email || '')}</b>). Você entra assim que o pedido for autorizado.</p>
      ${erroGate}
      <div class="gate-actions"><button class="btn btn-ink" data-pedir>Sim, pedir para entrar</button><button class="btn btn-ghost" data-entrar-voltar>Não é essa pessoa</button></div>`;
    }
    return `${recusado}<form class="gate-form cfi-form" id="form-procurar" novalidate>
      <div class="cfi-campo"><label for="cfi-busca">E-mail de quem comprou o CFI</label>
        <input id="cfi-busca" name="email" type="email" maxlength="120" autocomplete="off" value="${esc(e.email)}" placeholder="email@gmail.com" required>
        <small>O e-mail Google do seu namorado(a) ou cônjuge, usado na compra.</small></div>
      ${erroGate}
      <button class="btn btn-ink" type="submit">Continuar</button>
    </form>`;
  }

  const escolha = (logado) => `<div class="cfi-escolha">
      <button class="cfi-opcao" data-intencao="criar">
        <b>Criar um novo CFI</b><small>Acabei de comprar o Controle Financeiro Integrado</small></button>
      <button class="cfi-opcao" data-intencao="entrar">
        <b>Entrar em um CFI existente</b><small>Meu namorado(a) ou cônjuge já comprou e me cadastrou</small></button>
    </div>
    ${logado ? '' : `<p class="gate-txt">Já usa o CFI? <button class="linkbtn" data-login="google">Entre com a mesma conta Google</button>.</p>`}`;

  function renderPortao() {
    const v = $('#view');
    const erro = A.erro ? `<p class="form-err gate-err" role="alert">${esc(A.erro)}</p>` : '';
    const tela = (corpo, cls) => { v.innerHTML = `<section class="card gate ${cls || ''}">${MARCA}${corpo}</section>`; };
    const voltar = '<button class="linkbtn cfi-voltar" data-intencao="">← Voltar</button>';

    if (A.estado === 'carregando') {
      v.innerHTML = `<section class="card gate" aria-busy="true">${MARCA}<p>${A.usuario ? 'Carregando seus dados…' : 'Só um instante…'}</p></section>`;
    } else if (A.estado === 'anonimo') {
      const intencao = A.intencao === 'criar' || A.intencao === 'entrar' ? A.intencao : '';
      if (intencao && A.apple) {
        tela(`<h1>${intencao === 'criar' ? 'Criar um novo CFI' : 'Entrar em um CFI existente'}</h1>
          <p>Entre com a sua conta para continuar.</p>${erro}
          <div class="gate-actions">
            <button class="btn btn-provider" data-login="google">${IC_GOOGLE}Continuar com Google</button>
            <button class="btn btn-provider apple" data-login="apple">${IC_APPLE}Continuar com Apple</button>
          </div>${voltar}`);
      } else {
        tela(`<h1>Todo o seu dinheiro em um único fluxo.</h1>
          <p>Entradas, saídas e metas reunidas em um só painel. Como você quer começar?</p>${erro}
          ${escolha(false)}
          <p class="gate-txt cfi-google">${IC_GOOGLE}<span>As duas opções pedem o login com a sua conta Google.</span></p>`, 'gate-largo');
      }
    } else if (A.estado === 'sem-espaco') {
      const intencao = A.intencao || (A.pedido ? 'entrar' : '');
      if (intencao === 'criar' && A.podeCriar) {
        tela(`<h1>Configure o seu CFI</h1>
          <p>Antes de abrir o painel, conte como ele vai ser. Os nomes aparecem nas telas, e só você e quem você autorizar veem os dados.</p>
          ${formCriar(false)}${voltar}${sairLink()}`, 'gate-largo');
      } else if (intencao === 'criar') {
        tela(`<h1>Não encontramos a sua compra</h1>
          <p>O e-mail <b>${esc(A.usuario.email || '')}</b> não está ligado a uma compra do Controle Financeiro Integrado.</p>
          <p class="gate-txt">Entre com o e-mail usado na compra. Se quem comprou foi o seu namorado(a) ou cônjuge, entre no CFI dele(a).</p>
          <div class="gate-actions"><button class="btn btn-ink" data-intencao="entrar">Entrar em um CFI existente</button></div>
          ${voltar}${sairLink()}`);
      } else if (intencao === 'entrar') {
        tela(`<h1>Entrar em um CFI existente</h1>
          <p>Use o CFI que o seu namorado(a) ou cônjuge comprou. Ele(a) precisa ter cadastrado o seu e-mail e autorizar a sua entrada.</p>
          ${formEntrar()}${voltar}${sairLink()}`, 'gate-largo');
      } else {
        tela(`<h1>Quase lá</h1><p>Como você quer começar?</p>${escolha(true)}${sairLink()}`, 'gate-largo');
      }
    } else if (A.estado === 'pedido') {
      tela(`<h1>Pedido enviado</h1>
        <p>Aguardando <b>${esc(A.pedido.nome_titular || 'o titular')}</b> autorizar a sua entrada. Assim que autorizar, o CFI abre aqui sozinho.</p>
        <p class="gate-txt">Peça para ele(a) abrir o Controle Financeiro Integrado: o pedido aparece no topo da tela, com o seu nome e o seu e-mail.</p>
        ${erroGate}
        <div class="gate-actions"><button class="btn btn-ink btn-sm" data-conferir>Verificar agora</button><button class="btn btn-ghost btn-sm" data-cancelar-pedido>Cancelar pedido</button></div>
        ${sairLink()}`);
    } else if (A.estado === 'configurar') {
      tela(`<h1>Complete o seu CFI</h1>
        <p>Agora cada CFI tem os próprios nomes. Preencha uma vez; os seus lançamentos continuam onde estão.</p>
        ${formCriar(true)}${sairLink()}`, 'gate-largo');
    } else if (A.estado === 'aguardando-config') {
      tela(`<h1>Quase pronto</h1>
        <p>O titular do seu CFI precisa entrar uma vez para completar os nomes. Depois disso, o painel abre aqui.</p>
        <div class="gate-actions"><button class="btn btn-ink btn-sm" data-tentar>Verificar de novo</button></div>${sairLink()}`);
    } else {
      v.innerHTML = `<section class="card gate">${MARCA}<h1>Algo não saiu como esperado</h1>${erro}
        <div class="gate-actions">${A.usuario ? '<button class="btn btn-ink btn-sm" data-tentar>Tentar de novo</button>' : ''}</div>
        ${A.usuario ? '<button class="linkbtn" data-sair>Sair e usar outra conta</button>' : ''}</section>`;
    }
  }

  /* Pedido de entrada no topo de todas as telas do titular, até ele responder. */
  function pedidosHTML() {
    if (!A.ativo || A.papel !== 'owner' || !A.pedidos.length) return '';
    return A.pedidos.map(p => `<section class="card pedido" role="alert" aria-label="Pedido para entrar no seu CFI">
      <div class="pedido-txt">
        <span class="pedido-tag">Pedido de entrada</span>
        <p><b>${esc(p.nome || p.email)}</b> (<b>${esc(p.email)}</b>) quer entrar no seu Controle Financeiro Integrado como <b>${esc(nomeDe('parceiro'))}</b>.</p>
        <small>Confira o nome e o e-mail antes de autorizar: quem entra vê e lança em todas as áreas do CFI.</small>
      </div>
      <div class="pedido-acoes">
        <button class="btn btn-ink btn-sm" data-pedido-sim="${esc(p.id)}">Autorizar</button>
        <button class="btn btn-ghost btn-sm" data-pedido-nao="${esc(p.id)}">Recusar</button>
      </div>
    </section>`).join('');
  }

  function renderConta() {
    const w = A.espaco, conj = w.plan === 'conjunto';
    const papel = { owner: 'Titular', member: 'Parceiro(a)' };
    const parceiroDentro = A.membros.some(m => m.role !== 'owner');
    const areas = perfisNav().map(([, l]) => `<li>${esc(l)}</li>`).join('');
    const trocar = conj && A.papel === 'owner' && !parceiroDentro ? `<section class="card panel">
        <div class="panel-h"><h2>Parceiro(a)</h2><span class="panel-note">Ainda não entrou</span></div>
        <p class="muted">Peça para ${esc(nomeDe('parceiro'))} abrir o site, entrar com o Google usando <b>${esc(w.email_parceiro || '')}</b>, escolher <b>Entrar em um CFI existente</b> e digitar o seu e-mail (<b>${esc(A.usuario.email || '')}</b>). O pedido aparece aqui para você autorizar.</p>
        <form class="cfi-form cfi-linha" id="form-parceiro" novalidate>
          <div class="cfi-campo"><label for="pc-nome">Nome</label><input id="pc-nome" name="nome" maxlength="40" value="${esc(w.nome_parceiro || '')}"></div>
          <div class="cfi-campo"><label for="pc-email">E-mail Google</label><input id="pc-email" name="email" type="email" maxlength="120" value="${esc(w.email_parceiro || '')}"></div>
          <button class="btn btn-ghost btn-sm" type="submit">Salvar</button>
          ${erroGate}
        </form>
      </section>` : '';
    $('#view').innerHTML = `${pageHead('Minha conta', '<button class="btn btn-ghost btn-sm" data-sair>Sair</button>')}
      <section class="card panel">
        <div class="panel-h"><h2>Controle Financeiro Integrado de ${esc(w.nome_titular || w.name)}</h2><span class="panel-note">${conj ? 'Conta conjunta' : 'Conta individual'} · ${A.membros.length} de ${w.max_members} ${w.max_members > 1 ? 'contas' : 'conta'}</span></div>
        <ul class="members">${A.membros.map(m => `<li><span><b>${esc(m.role === 'owner' ? (w.nome_titular || m.display_name || m.email) : (w.nome_parceiro || m.display_name || m.email))}</b>${m.user_id === A.usuario.id ? ' (você)' : ''}<small>${esc(m.email || '')}</small></span><span class="tag">${papel[m.role] || m.role}</span></li>`).join('')}</ul>
        <h3 class="sub">Áreas do seu CFI</h3>
        <ul class="cfi-areas">${areas}</ul>
        <p class="muted">Os dados deste CFI são só seus${conj ? ' e de quem você autorizou' : ''}. Nenhum outro cliente vê nomes, valores ou lançamentos.</p>
      </section>
      ${trocar}
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
  const LANDING_ANCHORS = ['inicio', 'visao', 'como-funciona', 'telas', 'saiba-mais'];

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
    if (A.ativo) { const cta = $('#topcta'); cta.textContent = 'Conta'; cta.href = '#conta'; }
    else $('#topcta').href = '#titular';
    $('#mainnav a[data-nav="lancamentos"]').href = '#' + ui.lastLanc;
    $('#mainnav a[data-nav="dashboards"]').href = '#' + ui.lastProfile;
  }

  function route(scroll) {
    C.hideTip();
    const h = (location.hash || '#inicio').slice(1);
    const landing = $('#landing'), app = $('#app');

    /* Sem login concluído, nenhuma tela abre: só a entrada, seja qual for o endereço. */
    const bloqueado = A.ativo && A.estado !== 'pronto';
    document.body.classList.toggle('portao', bloqueado);
    if (bloqueado) {
      if (h && !LANDING_ANCHORS.includes(h)) A.guardarDestino(h);
      document.title = 'Controle Financeiro Integrado';
      landing.hidden = true;
      app.hidden = false;
      $('.profilenav').hidden = true;
      renderPortao();
      if (scroll) window.scrollTo(0, 0);
      return;
    }

    const r = rotas()[h];
    if (r && r.conta && !A.ativo) { location.replace('#inicio'); return; }

    if (!r) {
      const anchor = LANDING_ANCHORS.includes(h) ? h : 'inicio';
      app.hidden = true;
      landing.hidden = false;
      document.title = 'Controle Financeiro Integrado';
      setNav(anchor === 'saiba-mais' ? 'saiba' : 'inicio');
      window.dispatchEvent(new Event('cfi:landing'));
      if (scroll !== false) {
        if (anchor === 'inicio') window.scrollTo(0, 0);
        else { const el = document.getElementById(anchor); if (el) el.scrollIntoView(); }
      }
      return;
    }

    landing.hidden = true;
    app.hidden = false;
    document.title = r.title + ' · Controle Financeiro Integrado';

    if (r.dash || r.emp) ui.lastProfile = h;
    if (r.lanc) ui.lastLanc = h;
    setNav(r.lanc ? 'lancamentos' : r.dash || r.emp ? 'dashboards' : r.plano ? 'plano' : r.agentes ? 'agentes' : r.conta ? '' : 'relatorios');

    const pnav = $('.profilenav');
    pnav.hidden = !r.perfil;
    if (r.perfil) {
      const isLanc = !!r.lanc;
      const lista = perfisNav();
      $('#profile-seg').innerHTML = lista.map(([k, l, d, la]) => `<a href="#${isLanc ? la : d}" class="${r.perfil === k ? 'on' : ''}"${r.perfil === k ? ' aria-current="true"' : ''}>${esc(l)}</a>`).join('');
      const per = lista.find(x => x[0] === r.perfil);
      $('#view-seg').innerHTML = `<a href="#${per[2]}" class="${!isLanc ? 'on' : ''}">Dashboard</a><a href="#${per[3]}" class="${isLanc ? 'on' : ''}">Lançamentos</a>`;
    }

    if (r.dash) renderDash(r.dash);
    else if (r.emp) renderEmpresa();
    else if (r.lanc) renderLanc(r.lanc);
    else if (r.plano) renderPlano();
    else if (r.rel) renderRelatorios();
    else if (r.conta) renderConta();
    else if (r.agentes) AG.render();
    $('#view').insertAdjacentHTML('afterbegin', pedidosHTML());

    if (scroll) window.scrollTo(0, 0);
  }

  /* ---------- Agentes ---------- */
  const AG = window.AGENTES({ A, F, esc, pageHead, footer, toast: (m, a) => toast(m, a), route: () => route(), $ });

  /* ---------- Eventos ---------- */
  const view = $('#view');

  view.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'tipo' && t.closest('#form-criar')) {
      $$('#form-criar .cfi-conjunto').forEach(x => { x.hidden = t.value !== 'conjunto'; });
      return;
    }
    const h = location.hash.slice(1), r = rotas()[h] || {};
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
      if (t.name === 'forma') {
        if (t.value !== 'Crédito' && form.elements.card && form.dataset.p !== 'empresa') form.elements.card.value = '-';
        syncCardField(form);
      }
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

  async function enviarPortao(btn, acao) {
    const erro = $('#gate-erro');
    if (erro) erro.hidden = true;
    btn.disabled = true;
    const msg = await acao();
    if (msg && document.body.contains(btn)) {
      const e2 = $('#gate-erro');
      if (e2) { e2.textContent = msg; e2.hidden = false; } else toast(msg);
      btn.disabled = false;
    }
    return msg;
  }
  const falhaGate = (msg, campo) => {
    const erro = $('#gate-erro');
    erro.textContent = msg; erro.hidden = false;
    if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); }
  };
  const emailOk = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

  function enviarCriar(form) {
    const el = form.elements;
    $$('[aria-invalid]', form).forEach(x => x.removeAttribute('aria-invalid'));
    const tipo = form.querySelector('input[name="tipo"]:checked').value;
    const c = { tipo, titular: el.titular.value.trim(), empresa: el.empresa.value.trim() };
    if (!c.titular) return falhaGate('Informe o seu nome.', el.titular);
    if (tipo === 'conjunto') {
      c.parceiro = el.parceiro.value.trim();
      c.email = el.email.value.trim().toLowerCase();
      if (!c.parceiro) return falhaGate('Informe o nome do(a) parceiro(a).', el.parceiro);
      if (!emailOk(c.email)) return falhaGate('Informe o e-mail Google do(a) parceiro(a), por exemplo nome@gmail.com.', el.email);
      if (A.usuario && c.email === String(A.usuario.email || '').toLowerCase()) return falhaGate('O e-mail do(a) parceiro(a) precisa ser diferente do seu.', el.email);
    }
    if (!c.empresa) return falhaGate('Informe o nome da empresa.', el.empresa);
    enviarPortao($('button[type="submit"]', form), () => A.configurarCFI(c));
  }

  async function enviarProcurar(form) {
    const campo = form.elements.email, email = campo.value.trim().toLowerCase();
    campo.removeAttribute('aria-invalid');
    if (!emailOk(email)) return falhaGate('Digite o e-mail de quem comprou, por exemplo nome@gmail.com.', campo);
    if (A.usuario && email === String(A.usuario.email || '').toLowerCase()) return falhaGate('Digite o e-mail do seu namorado(a) ou cônjuge, não o seu.', campo);
    let achado = null;
    const msg = await enviarPortao($('button[type="submit"]', form), async () => {
      const r = await A.procurarCFI(email);
      achado = r.nome || null;
      return r.erro || '';
    });
    if (!msg && achado) { ui.entrar = { email, nome: achado }; route(); }
  }

  async function enviarParceiro(form) {
    const el = form.elements, nome = el.nome.value.trim(), email = el.email.value.trim().toLowerCase();
    if (!nome) return falhaGate('Informe o nome do(a) parceiro(a).', el.nome);
    if (!emailOk(email)) return falhaGate('Informe um e-mail válido.', el.email);
    const msg = await enviarPortao($('button[type="submit"]', form), () => A.trocarParceiro(nome, email));
    if (!msg) { route(); toast('Dados do(a) parceiro(a) salvos.'); }
  }

  view.addEventListener('submit', e => {
    if (e.target.id === 'form-criar') { e.preventDefault(); enviarCriar(e.target); return; }
    if (e.target.id === 'form-procurar') { e.preventDefault(); enviarProcurar(e.target); return; }
    if (e.target.id === 'form-parceiro') { e.preventDefault(); enviarParceiro(e.target); return; }
    if (e.target.matches('form.lform')) { e.preventDefault(); submitForm(e.target); return; }
    if (AG.submit(e.target)) e.preventDefault();
  });

  view.addEventListener('input', e => AG.input(e.target));
  view.addEventListener('keydown', e => AG.keydown(e));

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
    if ('intencao' in b.dataset) {
      const v = b.dataset.intencao || null;
      ui.entrar = { email: '', nome: '' };
      A.definirIntencao(v);
      /* Antes do login, escolher já leva ao Google (com Apple ligado, mostra os dois). */
      if (v && A.estado === 'anonimo' && !A.apple) { b.disabled = true; A.entrar('google'); }
      return;
    }
    if ('entrarVoltar' in b.dataset) { ui.entrar.nome = ''; route(); return; }
    if ('pedir' in b.dataset) {
      enviarPortao(b, () => A.pedirEntrada(ui.entrar.email)).then(msg => { if (!msg) ui.entrar = { email: '', nome: '' }; });
      return;
    }
    if ('cancelarPedido' in b.dataset) { enviarPortao(b, () => A.cancelarPedido()); return; }
    if ('conferir' in b.dataset) { A.conferirPedido(); return; }
    if (b.dataset.pedidoSim || b.dataset.pedidoNao) {
      const sim = !!b.dataset.pedidoSim;
      const ped = A.pedidos.find(x => x.id === (b.dataset.pedidoSim || b.dataset.pedidoNao));
      b.closest('.pedido').querySelectorAll('button').forEach(x => { x.disabled = true; });
      A.responderPedido(ped.id, sim).then(msg => {
        route();
        toast(msg || (sim ? `${ped.nome || ped.email} agora faz parte do seu CFI.` : 'Pedido recusado.'));
      });
      return;
    }
    if (AG.click(b)) return;
    if ('sair' in b.dataset) { history.replaceState(null, '', location.pathname); A.sair(); return; }
    if ('tentar' in b.dataset) { A.tentarDeNovo(); return; }
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
    if (A.estado === 'anonimo' || A.estado === 'sem-espaco') { ui.drafts = {}; AG.limpar(); }
    if (A.estado === 'pronto') { ui.card = {}; ui.catIn = {}; ui.catOut = {}; window.dispatchEvent(new Event('cfi:landing')); }
    route();
  });
  /* Pedido novo ou respondido em outro aparelho: atualiza o aviso e a conta. */
  window.addEventListener('cfi:pedidos', () => { if (A.estado === 'pronto') redesenhar(); });
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
  window.addEventListener('cfi:agentes', () => { AG.atualizou(); if (location.hash === '#agentes' && A.estado === 'pronto') redesenhar(); });

  route(true);
})();
