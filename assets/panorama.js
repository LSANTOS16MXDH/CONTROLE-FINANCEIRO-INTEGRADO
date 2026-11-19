/* Panorama de contas: um calendário por mês, de janeiro a dezembro, com cada
   conta no dia do vencimento, e a área de contas fixas e cartões.
   Situação: Atrasado (vermelho), Previsto (amarelo) e Concluído (verde). */
(function () {
  'use strict';

  const SIT = {
    atrasado: { nome: 'Atrasado', cor: ['#FF8A7A', '#E5484D'] },
    previsto: { nome: 'Previsto', cor: ['#FFD66B', '#F5A524'] },
    concluido: { nome: 'Concluído', cor: ['#2BE0A8', '#0E9F8E'] }
  };
  const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const BANDEIRAS = ['', 'Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard', 'Outra'];
  const IC_CARTAO = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18"/></svg>';

  window.PANORAMA = function (ctx) {
    const { A, F, C, esc, brl, brl2, num2, dataBR, pageHead, footer, toast, route, $, $$, yearSelect, parseValor, nomeDe, casal } = ctx;
    const { MES, MES_LONGO, PROFILES } = F;
    const st = { modal: null, editar: null, excluir: null, itens: {} };

    const base = v => (v === 'casal' ? 'casa' : v);
    const nomeVisao = v => (v === 'casal' ? 'Casal' : nomeDe(v));
    const semBanco = () => A.ativo && A.panorama === 'sem-banco';
    const avisoBanco = () => (semBanco()
      ? '<p class="notice">O panorama ainda não foi ativado no banco: rode o arquivo <b>supabase/panorama.sql</b> no SQL Editor do Supabase. Até lá, o calendário só mostra os lançamentos, sem salvar situações, cartões ou contas fixas.</p>' : '');
    const lancDe = p => (p === 'casa' ? 'casa-lancamentos' : p + '-lancamentos');
    const r2 = v => Math.round(v * 100) / 100;

    /* ---------- Calendário ---------- */
    const marcador = i => (i.tipo === 'fatura' ? `<i class="pan-ic" title="Fatura do cartão">${IC_CARTAO}</i>`
      : i.imprevisto ? '<i class="pan-ic pan-ic-imp" title="Imprevisto">!</i>'
        : i.fixa ? '<i class="pan-ic pan-ic-fixa" title="Conta fixa">↻</i>' : '');

    function itemHTML(i) {
      st.itens[i.chave] = i;
      const s = SIT[i.situacao].nome;
      const titulo = `${i.nome} — ${brl2(i.val)} — vence ${dataBR(i.venc)} — ${s}`;
      return `<li><button class="pan-item s-${i.situacao}" data-pan-item="${esc(i.chave)}" title="${esc(titulo)}" aria-label="${esc(titulo)}">
        <span class="pan-nome">${marcador(i)}${esc(i.nome)}</span><span class="pan-val">${num2(i.val)}</span></button></li>`;
    }

    function calendarioHTML(y, m, mes) {
      const hoje = F.hoje(), primeiro = new Date(y, m, 1).getDay(), dias = new Date(y, m + 1, 0).getDate();
      const porDia = {};
      mes.itens.forEach(i => { (porDia[Number(i.venc.slice(8, 10))] = porDia[Number(i.venc.slice(8, 10))] || []).push(i); });
      let cel = '';
      for (let i = 0; i < primeiro; i++) cel += '<div class="pan-dia pan-fora" aria-hidden="true"></div>';
      for (let d = 1; d <= dias; d++) {
        const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const lista = porDia[d] || [];
        cel += `<div class="pan-dia${iso === hoje ? ' hoje' : ''}${lista.length ? '' : ' livre'}">
          <div class="pan-dia-h"><b>${d}</b><span class="pan-sem">${SEMANA[(primeiro + d - 1) % 7]}</span>
            <button class="pan-mais" data-pan-novo="${iso}" title="Lançar conta imprevista em ${dataBR(iso)}" aria-label="Lançar conta imprevista em ${dataBR(iso)}">+</button></div>
          ${lista.length ? `<ul>${lista.map(itemHTML).join('')}</ul>` : ''}
        </div>`;
      }
      return `<div class="pan-cal"><div class="pan-semana" aria-hidden="true">${SEMANA.map(s => `<span>${s}</span>`).join('')}</div><div class="pan-grade">${cel}</div></div>`;
    }

    function relatorioHTML(mes, m) {
      const linha = (rotulo, valor, cls) => `<div class="pan-rl ${cls || ''}"><span>${rotulo}</span><b>${valor}</b></div>`;
      const saldo = r2(mes.entradas - mes.total);
      const comp = mes.entradas > 0 ? Math.round(mes.total / mes.entradas * 100) : null;
      return `<aside class="pan-rel" aria-label="Relatório de ${MES_LONGO[m]}">
        <h3>Relatório</h3>
        <div class="pan-donut" id="pan-donut-${m}"></div>
        ${linha('<i class="pan-dot s-concluido"></i>Pagos', brl2(mes.pago))}
        ${linha('<i class="pan-dot s-previsto"></i>A pagar', brl2(mes.aPagar))}
        ${linha('<i class="pan-dot s-atrasado"></i>Atrasados', brl2(mes.atrasado), mes.atrasado > 0 ? 'alerta' : '')}
        ${linha('Imprevistos', brl2(mes.imprevistos))}
        ${linha('Total de contas', brl2(mes.total), 'forte')}
        <div class="pan-sep"></div>
        ${linha('Entrou no mês', brl2(mes.entradas))}
        ${linha('Saldo depois das contas', brl2(saldo), saldo < 0 ? 'alerta forte' : 'forte')}
        ${comp != null ? `<div class="pan-comp"><span>Renda comprometida</span><b>${comp}%</b><div class="pan-barra"><i style="width:${Math.min(100, comp)}%" class="${comp > 100 ? 's-atrasado' : comp > 80 ? 's-previsto' : 's-concluido'}"></i></div></div>` : ''}
        ${mes.fixas || mes.faturas ? `<p class="pan-nota">${mes.fixas ? `Contas fixas: ${brl(mes.fixas)}` : ''}${mes.fixas && mes.faturas ? ' · ' : ''}${mes.faturas ? `Faturas de cartão: ${brl(mes.faturas)}` : ''}</p>` : ''}
        ${mes.maior ? `<p class="pan-nota">Maior conta: <b>${esc(mes.maior.nome)}</b>, ${brl2(mes.maior.val)} em ${dataBR(mes.maior.venc).slice(0, 5)}</p>` : ''}
      </aside>`;
    }

    function faixaAno(meses, y) {
      const atual = new Date().getFullYear() === y ? new Date().getMonth() : -1;
      return `<nav class="pan-ano card" aria-label="Meses de ${y}">${meses.map(mes => {
        const t = mes.total || 1;
        const pct = s => (mes[s] / t * 100).toFixed(1);
        return `<button class="pan-ano-m${mes.m === atual ? ' atual' : ''}" data-pan-ir="${mes.m}" aria-label="${MES_LONGO[mes.m]}: ${brl2(mes.total)} em contas${mes.qtdAtrasadas ? ', ' + mes.qtdAtrasadas + ' atrasadas' : ''}">
          <span class="pan-ano-n">${MES[mes.m]}${mes.qtdAtrasadas ? `<i class="pan-ano-alerta">${mes.qtdAtrasadas}</i>` : ''}</span>
          <b>${mes.total ? brl(mes.total) : '—'}</b>
          <span class="pan-ano-barra">${mes.total ? `<i class="s-concluido" style="width:${pct('pago')}%"></i><i class="s-previsto" style="width:${pct('aPagar')}%"></i><i class="s-atrasado" style="width:${pct('atrasado')}%"></i>` : ''}</span>
        </button>`;
      }).join('')}</nav>`;
    }

    function render(visao, y) {
      st.itens = {};
      const pa = F.panoramaAno(visao, y);
      const anoTot = pa.meses.reduce((a, m) => ({ total: a.total + m.total, pago: a.pago + m.pago, atrasado: a.atrasado + m.atrasado, entradas: a.entradas + m.entradas }), { total: 0, pago: 0, atrasado: 0, entradas: 0 });
      const avisoCartao = pa.semConfig.length
        ? `<p class="notice">${pa.semConfig.map(k => esc(k.split('|')[1]) + ' de ' + esc(nomeDe(k.split('|')[0]))).join(', ')}: falta informar o dia de fechamento e o de vencimento. Até lá, cada compra aparece na própria data, e não no dia da fatura. <a href="#contas-${k0(pa.semConfig[0])}">Configurar cartões</a></p>` : '';
      $('#view').innerHTML = `
        ${pageHead('Panorama de contas — ' + esc(nomeVisao(visao)), yearSelect() + `<button class="btn btn-ink btn-sm" data-pan-novo="${F.hoje().slice(0, 4) === String(y) ? F.hoje() : y + '-01-01'}">+ Conta imprevista</button>`)}
        ${avisoBanco()}${avisoCartao}
        <div class="pan-topo">
          <div class="pan-legenda" aria-label="Legenda">
            ${Object.keys(SIT).map(s => `<span class="pan-chip s-${s}">${SIT[s].nome}</span>`).join('')}
            <span class="pan-leg">${IC_CARTAO} fatura do cartão</span><span class="pan-leg"><b>↻</b> conta fixa</span><span class="pan-leg"><b>!</b> imprevisto</span>
          </div>
          <div class="pan-ano-tot">${y}: <b>${brl(anoTot.total)}</b> em contas · <b>${brl(anoTot.pago)}</b> pagos${anoTot.atrasado ? ` · <b class="alerta">${brl(anoTot.atrasado)}</b> atrasados` : ''} · entrou <b>${brl(anoTot.entradas)}</b></div>
        </div>
        ${faixaAno(pa.meses, y)}
        ${pa.meses.map(mes => `<section class="card pan-mes" id="pan-mes-${mes.m}" aria-labelledby="pan-t-${mes.m}">
          <header class="pan-mes-h"><h2 id="pan-t-${mes.m}">Calendário de contas de ${MES_LONGO[mes.m].toLowerCase()} de ${y}</h2>
            <span>${mes.itens.length ? `${mes.itens.length} ${mes.itens.length > 1 ? 'contas' : 'conta'} · ${brl2(mes.total)}` : 'Nenhuma conta'}</span></header>
          <div class="pan-mes-corpo">${calendarioHTML(y, mes.m, mes)}${relatorioHTML(mes, mes.m)}</div>
        </section>`).join('')}
        <div class="pan-modal" id="pan-modal" hidden></div>
        ${footer('Panorama de contas — ' + esc(nomeVisao(visao)))}`;

      pa.meses.forEach(mes => {
        const el = document.getElementById('pan-donut-' + mes.m);
        const segs = [['Pagos', mes.pago, 'concluido'], ['A pagar', mes.aPagar, 'previsto'], ['Atrasados', mes.atrasado, 'atrasado']]
          .map(([nome, val, s]) => ({ nome, val, grad: SIT[s].cor }));
        C.donut(el, {
          size: 132, stroke: 13, segs: mes.total ? segs : [{ nome: 'Sem contas', val: 1, grad: ['#E6EAF0', '#E6EAF0'] }],
          center: `<small>Contas</small><strong>${brl(mes.total)}</strong>`,
          aria: `${MES_LONGO[mes.m]}: ${brl2(mes.pago)} pagos, ${brl2(mes.aPagar)} a pagar e ${brl2(mes.atrasado)} atrasados`
        });
      });
      st.visao = visao;
      if (st.modal) abrir(st.modal);
    }
    const k0 = k => k.split('|')[0];

    function rolar(y) {
      const atual = new Date().getFullYear() === y ? new Date().getMonth() : 0;
      const el = document.getElementById('pan-mes-' + atual);
      if (el && atual > 0) el.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
    }

    /* ---------- Janela de detalhes, situação e conta imprevista ---------- */
    function fechar() {
      st.modal = null;
      const m = $('#pan-modal');
      if (m) { m.hidden = true; m.innerHTML = ''; }
    }

    function abrir(modal) {
      st.modal = modal;
      const m = $('#pan-modal');
      if (!m) return;
      const html = modal.tipo === 'item' ? detalheHTML(st.itens[modal.chave]) : novoHTML(modal.dia);
      if (!html) { fechar(); return; }
      m.innerHTML = `<div class="pan-fundo" data-pan-fechar></div><div class="pan-janela card" role="dialog" aria-modal="true" aria-labelledby="pan-j-t">${html}</div>`;
      m.hidden = false;
      const foco = m.querySelector('[autofocus]') || m.querySelector('button.on') || m.querySelector('button');
      if (foco) foco.focus();
    }

    const botoesSit = (atual, desab) => `<div class="pan-sits" role="group" aria-label="Situação">${Object.keys(SIT).map(s =>
      `<button type="button" class="pan-sit s-${s}${s === atual ? ' on' : ''}" data-pan-sit="${s}" aria-pressed="${s === atual}"${desab ? ' disabled' : ''}>${SIT[s].nome}</button>`).join('')}</div>`;

    function detalheHTML(i) {
      if (!i) return '';
      const area = i.tipo === 'fatura'
        ? `Cartão de ${esc(nomeDe(i.dono))}${i.bandeira ? ' · ' + esc(i.bandeira) : ''}`
        : esc(i.p === 'casa' ? 'Casa' : nomeDe(i.p));
      let corpo = '';
      if (i.tipo === 'fatura') {
        const todas = F.linhasDaFatura(i.dono, i.card, i.venc);
        const total = r2(todas.reduce((t, x) => t + x.r.val, 0));
        const nomeArea = p => (p === 'casa' ? 'Casa' : nomeDe(p));
        corpo = `${i.parte ? `<p class="pan-nota">Parte ${i.parte === 'casa' ? 'da casa' : 'da empresa'} na fatura de ${esc(i.card)} de ${esc(nomeDe(i.dono))}, que soma ${brl2(total)} neste vencimento.</p>` : ''}
          <h3 class="pan-j-sub">Compras nesta fatura</h3>
          <ul class="pan-compras">${todas.sort((a, b) => a.r.venc.localeCompare(b.r.venc)).map(({ p, r }) => `<li><span>${dataBR(r.venc).slice(0, 5)}</span><span>${esc(r.obs || r.cat)}<small>${esc(r.cat)} · ${esc(nomeArea(p))}${r.parc && r.parc !== '1/1' ? ' · parcela ' + esc(r.parc) : ''}</small></span><b>${brl2(r.val)}</b></li>`).join('')}</ul>
          <p class="pan-nota">Marcar a fatura como <b>Concluído</b> confirma o pagamento de todas essas compras. Voltar para Previsto ou Atrasado desfaz essa confirmação.</p>`;
      } else {
        const r = i.r;
        const tags = [i.fixa ? 'Conta fixa' : '', i.imprevisto ? 'Imprevisto' : '', r.origem === 'whatsapp' ? 'Lançado pelo WhatsApp' : ''].filter(Boolean);
        corpo = `<dl class="pan-dl">
            <div><dt>Categoria</dt><dd>${esc(r.cat)}</dd></div>
            <div><dt>Pagamento</dt><dd>${esc(r.forma)}${r.card && r.card !== '-' ? ' · ' + esc(r.card) : ''}</dd></div>
            <div><dt>Parcela</dt><dd>${esc(r.parc || '1/1')}</dd></div>
            <div><dt>Pago em</dt><dd>${r.pag ? dataBR(r.pag) : '—'}</dd></div>
          </dl>
          ${tags.length ? `<p class="pan-tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</p>` : ''}
          ${i.cartao ? `<p class="pan-nota">Compra no crédito do ${esc(i.cartao)}: configure o fechamento e o vencimento do cartão para ela ir para o dia da fatura.</p>` : ''}`;
      }
      const links = i.tipo === 'fatura' ? '' : `<div class="pan-links">
        <a class="linkarrow" href="#${lancDe(i.p)}" data-pan-fechar>Ver em Lançamentos <span aria-hidden="true">→</span></a>
        ${i.fixa ? `<a class="linkarrow" href="#contas-${st.visao}" data-pan-fechar>Editar conta fixa <span aria-hidden="true">→</span></a>` : ''}
        ${i.imprevisto ? '<button class="linkbtn" data-pan-excluir>Excluir este imprevisto</button>' : ''}
      </div>`;
      return `<header class="pan-j-h"><div><h2 id="pan-j-t">${esc(i.nome)}</h2><p>${esc(i.cat)} · ${area}</p></div>
          <button class="pan-x" data-pan-fechar aria-label="Fechar">×</button></header>
        <div class="pan-j-valor"><strong>${brl2(i.val)}</strong><span>vence em ${dataBR(i.venc)}</span></div>
        <h3 class="pan-j-sub">Situação</h3>
        ${botoesSit(i.situacao, semBanco() && i.tipo === 'fatura')}
        ${semBanco() && i.tipo === 'fatura' ? '<p class="pan-nota">Ative o panorama no banco para salvar a situação das faturas.</p>' : ''}
        ${corpo}${links}`;
    }

    function novoHTML(dia) {
      const p = base(st.visao);
      const prof = PROFILES[p];
      if (!prof) return '';
      const { formas, cartoes } = F.opcoes(p, 'out');
      const sit = dia < F.hoje() ? 'atrasado' : 'previsto';
      const opts = (l, sel) => l.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');
      return `<header class="pan-j-h"><div><h2 id="pan-j-t">Conta imprevista</h2><p>${esc(nomeVisao(st.visao))} · algo que não estava planejado</p></div>
          <button class="pan-x" data-pan-fechar aria-label="Fechar">×</button></header>
        <form class="pan-form" id="pan-form-novo" novalidate>
          <div class="pan-campos">
            <label>Vencimento<input type="date" name="venc" value="${esc(dia)}" required></label>
            <label>Valor (R$)<input name="val" inputmode="decimal" placeholder="0,00" autocomplete="off" autofocus></label>
            <label class="largo">Descrição<input name="obs" maxlength="80" placeholder="Ex.: conserto do carro" autocomplete="off"></label>
            <label>Categoria<select name="cat">${opts(prof.catOut, prof.catOut[0])}</select></label>
            <label>Forma<select name="forma">${opts(formas, formas.includes('PIX') ? 'PIX' : formas[0])}</select></label>
            <label class="pan-card-campo" hidden>Cartão<select name="card">${opts(cartoes.filter(c => c !== '-'), '')}</select></label>
          </div>
          <h3 class="pan-j-sub">Situação</h3>
          ${botoesSit(sit)}
          <input type="hidden" name="sit" value="${sit}">
          <p class="form-err" id="pan-erro" role="alert" hidden></p>
          <button class="btn btn-ink" type="submit">Lançar conta</button>
        </form>`;
    }

    function lancarNovo(form) {
      const el = form.elements, erro = $('#pan-erro');
      const falha = (msg, campo) => { erro.textContent = msg; erro.hidden = false; if (campo) campo.focus(); };
      const val = Math.round(parseValor(el.val.value) * 100) / 100;
      if (!el.venc.value) return falha('Informe o vencimento.', el.venc);
      if (!(val > 0)) return falha('Informe um valor maior que zero, por exemplo 150,00.', el.val);
      const sit = el.sit.value, venc = el.venc.value, hoje = F.hoje();
      const credito = el.forma.value === 'Crédito';
      if (credito && !el.card.value) return falha('Escolha o cartão.', el.card);
      const p = base(st.visao);
      const [r] = F.adicionar(p, 'out', {
        cat: el.cat.value, obs: el.obs.value.trim(), val, forma: el.forma.value, tipo: 'Único',
        card: credito ? el.card.value : '-', venc,
        pag: sit === 'concluido' ? (venc <= hoje ? venc : hoje) : '',
        imprevisto: true, atrasado: sit === 'atrasado'
      }, 1);
      fechar();
      route();
      toast(`${r.obs || r.cat}: ${brl2(val)} lançado em ${dataBR(venc)}.`);
    }

    function mudarSituacao(s) {
      const i = st.itens[st.modal && st.modal.chave];
      if (!i) return;
      if (i.tipo === 'fatura') F.definirSituacaoFatura(i.dono, i.card, i.venc, s);
      else F.definirSituacao(i.p, i.r.id, s);
      fechar();
      route();
      toast(`${i.nome}: ${SIT[s].nome.toLowerCase()}.`);
    }

    /* ---------- Contas fixas e cartões ---------- */
    const mesAno = iso => `${MES[Number(iso.slice(5, 7)) - 1].toLowerCase()}/${iso.slice(0, 4)}`;
    function periodo(cf) {
      if (cf.meses == null) return `desde ${mesAno(cf.inicio)}, sem prazo`;
      const [y, m] = cf.inicio.split('-').map(Number);
      const fim = F.diaNoMes(y, m - 1 + cf.meses - 1, 1);
      return `${mesAno(cf.inicio)} a ${mesAno(fim)} (${cf.meses} ${cf.meses > 1 ? 'meses' : 'mês'})`;
    }

    function formFixaHTML(p) {
      const prof = PROFILES[p];
      const { formas, cartoes } = F.opcoes(p, 'out');
      const e = st.editar ? F.contasFixas(p).find(x => x.id === st.editar) : null;
      if (st.editar && !e) st.editar = null;
      const v = e || { descricao: '', cat: prof.catOut[0], val: '', dia: '', inicio: F.hoje().slice(0, 7) + '-01', meses: null, forma: formas.includes('Boleto') ? 'Boleto' : formas[0], card: '-' };
      const opts = (l, sel) => l.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');
      const credito = v.forma === 'Crédito';
      return `<form class="pan-form pan-fixa" id="pan-form-fixa" novalidate>
        <div class="pan-campos">
          <label class="largo">Descrição<input name="descricao" maxlength="80" value="${esc(v.descricao)}" placeholder="Ex.: Aluguel, Internet, Consórcio" autocomplete="off"></label>
          <label>Categoria<select name="cat">${opts(prof.catOut, v.cat)}</select></label>
          <label>Valor por mês (R$)<input name="val" inputmode="decimal" value="${v.val ? num2(v.val) : ''}" placeholder="0,00" autocomplete="off"></label>
          <label>Vence todo dia<input name="dia" type="number" min="1" max="31" value="${esc(v.dia)}" placeholder="10"></label>
          <label>Começa em<input name="inicio" type="month" value="${esc(v.inicio.slice(0, 7))}"></label>
          <label>Duração<select name="duracao"><option value="sem"${v.meses == null ? ' selected' : ''}>Sem prazo</option><option value="meses"${v.meses != null ? ' selected' : ''}>Número de meses</option></select></label>
          <label class="pan-meses-campo"${v.meses == null ? ' hidden' : ''}>Meses<input name="meses" type="number" min="1" max="600" value="${v.meses != null ? v.meses : 12}"></label>
          <label>Forma<select name="forma">${opts(formas, v.forma)}</select></label>
          <label class="pan-card-campo"${credito ? '' : ' hidden'}>Cartão<select name="card">${opts(cartoes.filter(c => c !== '-'), v.card)}</select></label>
        </div>
        <p class="form-err" id="pan-erro-fixa" role="alert" hidden></p>
        <div class="pan-acoes">
          <button class="btn btn-ink btn-sm" type="submit"${semBanco() ? ' disabled' : ''}>${e ? 'Salvar alterações' : 'Adicionar conta fixa'}</button>
          ${e ? '<button class="btn btn-ghost btn-sm" type="button" data-fixa-cancelar>Cancelar</button>' : ''}
        </div>
      </form>`;
    }

    async function salvarFixa(form) {
      const el = form.elements, erro = $('#pan-erro-fixa');
      const falha = (msg, campo) => { erro.textContent = msg; erro.hidden = false; if (campo) campo.focus(); };
      erro.hidden = true;
      const p = base(st.visao);
      const val = Math.round(parseValor(el.val.value) * 100) / 100;
      const dia = parseInt(el.dia.value, 10);
      const meses = el.duracao.value === 'sem' ? null : parseInt(el.meses.value, 10);
      if (!el.descricao.value.trim()) return falha('Dê um nome para a conta.', el.descricao);
      if (!(val > 0)) return falha('Informe o valor de cada mês, por exemplo 99,90.', el.val);
      if (!(dia >= 1 && dia <= 31)) return falha('O dia do vencimento vai de 1 a 31.', el.dia);
      if (!/^\d{4}-\d{2}$/.test(el.inicio.value)) return falha('Informe o mês de início.', el.inicio);
      if (meses !== null && !(meses >= 1 && meses <= 600)) return falha('A duração vai de 1 a 600 meses.', el.meses);
      const credito = el.forma.value === 'Crédito';
      if (credito && !el.card.value) return falha('Escolha o cartão.', el.card);
      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      const msg = await F.salvarContaFixa({
        id: st.editar || null, profile: p, descricao: el.descricao.value.trim(), cat: el.cat.value, val, dia,
        inicio: el.inicio.value + '-01', meses, forma: el.forma.value, card: credito ? el.card.value : '-'
      });
      if (msg) { btn.disabled = false; return falha(msg); }
      const editou = !!st.editar;
      st.editar = null;
      route();
      toast(editou ? 'Conta fixa atualizada; os meses em aberto já seguem o novo valor e dia.' : 'Conta fixa criada: os vencimentos já estão no Panorama.');
    }

    function cartoesHTML(p) {
      if (p !== 'titular' && p !== 'parceiro') {
        const donos = casal() ? ['titular', 'parceiro'] : ['titular'];
        return `<section class="card panel"><div class="panel-h"><h2>Cartões de crédito</h2></div>
          <p class="muted">As compras no crédito ${p === 'casa' ? 'da casa' : 'da empresa'} usam os cartões de ${donos.map(d => esc(nomeDe(d))).join(' e ')}. O fechamento e o vencimento de cada cartão ficam na área de cada pessoa: ${donos.map(d => `<a href="#contas-${d}">${esc(nomeDe(d))}</a>`).join(' · ')}.</p></section>`;
      }
      const cards = PROFILES[p].cartoes;
      const hoje = F.hoje();
      const linhas = cards.map(c => {
        const cfg = F.cartaoCfg(p, c) || {};
        const pronto = F.cartaoPronto(cfg);
        let prox = '';
        if (pronto) {
          const y = Number(hoje.slice(0, 4));
          const itens = F.panoramaAno(p, y).meses.flatMap(m => m.itens).concat(F.panoramaAno(p, y + 1).meses.flatMap(m => m.itens))
            .filter(i => i.tipo === 'fatura' && i.card === c && i.situacao !== 'concluido');
          const f = itens[0];
          prox = f ? `${dataBR(f.venc)} · <b>${brl2(f.val)}</b> <span class="pan-chip s-${f.situacao}">${SIT[f.situacao].nome}</span>` : 'Nenhuma fatura em aberto';
        }
        const sel = BANDEIRAS.map(b => `<option value="${esc(b)}"${(cfg.bandeira || '') === b ? ' selected' : ''}>${b || '—'}</option>`).join('');
        const dia = (campo, v) => `<input class="pan-cartao" type="number" min="1" max="31" inputmode="numeric" data-dono="${p}" data-card="${esc(c)}" data-campo="${campo}" value="${v || ''}" placeholder="dia" aria-label="${campo === 'fechamento' ? 'Dia de fechamento' : 'Dia de vencimento'} do ${esc(c)}"${semBanco() ? ' disabled' : ''}>`;
        return `<tr><td class="strong">${esc(c)}</td>
          <td><select class="pan-cartao" data-dono="${p}" data-card="${esc(c)}" data-campo="bandeira" aria-label="Bandeira do ${esc(c)}"${semBanco() ? ' disabled' : ''}>${sel}</select></td>
          <td>${dia('fechamento', cfg.fechamento)}</td><td>${dia('vencimento', cfg.vencimento)}</td>
          <td>${pronto ? prox : '<span class="muted">Informe os dois dias</span>'}</td></tr>`;
      }).join('');
      return `<section class="card panel"><div class="panel-h"><h2>Cartões de crédito de ${esc(nomeDe(p))}</h2></div>
        <p class="muted">Compras feitas antes do dia do fechamento entram na fatura que vence logo depois; a partir do fechamento, vão para a fatura seguinte. Cada fatura aparece no Panorama no dia do vencimento, com as compras de ${esc(nomeDe(p))}${p === 'titular' && PROFILES.empresa ? ', da empresa' : ''}${casal() ? ' e da casa' : ''} nesse cartão.</p>
        <div class="tablewrap" tabindex="0" role="region" aria-label="Cartões de crédito"><table class="tbl-compact pan-cartoes">
          <thead><tr><th scope="col"><span class="thtxt">Cartão</span></th><th scope="col"><span class="thtxt">Bandeira</span></th><th scope="col"><span class="thtxt">Fecha dia</span></th><th scope="col"><span class="thtxt">Vence dia</span></th><th scope="col"><span class="thtxt">Próxima fatura</span></th></tr></thead>
          <tbody>${linhas}</tbody></table></div></section>`;
    }

    function renderContas(visao) {
      st.visao = visao;
      const p = base(visao);
      const lista = F.contasFixas(p);
      const mesAtual = F.hoje().slice(0, 7);
      const ativasNoMes = lista.filter(cf => {
        if (cf.inicio.slice(0, 7) > mesAtual) return false;
        if (cf.meses == null) return true;
        const [y, m] = cf.inicio.split('-').map(Number);
        return F.diaNoMes(y, m - 1 + cf.meses - 1, 1).slice(0, 7) >= mesAtual;
      });
      const totalMes = r2(ativasNoMes.reduce((t, cf) => t + cf.val, 0));
      const linhas = lista.map(cf => {
        const prox = F.proximaDaFixa(cf.id);
        const s = prox ? F.situacao(prox) : null;
        const confirmar = st.excluir === cf.id;
        return `<tr>
          <td class="strong">${esc(cf.descricao)}</td><td>${esc(cf.cat)}</td><td class="num">${brl2(cf.val)}</td>
          <td>Dia ${cf.dia}</td><td>${periodo(cf)}</td><td>${esc(cf.forma)}${cf.card && cf.card !== '-' ? ' · ' + esc(cf.card) : ''}</td>
          <td>${prox ? `${dataBR(prox.venc)} <span class="pan-chip s-${s}">${SIT[s].nome}</span>` : '<span class="muted">Encerrada</span>'}</td>
          <td class="pan-tab-acoes">${confirmar
            ? `<span>Excluir os meses em aberto daqui para frente?</span><button class="btn btn-danger btn-sm" data-fixa-excluir-ok="${esc(cf.id)}">Excluir</button><button class="btn btn-ghost btn-sm" data-fixa-excluir-nao>Não</button>`
            : `<button class="linkbtn" data-fixa-editar="${esc(cf.id)}">Editar</button><button class="linkbtn" data-fixa-excluir="${esc(cf.id)}">Excluir</button>`}</td>
        </tr>`;
      }).join('');
      $('#view').innerHTML = `
        ${pageHead('Contas fixas e cartões — ' + esc(nomeVisao(visao)))}
        ${avisoBanco()}
        <section class="card panel">
          <div class="panel-h"><h2>${st.editar ? 'Editar conta fixa' : 'Nova conta fixa'}</h2><span class="panel-note">Contas que se repetem todo mês</span></div>
          <p class="muted">Cada conta fixa vira um lançamento por mês, no dia do vencimento, pelo prazo escolhido. Ela aparece no Panorama, em Lançamentos, nos Dashboards e para o CFO. Mudou o valor ou o dia? Edite aqui: os meses em aberto acompanham, e os já pagos ficam como estão.</p>
          ${formFixaHTML(p)}
        </section>
        <section class="card panel">
          <div class="panel-h"><h2>Contas fixas de ${esc(nomeVisao(visao))}</h2><span class="panel-note">${lista.length ? `${brl2(totalMes)} por mês em ${MES_LONGO[Number(mesAtual.slice(5)) - 1].toLowerCase()}` : ''}</span></div>
          ${lista.length ? `<div class="tablewrap" tabindex="0" role="region" aria-label="Contas fixas"><table class="tbl-compact pan-fixas">
            <thead><tr>${['Conta', 'Categoria', 'Valor', 'Vencimento', 'Período', 'Pagamento', 'Próximo vencimento', ''].map((h, i) => `<th scope="col" class="${i === 2 ? 'num' : ''}"><span class="thtxt">${h}</span></th>`).join('')}</tr></thead>
            <tbody>${linhas}</tbody></table></div>` : '<p class="muted">Nenhuma conta fixa ainda. Use o formulário acima para cadastrar aluguel, internet, consórcio, assinaturas e outras contas mensais.</p>'}
        </section>
        ${cartoesHTML(p)}
        ${footer('Contas fixas e cartões — ' + esc(nomeVisao(visao)))}`;
    }

    /* ---------- Eventos ---------- */
    function click(b) {
      const d = b.dataset;
      if ('panFechar' in d) { fechar(); return b.tagName !== 'A'; }
      if (d.panItem) { abrir({ tipo: 'item', chave: d.panItem }); return true; }
      if (d.panNovo) { abrir({ tipo: 'novo', dia: d.panNovo }); return true; }
      if (d.panIr) { const el = document.getElementById('pan-mes-' + d.panIr); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
      if (d.panSit) {
        const form = b.closest('#pan-form-novo');
        if (form) {
          form.elements.sit.value = d.panSit;
          $$('.pan-sit', form).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
          return true;
        }
        mudarSituacao(d.panSit);
        return true;
      }
      if ('panExcluir' in d) {
        const i = st.itens[st.modal && st.modal.chave];
        if (i && i.tipo === 'lanc') {
          const pos = F.remover(i.p, 'out', i.r.id);
          fechar(); route();
          if (pos) toast(`${i.nome}: excluído.`, { label: 'Desfazer', fn: () => { F.restaurarLinha(i.p, 'out', pos); route(); } });
        }
        return true;
      }
      if (d.fixaEditar) { st.editar = d.fixaEditar; st.excluir = null; route(); window.scrollTo(0, 0); return true; }
      if ('fixaCancelar' in d) { st.editar = null; route(); return true; }
      if (d.fixaExcluir) { st.excluir = d.fixaExcluir; route(); return true; }
      if ('fixaExcluirNao' in d) { st.excluir = null; route(); return true; }
      if (d.fixaExcluirOk) {
        b.disabled = true;
        F.excluirContaFixa(d.fixaExcluirOk).then(msg => {
          st.excluir = null;
          if (st.editar === d.fixaExcluirOk) st.editar = null;
          route();
          toast(msg || 'Conta fixa excluída. Os meses já pagos continuam no histórico.');
        });
        return true;
      }
      return false;
    }

    function submit(form) {
      if (form.id === 'pan-form-novo') { lancarNovo(form); return true; }
      if (form.id === 'pan-form-fixa') { salvarFixa(form); return true; }
      return false;
    }

    function change(el) {
      if (el.classList.contains('pan-cartao')) {
        const campo = el.dataset.campo;
        let v = el.value;
        if (campo !== 'bandeira') {
          v = v === '' ? null : parseInt(v, 10);
          if (v !== null && !(v >= 1 && v <= 31)) { el.setAttribute('aria-invalid', 'true'); toast('O dia vai de 1 a 31.'); return true; }
          el.removeAttribute('aria-invalid');
        }
        F.definirCartao(el.dataset.dono, el.dataset.card, { [campo]: v });
        const c = F.cartaoCfg(el.dataset.dono, el.dataset.card);
        toast(F.cartaoPronto(c) ? `${el.dataset.card}: fecha dia ${c.fechamento} e vence dia ${c.vencimento}.` : 'Salvo.');
        route();
        return true;
      }
      const form = el.closest('#pan-form-novo, #pan-form-fixa');
      if (!form) return false;
      if (el.name === 'forma') { const c = $('.pan-card-campo', form); if (c) c.hidden = el.value !== 'Crédito'; }
      if (el.name === 'duracao') $('.pan-meses-campo', form).hidden = el.value === 'sem';
      if (el.name === 'venc' && form.id === 'pan-form-novo') {
        const s = el.value && el.value < F.hoje() ? 'atrasado' : 'previsto';
        if (form.elements.sit.value !== 'concluido') { const b = form.querySelector(`[data-pan-sit="${s}"]`); if (b) click(b); }
      }
      return true;
    }

    function keydown(e) {
      if (e.key === 'Escape' && st.modal) { fechar(); return true; }
      return false;
    }

    return { render, renderContas, rolar, click, submit, change, keydown, temModal: () => !!st.modal, limpar: () => { st.modal = null; st.editar = null; st.excluir = null; } };
  };
})();
