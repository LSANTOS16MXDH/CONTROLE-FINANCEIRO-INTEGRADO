/* Estrutura das contas e regras de cálculo. Nenhum valor vem pré-preenchido:
   todos os números do site são calculados a partir do que o usuário lança,
   e metas e limites são definidos por ele em Plano de Contas.

   Os nomes (titular, parceiro(a), empresa) e as categorias são de cada CFI e
   vêm do banco depois do login (configurar). Aqui fica só o modelo genérico,
   usado por quem ainda não personalizou as próprias categorias. */
(function () {
  'use strict';

  const MES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const MES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const PESSOAL = {
    catIn: ['SALÁRIO', 'RENDA EXTRA', 'VENDAS', 'OUTROS'],
    descIn: { 'RENDA EXTRA': 'Bicos, freelas e serviços avulsos' },
    catOut: ['CASA', 'ALIMENTAÇÃO', 'TRANSPORTE', 'COMBUSTÍVEL', 'SAÚDE', 'EDUCAÇÃO', 'ROUPA', 'CABELO E BELEZA', 'LAZER', 'ASSINATURAS', 'INTERNET E CELULAR', 'SEGUROS', 'JUROS E TARIFAS', 'OUTROS'],
    descOut: {
      CASA: 'Aluguel, condomínio e contas pessoais da casa',
      ASSINATURAS: 'Streaming, apps e armazenamento',
      'JUROS E TARIFAS': 'Juros de cartão, IOF e tarifas bancárias'
    },
    cartoes: ['NUBANK', 'ITAÚ', 'INTER', 'SANTANDER'],
    conta: ''
  };

  /* Modelo de quem acabou de criar o CFI. Uma estrutura salva no banco
     (workspaces.estrutura) substitui cada parte que ela trouxer. */
  const MODELO = {
    titular: PESSOAL,
    parceiro: PESSOAL,
    casa: {
      catIn: [],
      catOut: ['ALIMENTAÇÃO', 'INSUMOS CASA', 'LUZ & ÁGUA', 'INTERNET', 'HIGIENE PESSOAL', 'LAZER', 'VIAGENS', 'INVESTIMENTOS'],
      cartoes: []
    },
    empresa: {
      catIn: ['R-P (Vendas)', 'R-P (Produtos)', 'R-S (Serviços)'],
      catOut: ['D-RH (Folha)', 'D-MKT (Marketing)', 'D-O (Operacional)', 'D-O (Impostos)', 'D-O (Fornecedores)'],
      descOut: { 'D-O (Impostos)': 'DAS, impostos e taxas', 'D-O (Fornecedores)': 'Materiais e mercadorias' },
      contaPJ: 'CONTA PJ'
    },
    casalCats: [
      ['ALIMENTAÇÃO & INSUMOS', ['ALIMENTAÇÃO', 'INSUMOS CASA']],
      ['LUZ, ÁGUA, INTERNET', ['LUZ & ÁGUA', 'INTERNET']],
      ['HIGIENE PESSOAL', ['HIGIENE PESSOAL']],
      ['LAZER & VIAGENS', ['LAZER', 'VIAGENS']],
      ['INVESTIMENTOS & RESERVA', ['INVESTIMENTOS']]
    ],
    // O saldo em caixa do titular soma a empresa quando as duas usam a mesma conta.
    caixaComEmpresa: false
  };

  /* Estes objetos mudam de conteúdo a cada login, mas nunca de referência,
     porque as outras telas guardam o atalho para eles. */
  const PROFILES = {};
  const CASAL_CARDS = {};
  const CARTOES_CASA = [];
  const CFI = { casal: true, titular: '', parceiro: '', empresa: '', caixaComEmpresa: false, contaPJ: '' };
  let CASAL_CATS = MODELO.casalCats;

  const lista = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : null);
  const mapa = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  /* ws: { plan, nome_titular, nome_parceiro, nome_empresa, estrutura } */
  function configurar(ws) {
    ws = ws || {};
    const est = mapa(ws.estrutura);
    const casal = ws.plan !== 'individual';
    const nomes = {
      titular: (ws.nome_titular || 'Você').trim(),
      parceiro: (ws.nome_parceiro || 'Parceiro(a)').trim(),
      casa: 'Casa',
      empresa: (ws.nome_empresa || 'Empresa').trim()
    };
    const ordem = casal ? ['titular', 'parceiro', 'casa', 'empresa'] : ['titular', 'empresa'];
    Object.keys(PROFILES).forEach(k => delete PROFILES[k]);
    ordem.forEach(p => {
      const m = MODELO[p], e = mapa(est[p]);
      PROFILES[p] = {
        nome: nomes[p], curto: nomes[p],
        catIn: lista(e.catIn) || m.catIn.slice(),
        catOut: lista(e.catOut) || m.catOut.slice(),
        descIn: Object.assign({}, m.descIn, mapa(e.descIn)),
        descOut: Object.assign({}, m.descOut, mapa(e.descOut)),
        cartoes: lista(e.cartoes) || (m.cartoes || []).slice(),
        conta: typeof e.conta === 'string' ? e.conta : (m.conta || '')
      };
    });
    // A empresa paga com os cartões do titular, além da conta PJ.
    PROFILES.empresa.cartoes = lista(mapa(est.empresa).cartoes) || PROFILES.titular.cartoes.slice();
    CFI.casal = casal;
    CFI.titular = nomes.titular; CFI.parceiro = casal ? nomes.parceiro : ''; CFI.empresa = nomes.empresa;
    CFI.caixaComEmpresa = est.caixaComEmpresa === true;
    CFI.contaPJ = (typeof mapa(est.empresa).contaPJ === 'string' && mapa(est.empresa).contaPJ.trim()) || MODELO.empresa.contaPJ;
    CASAL_CATS = Array.isArray(est.casalCats) ? est.casalCats : MODELO.casalCats;

    /* Cartões do casal: um por pessoa ("NUBANK ANA") e um consolidado
       quando os dois têm o mesmo cartão. */
    Object.keys(CASAL_CARDS).forEach(k => delete CASAL_CARDS[k]);
    CARTOES_CASA.length = 0;
    if (casal) {
      const donos = ['titular', 'parceiro'];
      const todos = [];
      donos.forEach(p => PROFILES[p].cartoes.forEach(c => { if (!todos.includes(c)) todos.push(c); }));
      todos.forEach(c => {
        const pares = donos.filter(p => PROFILES[p].cartoes.includes(c)).map(p => [p, c]);
        if (pares.length > 1) CASAL_CARDS[c + ' (CONSOLIDADO)'] = pares;
        pares.forEach(([p]) => {
          const tag = c + ' ' + PROFILES[p].curto.toUpperCase();
          CASAL_CARDS[tag] = [[p, c]];
          CARTOES_CASA.push(tag);
        });
      });
    }
    ROWS = vazio();
    CFG = cfgVazia();
  }

  /* Opções dos formulários de lançamento. Os agentes do servidor usam as mesmas
     listas (supabase/functions/_shared/perfis.json, gerado por scripts/gerar-perfis.mjs). */
  const TIPOS = ['Único', 'Recorrente', 'Parcelado'];
  const FORMAS = {
    saida: ['Crédito', 'Débito', 'Débito Aut.', 'PIX', 'Transferência', 'Boleto'],
    entrada: ['PIX', 'Transferência', 'Boleto', 'Dinheiro'],
    empSaida: ['PIX', 'Crédito', 'Débito', 'PIX Corp', 'Crédito PJ', 'Débito Aut.', 'Boleto', 'Transferência'],
    empEntrada: ['PIX', 'Boleto', 'Transferência', 'PIX Corp']
  };

  /* Formas de pagamento e cartões/contas aceitos em cada formulário ('-' = nenhum). */
  function opcoes(p, kind) {
    const out = kind === 'out', emp = p === 'empresa';
    const formas = emp ? (out ? FORMAS.empSaida : FORMAS.empEntrada) : (out ? FORMAS.saida : FORMAS.entrada);
    const cartoes = !out ? [] : emp ? [CFI.contaPJ, '-'].concat(PROFILES[p].cartoes)
      : p === 'casa' ? ['-'].concat(CARTOES_CASA) : ['-'].concat(PROFILES[p].cartoes);
    return { formas, cartoes };
  }

  /* ---------- Armazenamento ----------
     Sem login configurado, salva neste navegador. Com login, os dados moram no
     banco e aqui fica só a cópia em memória; nada financeiro vai para o navegador. */
  const KEY = 'cfi.dados.v3';
  const KEYS_ANTIGAS = ['cfi.lancamentos.v1', 'cfi.dados.v2']; // exemplos e perfis com nomes fixos
  const conf = window.CFI_CONFIG || {};
  const MODO_NUVEM = !!(conf.SUPABASE_URL && conf.SUPABASE_ANON_KEY);
  let remoto = null;

  const vazio = () => {
    const rows = {};
    Object.keys(PROFILES).forEach(p => { rows[p] = { in: [], out: [] }; });
    return rows;
  };
  /* cartoes: "dono|CARTÃO" -> { bandeira, fechamento, vencimento }
     faturas: "dono|CARTÃO|AAAA-MM-DD" -> { situacao, pago_em, entry_ids }
     fixas: contas fixas (modelo de cada conta mensal) */
  const cfgVazia = () => ({ metas: {}, limites: {}, empresa: {}, cartoes: {}, faturas: {}, fixas: [] });

  let ROWS = {};
  let CFG = cfgVazia();
  configurar({});

  if (!MODO_NUVEM) {
    try {
      KEYS_ANTIGAS.forEach(k => localStorage.removeItem(k));
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.rows && d.rows.titular) { ROWS = Object.assign(vazio(), d.rows); CFG = Object.assign(cfgVazia(), d.cfg); }
      }
    } catch (e) { /* armazenamento indisponível: começa vazio */ }
  }

  function save() {
    if (MODO_NUVEM) return;
    try { localStorage.setItem(KEY, JSON.stringify({ rows: ROWS, cfg: CFG })); } catch (e) { /* sem persistência */ }
  }

  function novoId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  /* Forma estável dos dados, para saber se o que veio do banco é mesmo novidade. */
  function assinatura(rows, cfg) {
    const ordenar = o => (o && typeof o === 'object' && !Array.isArray(o)
      ? Object.keys(o).sort().reduce((a, k) => { a[k] = ordenar(o[k]); return a; }, {}) : o);
    const linhas = Object.keys(rows).sort().map(p => ['in', 'out'].map(k => rows[p][k]
      .map(r => [r.id, r.cat, r.obs, Number(r.val), r.forma, r.tipo, r.card, r.parc, r.venc, r.pag || '', !!r.atrasado, !!r.imprevisto, r.fixa || ''])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
    return JSON.stringify([linhas, ordenar(cfg)]);
  }

  function substituir(rows, cfg) {
    if (assinatura(rows, cfg) === assinatura(ROWS, CFG)) return false;
    ROWS = rows; CFG = cfg;
    return true;
  }
  function conectarRemoto(api) { remoto = api; }
  function desconectarRemoto() { remoto = null; ROWS = vazio(); CFG = cfgVazia(); }

  /* ---------- Utilidades ---------- */
  const mesDe = iso => Number(iso.slice(5, 7)) - 1;
  const anoDe = iso => Number(iso.slice(0, 4));
  const conta = (r, mode) => !!r.pag || mode === 'prev';
  const noMes = (r, m, y) => mesDe(r.venc) === m && anoDe(r.venc) === y;

  function hoje() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }

  function anos() {
    const atual = new Date().getFullYear();
    const lista = new Set([atual - 1, atual, atual + 1]);
    Object.values(ROWS).forEach(g => g.in.concat(g.out).forEach(r => lista.add(anoDe(r.venc))));
    return Array.from(lista).sort((a, b) => b - a);
  }

  function soma(p, kind, m, y, mode, filtro) {
    if (!ROWS[p]) return 0;
    return ROWS[p][kind]
      .filter(r => conta(r, mode) && noMes(r, m, y) && (!filtro || filtro(r)))
      .reduce((s, r) => s + r.val, 0);
  }

  const metaDe = (p, kind, cat) => (CFG.metas[p] && CFG.metas[p][kind + ':' + cat]) || 0;
  const limiteDe = (p, card) => (CFG.limites[p] && CFG.limites[p][card]) || 0;
  const metaEmpresa = k => CFG.empresa[k] || 0;

  function definirMeta(p, kind, cat, v) {
    CFG.metas[p] = CFG.metas[p] || {};
    if (v > 0) CFG.metas[p][kind + ':' + cat] = v; else delete CFG.metas[p][kind + ':' + cat];
    save();
    if (remoto) remoto.definirAlvo('meta', `${p}|${kind}:${cat}`, v);
  }
  function definirLimite(p, card, v) {
    CFG.limites[p] = CFG.limites[p] || {};
    if (v > 0) CFG.limites[p][card] = v; else delete CFG.limites[p][card];
    save();
    if (remoto) remoto.definirAlvo('limite', `${p}|${card}`, v);
  }
  function definirMetaEmpresa(k, v) {
    if (v > 0) CFG.empresa[k] = v; else delete CFG.empresa[k];
    save();
    if (remoto) remoto.definirAlvo('empresa', k, v);
  }

  /* ---------- Cálculos ---------- */
  function totais(p, m, y, mode) {
    if (p === 'casal') {
      const a = totais('titular', m, y, mode), b = totais('parceiro', m, y, mode);
      const rec = a.rec + b.rec, gas = a.gas + b.gas + soma('casa', 'out', m, y, mode);
      return { rec, gas, saldo: rec - gas };
    }
    const rec = soma(p, 'in', m, y, mode), gas = soma(p, 'out', m, y, mode);
    return { rec, gas, saldo: rec - gas };
  }

  const serieAnual = (p, y, mode) => MES.map((_, m) => totais(p, m, y, mode));

  function metas(p, m, y, mode) {
    return PROFILES[p].catIn
      .map(nome => ({ nome, meta: metaDe(p, 'in', nome), real: soma(p, 'in', m, y, mode, r => r.cat === nome) }))
      .filter(c => c.meta > 0 || c.real > 0);
  }

  /* Agrupa as saídas da casa e das duas pessoas nas categorias do casal,
     para que a soma das categorias feche com o total gasto. */
  function casalGrupos() {
    const quem = ['casa', 'titular', 'parceiro'];
    const usados = new Set();
    const grupos = CASAL_CATS.map(([nome, cats]) => {
      cats.forEach(c => usados.add(c));
      const membros = [];
      quem.forEach(p => cats.forEach(c => { if (PROFILES[p].catOut.includes(c)) membros.push([p, c]); }));
      return { nome, membros };
    });
    const extras = {};
    ['titular', 'parceiro'].forEach(p => PROFILES[p].catOut.forEach(c => {
      if (!usados.has(c)) (extras[c] = extras[c] || []).push([p, c]);
    }));
    Object.keys(extras).forEach(nome => grupos.push({ nome, membros: extras[nome] }));
    return grupos;
  }

  function despesas(p, m, y, mode) {
    if (p === 'casal') {
      return casalGrupos().map(g => ({
        nome: g.nome,
        val: g.membros.reduce((s, [q, c]) => s + soma(q, 'out', m, y, mode, r => r.cat === c), 0)
      }));
    }
    return PROFILES[p].catOut.map(nome => ({ nome, val: soma(p, 'out', m, y, mode, r => r.cat === nome) }));
  }

  /* Fatura do mês: com fechamento e vencimento configurados, cada compra
     entra no mês em que a fatura dela vence (igual ao Panorama). Sem eles,
     entra no mês da própria compra. */
  function fatura(owner, card, m, y, mode) {
    const tag = card + ' ' + PROFILES[owner].curto.toUpperCase();
    const doMes = r => {
      if (!conta(r, mode) || r.forma !== 'Crédito') return false;
      const v = vencFatura(owner, card, r.venc);
      return v ? mesDe(v) === m && anoDe(v) === y : noMes(r, m, y);
    };
    const somar = (p, f) => (ROWS[p] ? ROWS[p].out.filter(r => doMes(r) && f(r)).reduce((s, r) => s + r.val, 0) : 0);
    return somar(owner, r => r.card === card)
      + (owner === 'titular' ? somar('empresa', r => r.card === card) : 0)
      + somar('casa', r => r.card === tag);
  }

  function faturas(p, card, y, mode) {
    const pares = p === 'casal' ? CASAL_CARDS[card] : [[p, card]];
    return {
      limite: pares.reduce((s, [o, c]) => s + limiteDe(o, c), 0),
      meses: MES.map((_, m) => pares.reduce((s, [o, c]) => s + fatura(o, c, m, y, mode), 0))
    };
  }

  /* Dinheiro em caixa hoje: tudo o que já foi recebido menos tudo o que já foi pago,
     de todos os meses. Fatura futura ainda não saiu da conta. O titular soma a
     empresa quando os dois passam pela mesma conta (caixaComEmpresa). */
  function caixaDe(p) {
    const emp = CFI.caixaComEmpresa ? ['empresa'] : [];
    if (p === 'titular') return ['titular'].concat(emp);
    if (p === 'casal') return ['titular', 'parceiro', 'casa'].concat(emp);
    return [p];
  }
  function saldoCaixa(p) {
    if (p !== 'casal' && !ROWS[p]) return 0;
    if (p === 'casal' && !CFI.casal) return 0;
    const d = hoje();
    const total = (q, kind) => ROWS[q][kind].filter(r => r.pag && r.pag <= d).reduce((s, r) => s + r.val, 0);
    return Math.round(caixaDe(p).reduce((s, q) => s + total(q, 'in') - total(q, 'out'), 0) * 100) / 100;
  }

  /* Seis meses até o mês escolhido, atravessando a virada do ano quando preciso. */
  function evolucaoCategoria(p, nome, kind, m, y, mode) {
    const meses = [0, 1, 2, 3, 4, 5].map(i => (m - 5 + i + 12) % 12);
    const anoDo = i => (i > m ? y - 1 : y);
    let plano, real;
    if (p === 'casal' && kind === 'in') {
      plano = PROFILES[nome].catIn.reduce((s, c) => s + metaDe(nome, 'in', c), 0);
      real = i => totais(nome, i, anoDo(i), mode).rec;
    } else if (p === 'casal') {
      const g = casalGrupos().find(x => x.nome === nome);
      plano = g.membros.reduce((s, [q, c]) => s + metaDe(q, 'out', c), 0);
      real = i => g.membros.reduce((s, [q, c]) => s + soma(q, 'out', i, anoDo(i), mode, r => r.cat === c), 0);
    } else {
      plano = metaDe(p, kind, nome);
      real = i => soma(p, kind, i, anoDo(i), mode, r => r.cat === nome);
    }
    return { meses, plan: meses.map(() => plano), real: meses.map(real) };
  }

  function empresa(y) {
    const meses = MES.map((_, i) => i);
    const rec = meses.map(m => soma('empresa', 'in', m, y, 'real'));
    const gas = meses.map(m => soma('empresa', 'out', m, y, 'real'));
    const totalRec = rec.reduce((a, b) => a + b, 0);
    const totalGas = gas.reduce((a, b) => a + b, 0);
    const resultado = rec.map((v, i) => v - gas[i]);
    let acc = 0;
    const acumulado = resultado.map(v => (acc += v));
    const doAno = r => anoDe(r.venc) === y;
    const mix = (prefixos, kind) => prefixos.map(nome => ({
      nome,
      val: ROWS.empresa[kind].filter(r => r.pag && doAno(r) && r.cat.startsWith(nome)).reduce((s, r) => s + r.val, 0)
    })).filter(s => s.val > 0);
    const pendente = kind => ROWS.empresa[kind].filter(r => !r.pag && doAno(r)).reduce((s, r) => s + r.val, 0);
    return {
      meses, rec, gas, resultado, acumulado, totalRec, totalGas,
      metaRec: metaEmpresa('metaRec'), tetoDesp: metaEmpresa('tetoDesp'), metaRes: metaEmpresa('metaRes'),
      res: totalRec - totalGas,
      aReceber: pendente('in'), aPagar: pendente('out'),
      mixRec: mix(['R-P', 'R-S'], 'in'), mixDesp: mix(['D-RH', 'D-MKT', 'D-O'], 'out')
    };
  }

  /* ---------- Panorama: situação, faturas e contas fixas ----------
     Situação de uma conta:
       Concluído = tem data de pagamento;
       Atrasado  = marcada como atrasada, ou vencida sem pagamento;
       Previsto  = o resto.
     Compras no crédito não aparecem uma a uma: entram na fatura do cartão,
     no dia em que a fatura vence (fechamento e vencimento em CFG.cartoes).
     Sem esses dias, a compra fica na própria data, com um aviso. */
  const SITUACOES = ['atrasado', 'previsto', 'concluido'];

  function situacao(r) {
    if (r.pag) return 'concluido';
    if (r.atrasado || r.venc < hoje()) return 'atrasado';
    return 'previsto';
  }

  const pad2 = n => String(n).padStart(2, '0');
  /* Data do dia "d" no mês (m de 0 a 11); 31 em fevereiro vira o último dia. */
  function diaNoMes(y, m, d) {
    while (m > 11) { m -= 12; y++; }
    while (m < 0) { m += 12; y--; }
    const ultimo = new Date(y, m + 1, 0).getDate();
    return `${y}-${pad2(m + 1)}-${pad2(Math.min(d, ultimo))}`;
  }

  const chaveCartao = (dono, card) => dono + '|' + card;
  const cartaoCfg = (dono, card) => CFG.cartoes[chaveCartao(dono, card)] || null;
  const cartaoPronto = c => !!(c && c.fechamento >= 1 && c.vencimento >= 1);

  /* Dia em que vence a fatura de uma compra feita em "data". Compra no dia do
     fechamento ou depois cai na fatura seguinte. Se o vencimento for depois do
     fechamento, a fatura vence no mesmo mês em que fecha; senão, no mês seguinte. */
  function vencFatura(dono, card, data) {
    const c = cartaoCfg(dono, card);
    if (!cartaoPronto(c) || !data) return null;
    const y = anoDe(data), m = mesDe(data);
    let fecha = m;
    if (data >= diaNoMes(y, m, c.fechamento)) fecha++;
    return diaNoMes(y, fecha + (c.vencimento > c.fechamento ? 0 : 1), c.vencimento);
  }

  /* De quem é o cartão de uma compra no crédito: [dono, cartão], ou null. */
  function donoDoCartao(p, r) {
    if (r.forma !== 'Crédito' || !r.card || r.card === '-') return null;
    if (p === 'casa') { const par = CASAL_CARDS[r.card]; return par && par.length === 1 ? par[0] : null; }
    if (p === 'empresa') return PROFILES.titular && PROFILES.titular.cartoes.includes(r.card) ? ['titular', r.card] : null;
    return PROFILES[p] && PROFILES[p].cartoes.includes(r.card) ? [p, r.card] : null;
  }

  /* Áreas cujas compras entram nas faturas de cada pessoa (como em fatura()). */
  const origensDoDono = dono => [dono].concat(dono === 'titular' && PROFILES.empresa ? ['empresa'] : [], CFI.casal ? ['casa'] : []);

  /* Todas as compras de uma fatura (de todas as áreas), para pagar de uma vez. */
  function linhasDaFatura(dono, card, venc) {
    const out = [];
    origensDoDono(dono).forEach(p => (ROWS[p] ? ROWS[p].out : []).forEach(r => {
      const d = donoDoCartao(p, r);
      if (d && d[0] === dono && d[1] === card && vencFatura(dono, card, r.venc) === venc) out.push({ p, r });
    }));
    return out;
  }

  const chaveFatura = (dono, card, venc) => `${dono}|${card}|${venc}`;
  function situacaoFatura(dono, card, venc, linhas) {
    const f = CFG.faturas[chaveFatura(dono, card, venc)];
    if (f && SITUACOES.includes(f.situacao)) return f.situacao;
    if (venc >= hoje()) return 'previsto';
    /* Fatura passada sem registro: paga se todas as compras dela já foram confirmadas. */
    const l = linhas || linhasDaFatura(dono, card, venc);
    return l.length && l.every(x => x.r.pag) ? 'concluido' : 'atrasado';
  }

  /* Contas de uma visão do panorama ('titular', 'parceiro', 'casal' ou
     'empresa') no ano: cada conta no dia em que vence. */
  function panoramaAno(visao, y) {
    const base = visao === 'casal' ? 'casa' : visao;
    const itens = [], faturasAbertas = {}, semConfig = new Set();
    const ano = d => anoDe(d) === y;

    /* De onde vêm as compras no crédito que esta visão mostra. */
    let fontes;
    if (visao === 'titular' || visao === 'parceiro') fontes = origensDoDono(visao);
    else fontes = [base];

    fontes.forEach(p => (ROWS[p] ? ROWS[p].out : []).forEach(r => {
      const d = donoDoCartao(p, r);
      /* Pessoa: só compras nos próprios cartões. Casal e empresa: as dela. */
      if (d && (visao === 'casal' || visao === 'empresa' || d[0] === visao)) {
        const venc = vencFatura(d[0], d[1], r.venc);
        if (venc) {
          if (!ano(venc)) return;
          const k = chaveFatura(d[0], d[1], venc);
          const f = faturasAbertas[k] || (faturasAbertas[k] = {
            tipo: 'fatura', chave: 'f|' + k, dono: d[0], card: d[1], venc, val: 0, linhas: [],
            parte: visao === 'casal' ? 'casa' : visao === 'empresa' ? 'empresa' : ''
          });
          f.val += r.val;
          f.linhas.push({ p, r });
          return;
        }
        semConfig.add(chaveCartao(d[0], d[1]));
      }
      /* Contas da própria área (e compras de cartão sem dias configurados). */
      if (p !== base || !ano(r.venc)) return;
      itens.push({
        tipo: 'lanc', chave: `l|${p}|${r.id}`, p, r, venc: r.venc, val: r.val,
        nome: r.obs || r.cat, cat: r.cat, situacao: situacao(r),
        imprevisto: !!r.imprevisto, fixa: !!r.fixa, cartao: d ? d[1] : ''
      });
    }));

    Object.values(faturasAbertas).forEach(f => {
      const c = cartaoCfg(f.dono, f.card) || {};
      f.val = Math.round(f.val * 100) / 100;
      f.nome = f.card + (f.parte ? ' ' + PROFILES[f.dono].curto.toUpperCase() : '');
      f.bandeira = c.bandeira || '';
      f.cat = 'Fatura do cartão';
      f.situacao = situacaoFatura(f.dono, f.card, f.venc, f.parte ? null : f.linhas);
      itens.push(f);
    });

    itens.sort((a, b) => a.venc.localeCompare(b.venc) || b.val - a.val);

    /* Entradas, para comparar com as contas. */
    const entradasDe = visao === 'casal' ? ['titular', 'parceiro'] : [base];
    const meses = MES.map((_, m) => {
      const doMes = itens.filter(i => mesDe(i.venc) === m);
      const somaSit = s => doMes.filter(i => i.situacao === s).reduce((t, i) => t + i.val, 0);
      const entradas = entradasDe.reduce((t, p) => t + (ROWS[p] ? ROWS[p].in.filter(r => noMes(r, m, y)).reduce((s, r) => s + r.val, 0) : 0), 0);
      const recebido = entradasDe.reduce((t, p) => t + (ROWS[p] ? ROWS[p].in.filter(r => noMes(r, m, y) && r.pag).reduce((s, r) => s + r.val, 0) : 0), 0);
      const total = doMes.reduce((t, i) => t + i.val, 0);
      const r2 = v => Math.round(v * 100) / 100;
      return {
        m, itens: doMes,
        pago: r2(somaSit('concluido')), aPagar: r2(somaSit('previsto')), atrasado: r2(somaSit('atrasado')),
        imprevistos: r2(doMes.filter(i => i.imprevisto).reduce((t, i) => t + i.val, 0)),
        fixas: r2(doMes.filter(i => i.fixa).reduce((t, i) => t + i.val, 0)),
        faturas: r2(doMes.filter(i => i.tipo === 'fatura').reduce((t, i) => t + i.val, 0)),
        total: r2(total), entradas: r2(entradas), recebido: r2(recebido),
        qtdAtrasadas: doMes.filter(i => i.situacao === 'atrasado').length,
        maior: doMes.reduce((a, i) => (!a || i.val > a.val ? i : a), null)
      };
    });
    return { meses, semConfig: Array.from(semConfig) };
  }

  /* ---------- Mudar a situação ---------- */
  function achar(p, id) { return ROWS[p] ? ROWS[p].out.concat(ROWS[p].in).find(x => String(x.id) === String(id)) : null; }

  function definirSituacao(p, id, s) {
    const r = achar(p, id);
    if (!r || !SITUACOES.includes(s)) return null;
    if (s === 'concluido') { if (!r.pag) r.pag = hoje(); r.atrasado = false; }
    else { r.pag = ''; r.atrasado = s === 'atrasado'; }
    save();
    if (remoto) remoto.atualizarLancamento(r.id, { pag: r.pag || null, atrasado: r.atrasado });
    return r;
  }

  /* Pagar a fatura confirma todas as compras dela que ainda estavam em aberto;
     reabrir desfaz exatamente essas. */
  function definirSituacaoFatura(dono, card, venc, s) {
    if (!SITUACOES.includes(s)) return;
    const k = chaveFatura(dono, card, venc);
    const antes = CFG.faturas[k] || { entry_ids: [] };
    const linhas = linhasDaFatura(dono, card, venc);
    let ids = [], pagoEm = null;
    if (s === 'concluido') {
      pagoEm = antes.pago_em || hoje();
      linhas.forEach(({ r }) => { if (!r.pag) { r.pag = pagoEm; ids.push(r.id); } });
      ids = Array.from(new Set((antes.entry_ids || []).concat(ids)));
    } else {
      const desfazer = new Set(antes.entry_ids || []);
      linhas.forEach(({ r }) => { if (desfazer.has(r.id)) r.pag = ''; });
    }
    CFG.faturas[k] = { situacao: s, pago_em: pagoEm, entry_ids: ids };
    save();
    if (remoto) {
      linhas.forEach(({ r }) => { if (s === 'concluido' ? ids.includes(r.id) : (antes.entry_ids || []).includes(r.id)) remoto.atualizarLancamento(r.id, { pag: r.pag || null }); });
      remoto.salvarFatura({ profile: dono, card, vencimento: venc, situacao: s, pago_em: pagoEm, entry_ids: ids });
    }
  }

  function definirCartao(dono, card, campos) {
    const k = chaveCartao(dono, card);
    const c = Object.assign({ bandeira: '', fechamento: null, vencimento: null }, CFG.cartoes[k], campos);
    CFG.cartoes[k] = c;
    save();
    if (remoto) remoto.salvarCartao({ profile: dono, card, bandeira: c.bandeira || '', fechamento: c.fechamento || null, vencimento: c.vencimento || null });
    return c;
  }

  /* ---------- Contas fixas ----------
     No modo nuvem, o banco cria um lançamento por mês (salvar_conta_fixa).
     Sem login, o mesmo cálculo roda aqui. */
  function ocorrencias(cf, ate) {
    const out = [];
    const [y0, m0] = cf.inicio.split('-').map(Number);
    for (let i = 0; cf.meses == null || i < cf.meses; i++) {
      const venc = diaNoMes(y0, m0 - 1 + i, cf.dia);
      if (venc.slice(0, 7) > ate) break;
      out.push({ i, venc, parc: cf.meses == null ? 'Fixa' : `${i + 1}/${cf.meses}` });
    }
    return out;
  }
  const horizonte = () => `${new Date().getFullYear() + 1}-12`;

  function salvarContaFixaLocal(cf) {
    const lista = CFG.fixas;
    const id = cf.id || novoId();
    const i = lista.findIndex(x => x.id === id);
    const nova = Object.assign({}, cf, { id });
    if (i >= 0) lista[i] = nova; else lista.push(nova);
    const p = cf.profile;
    /* Em aberto segue a conta; fora do prazo sai; meses faltando são criados. */
    const ocs = ocorrencias(nova, horizonte());
    const meses = new Set(ocs.map(o => o.venc.slice(0, 7)));
    Object.keys(ROWS).forEach(q => { ROWS[q].out = ROWS[q].out.filter(r => r.fixa !== id || r.pag || meses.has(r.venc.slice(0, 7))); });
    ocs.forEach(o => {
      const ja = Object.values(ROWS).some(g => g.out.some(r => r.fixa === id && r.venc.slice(0, 7) === o.venc.slice(0, 7)));
      const r = ja ? Object.values(ROWS).map(g => g.out.find(x => x.fixa === id && x.venc.slice(0, 7) === o.venc.slice(0, 7))).find(Boolean) : null;
      if (r && !r.pag) Object.assign(r, { cat: nova.cat, obs: nova.descricao, val: nova.val, forma: nova.forma, card: nova.card || '-', venc: o.venc, parc: o.parc });
      if (!ja) ROWS[p].out.push({ id: novoId(), cat: nova.cat, obs: nova.descricao, val: nova.val, forma: nova.forma, tipo: 'Recorrente', card: nova.card || '-', parc: o.parc, venc: o.venc, pag: '', fixa: id, atrasado: false, imprevisto: false });
    });
    save();
    return id;
  }

  async function salvarContaFixa(cf) {
    if (remoto) return remoto.salvarContaFixa(cf);
    salvarContaFixaLocal(cf);
    return '';
  }
  async function excluirContaFixa(id) {
    if (remoto) return remoto.excluirContaFixa(id);
    const mes = hoje().slice(0, 7);
    CFG.fixas = CFG.fixas.filter(x => x.id !== id);
    Object.keys(ROWS).forEach(q => {
      ROWS[q].out = ROWS[q].out.filter(r => !(r.fixa === id && !r.pag && r.venc.slice(0, 7) >= mes));
      ROWS[q].out.forEach(r => { if (r.fixa === id) r.fixa = null; });
    });
    save();
    return '';
  }
  const contasFixas = p => CFG.fixas.filter(x => x.profile === p).slice().sort((a, b) => a.dia - b.dia || a.descricao.localeCompare(b.descricao));
  function proximaDaFixa(id) {
    const d = hoje();
    let prox = null;
    Object.values(ROWS).forEach(g => g.out.forEach(r => {
      if (r.fixa === id && (!r.pag || r.venc >= d) && (!prox || r.venc < prox.venc)) prox = r;
    }));
    return prox;
  }

  /* ---------- Formulários ---------- */
  function formPadrao(p, kind) {
    const out = kind === 'out', d = hoje();
    const base = { cat: (out ? PROFILES[p].catOut : PROFILES[p].catIn)[0], obs: '', val: '', tipo: 'Único', parcelas: '3', venc: d, pag: d, card: '-' };
    if (p === 'empresa') return Object.assign(base, out ? { forma: 'PIX Corp', card: CFI.contaPJ } : { forma: 'Boleto' });
    if (!out) return Object.assign(base, { forma: 'PIX' });
    if (p === 'casa') return Object.assign(base, { forma: 'Débito' });
    return Object.assign(base, { forma: 'Crédito', card: PROFILES[p].cartoes[0] });
  }

  /* ---------- Escrita ---------- */
  function adicionar(p, kind, dados, parcelas) {
    const n = Math.max(1, parcelas || 1);
    const [y0, m0, d0] = dados.venc.split('-').map(Number);
    const criados = [];
    for (let i = 0; i < n; i++) {
      const total = (m0 - 1) + i, y = y0 + Math.floor(total / 12), m = total % 12;
      const ultimo = new Date(y, m + 1, 0).getDate(); // 31/01 + 1 mês cai em 28/02, não em março
      const venc = `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(d0, ultimo)).padStart(2, '0')}`;
      const r = Object.assign({}, dados, { id: novoId(), venc, pag: i === 0 ? dados.pag : '', parc: (i + 1) + '/' + n });
      ROWS[p][kind].push(r);
      criados.push(r);
    }
    save();
    if (remoto) remoto.salvarLancamentos(p, kind, criados);
    return criados;
  }

  function remover(p, kind, id) {
    const lista = ROWS[p][kind];
    const i = lista.findIndex(r => String(r.id) === String(id));
    if (i < 0) return null;
    const [r] = lista.splice(i, 1);
    save();
    if (remoto) remoto.excluir(r.id);
    return { r, i };
  }

  function restaurarLinha(p, kind, pos) { ROWS[p][kind].splice(pos.i, 0, pos.r); save(); if (remoto) remoto.restaurar(pos.r.id); }

  function confirmar(p, kind, id, data) {
    const r = ROWS[p][kind].find(x => String(x.id) === String(id));
    if (r) { r.pag = data; save(); if (remoto) remoto.confirmar(r.id, data); }
    return r;
  }

  function apagarTudo() {
    ROWS = vazio();
    CFG = cfgVazia();
    if (remoto) { remoto.apagarTudo(); return; }
    try { localStorage.removeItem(KEY); } catch (e) { /* nada a limpar */ }
  }

  window.FIN = {
    MES, MES_LONGO, PROFILES, CASAL_CARDS, CFI, MODELO, TIPOS, FORMAS, opcoes, configurar,
    situacao, panoramaAno, vencFatura, cartaoCfg, cartaoPronto, definirSituacao, definirSituacaoFatura, definirCartao,
    salvarContaFixa, excluirContaFixa, contasFixas, proximaDaFixa, linhasDaFatura, diaNoMes,
    linhas: (p, kind) => ROWS[p][kind],
    temDados: () => Object.values(ROWS).some(g => g.in.length + g.out.length > 0)
      || Object.keys(CFG.metas).length + Object.keys(CFG.limites).length + Object.keys(CFG.empresa).length > 0,
    totais, saldoCaixa, serieAnual, metas, despesas, casalGrupos, faturas, evolucaoCategoria, empresa,
    metaDe, limiteDe, metaEmpresa, definirMeta, definirLimite, definirMetaEmpresa,
    substituir, conectarRemoto, desconectarRemoto, formPadrao, adicionar, remover, restaurarLinha, confirmar, apagarTudo, mesDe, anoDe, hoje, anos
  };
})();
