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
  const cfgVazia = () => ({ metas: {}, limites: {}, empresa: {} });

  let ROWS = {};
  let CFG = cfgVazia();
  configurar({});

  if (!MODO_NUVEM) {
    try {
      KEYS_ANTIGAS.forEach(k => localStorage.removeItem(k));
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.rows && d.rows.titular) { ROWS = Object.assign(vazio(), d.rows); CFG = d.cfg || cfgVazia(); }
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
      .map(r => [r.id, r.cat, r.obs, Number(r.val), r.forma, r.tipo, r.card, r.parc, r.venc, r.pag || ''])
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

  function fatura(owner, card, m, y, mode) {
    const tag = card + ' ' + PROFILES[owner].curto.toUpperCase();
    return soma(owner, 'out', m, y, mode, r => r.card === card && r.forma === 'Crédito')
      + (owner === 'titular' ? soma('empresa', 'out', m, y, mode, r => r.card === card && r.forma === 'Crédito') : 0)
      + soma('casa', 'out', m, y, mode, r => r.card === tag && r.forma === 'Crédito');
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
    linhas: (p, kind) => ROWS[p][kind],
    temDados: () => Object.values(ROWS).some(g => g.in.length + g.out.length > 0)
      || Object.keys(CFG.metas).length + Object.keys(CFG.limites).length + Object.keys(CFG.empresa).length > 0,
    totais, saldoCaixa, serieAnual, metas, despesas, casalGrupos, faturas, evolucaoCategoria, empresa,
    metaDe, limiteDe, metaEmpresa, definirMeta, definirLimite, definirMetaEmpresa,
    substituir, conectarRemoto, desconectarRemoto, formPadrao, adicionar, remover, restaurarLinha, confirmar, apagarTudo, mesDe, anoDe, hoje, anos
  };
})();
