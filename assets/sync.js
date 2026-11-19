/* Login e sincronização com o Supabase.
   Estados: local (sem configuração) | carregando | anonimo | sem-espaco | pedido
   | configurar | aguardando-config | pronto | erro

   sem-espaco: logado, sem CFI. Cria um (quem comprou) ou pede para entrar.
   pedido: pediu para entrar no CFI de alguém e espera a autorização.
   configurar: titular de um CFI antigo, ainda sem os nomes.
   aguardando-config: membro de um CFI que o titular ainda não configurou. */
(function () {
  'use strict';

  const cfg = window.CFI_CONFIG || {};
  const F = window.FIN;
  const ativo = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const DESTINO = 'cfi.destino';
  const INTENCAO = 'cfi.intencao';
  const COLUNAS_WS = 'id,name,plan,max_members,nome_titular,nome_parceiro,email_parceiro,nome_empresa,estrutura';

  const A = {
    ativo, apple: !!cfg.APPLE_LOGIN,
    estado: ativo ? 'carregando' : 'local',
    usuario: null, espaco: null, membros: [], papel: null, erro: '',
    pedido: null, pedidos: [], podeCriar: false, intencao: null,
    ehDono: () => !ativo || A.papel === 'owner'
  };

  const avisar = nome => window.dispatchEvent(new Event(nome));
  const definir = (estado, erro) => { A.estado = estado; A.erro = erro || ''; avisar('cfi:auth'); };

  const MENSAGENS = {
    nao_autorizado: 'Este e-mail não tem uma compra do Controle Financeiro Integrado. Entre com o e-mail usado na compra ou, se o seu par já comprou, entre no CFI dele(a).',
    ja_participa: 'Esta conta já participa de um CFI.',
    espaco_cheio: 'Este CFI já está com todas as contas ocupadas.',
    cfi_nao_encontrado: 'Não encontramos um CFI com este e-mail que tenha cadastrado o seu e-mail como parceiro(a). Confira o e-mail digitado e peça para o titular conferir o seu e-mail no cadastro.',
    nomes_obrigatorios: 'Preencha todos os nomes.',
    email_invalido: 'Confira o e-mail do(a) parceiro(a).',
    email_proprio: 'O e-mail do(a) parceiro(a) precisa ser diferente do seu.',
    tem_parceiro: 'Este CFI já tem duas contas. Para ser individual, ele precisa ter só a sua.',
    parceiro_ja_entrou: 'O(a) parceiro(a) já entrou no CFI; o e-mail não pode mais ser trocado.',
    pedido_respondido: 'Este pedido já foi respondido.'
  };
  const traduzir = e => {
    const m = (e && e.message) || '';
    const k = Object.keys(MENSAGENS).find(c => m.includes(c));
    return k ? MENSAGENS[k] : 'Não foi possível concluir. Verifique a conexão e tente de novo.';
  };

  let db = null, canal = null, canalAgentes = null, canalEspera = null, canalPanorama = null, timer = 0;

  /* Panorama (contas fixas, cartões e faturas) depende do supabase/panorama.sql.
     Sem ele, o resto do site segue normal e a tela do panorama mostra um aviso.
     'carregando' | 'pronto' | 'sem-banco' */
  A.panorama = 'carregando';
  const faltaTabela = e => !!e && (e.code === '42P01' || e.code === '42703' || e.code === 'PGRST205' || e.code === 'PGRST202' || /does not exist|schema cache/i.test(e.message || ''));

  /* ---------- Conversão entre banco e tela ---------- */
  const paraBanco = (p, kind, r) => Object.assign({
    id: r.id, workspace_id: A.espaco.id, profile: p, kind, cat: r.cat, obs: r.obs || '', val: r.val,
    forma: r.forma, tipo: r.tipo || 'Único', card: r.card || '-', parc: r.parc, venc: r.venc, pag: r.pag || null
  }, A.panorama === 'pronto' ? { imprevisto: !!r.imprevisto, atrasado: !!r.atrasado } : {});
  const daTela = l => ({
    id: l.id, cat: l.cat, obs: l.obs, val: Number(l.val), forma: l.forma, tipo: l.tipo,
    card: l.card, parc: l.parc, venc: l.venc, pag: l.pag || '', origem: l.origem || 'site',
    imprevisto: !!l.imprevisto, atrasado: !!l.atrasado, fixa: l.conta_fixa_id || null
  });
  const isoDia = v => (v ? String(v).slice(0, 10) : null);

  /* Contas fixas, cartões e faturas do CFI. */
  async function baixarPanorama(c) {
    const ws = A.espaco.id;
    const [fx, ct, ft] = await Promise.all([
      db.from('contas_fixas').select('id,profile,descricao,cat,val,dia,inicio,meses,forma,card').eq('workspace_id', ws).order('created_at'),
      db.from('cartoes').select('profile,card,bandeira,fechamento,vencimento').eq('workspace_id', ws),
      db.from('faturas').select('profile,card,vencimento,situacao,pago_em,entry_ids').eq('workspace_id', ws)
    ]);
    const erro = fx.error || ct.error || ft.error;
    if (erro) {
      if (faltaTabela(erro)) { A.panorama = 'sem-banco'; return; }
      throw erro;
    }
    A.panorama = 'pronto';
    c.fixas = fx.data.map(x => Object.assign({}, x, { val: Number(x.val), inicio: isoDia(x.inicio) }));
    ct.data.forEach(x => { c.cartoes[x.profile + '|' + x.card] = { bandeira: x.bandeira || '', fechamento: x.fechamento, vencimento: x.vencimento }; });
    ft.data.forEach(x => {
      c.faturas[`${x.profile}|${x.card}|${isoDia(x.vencimento)}`] = { situacao: x.situacao, pago_em: isoDia(x.pago_em), entry_ids: x.entry_ids || [] };
    });
  }

  /* O PostgREST devolve no máximo 1000 linhas por vez. */
  async function todasAsLinhas() {
    const linhas = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await db.from('entries').select('*')
        .eq('workspace_id', A.espaco.id).is('deleted_at', null)
        .order('created_at').order('id').range(de, de + 999);
      if (error) throw error;
      linhas.push(...data);
      if (data.length < 1000) return linhas;
    }
  }

  async function baixar() {
    const [linhas, alvos] = await Promise.all([
      todasAsLinhas(),
      db.from('targets').select('scope,key,value').eq('workspace_id', A.espaco.id)
    ]);
    if (alvos.error) throw alvos.error;
    const rows = {};
    Object.keys(F.PROFILES).forEach(p => { rows[p] = { in: [], out: [] }; });
    linhas.forEach(l => { if (rows[l.profile]) rows[l.profile][l.kind].push(daTela(l)); });
    const c = { metas: {}, limites: {}, empresa: {}, cartoes: {}, faturas: {}, fixas: [] };
    if (A.panorama !== 'sem-banco') await baixarPanorama(c);
    alvos.data.forEach(({ scope, key, value }) => {
      const v = Number(value);
      if (!(v > 0)) return;
      if (scope === 'empresa') { c.empresa[key] = v; return; }
      const i = key.indexOf('|'), p = key.slice(0, i), k = key.slice(i + 1);
      const alvo = scope === 'meta' ? c.metas : c.limites;
      (alvo[p] = alvo[p] || {})[k] = v;
    });
    return { rows, cfg: c };
  }

  /* Só redesenha a tela quando os dados mudaram de verdade. */
  async function atualizar() {
    if (A.estado !== 'pronto') return;
    try {
      const d = await baixar();
      if (A.estado === 'pronto' && F.substituir(d.rows, d.cfg)) avisar('cfi:remoto');
    } catch (e) { /* tenta de novo no próximo aviso ou ao voltar para a aba */ }
  }
  const agendar = () => { clearTimeout(timer); timer = setTimeout(atualizar, 250); };

  function falhou() {
    window.dispatchEvent(new CustomEvent('cfi:aviso', { detail: 'Não foi possível salvar. Verifique a conexão e lance de novo; o que não foi salvo sai da tela ao reconectar.' }));
    atualizar();
  }
  const enviar = consulta => Promise.resolve(consulta).then(r => { if (r.error) falhou(); }, falhou);

  const API = {
    salvarLancamentos: (p, kind, rows) => enviar(db.from('entries').insert(rows.map(r => paraBanco(p, kind, r)))),
    confirmar: (id, data) => enviar(db.from('entries').update({ pag: data }).eq('id', id)),
    excluir: id => enviar(db.from('entries').update({ deleted_at: new Date().toISOString() }).eq('id', id)),
    restaurar: id => enviar(db.from('entries').update({ deleted_at: null }).eq('id', id)),
    definirAlvo: (scope, key, value) => enviar(db.from('targets').upsert({ workspace_id: A.espaco.id, scope, key, value })),
    apagarTudo: () => enviar(db.rpc('apagar_dados', { p_ws: A.espaco.id })),

    /* Panorama */
    atualizarLancamento: (id, campos) => enviar(db.from('entries')
      .update(A.panorama === 'pronto' ? campos : { pag: campos.pag }).eq('id', id)),
    salvarFatura: f => enviar(db.from('faturas').upsert(Object.assign({ workspace_id: A.espaco.id }, f))),
    salvarCartao: c => enviar(db.from('cartoes').upsert(Object.assign({ workspace_id: A.espaco.id }, c))),
    salvarContaFixa: async cf => {
      const { error } = await db.rpc('salvar_conta_fixa', {
        p_id: cf.id || null, p_ws: A.espaco.id, p_profile: cf.profile, p_descricao: cf.descricao, p_cat: cf.cat,
        p_val: cf.val, p_dia: cf.dia, p_inicio: cf.inicio, p_meses: cf.meses == null ? null : cf.meses,
        p_forma: cf.forma, p_card: cf.card || '-'
      });
      if (error) return faltaTabela(error) ? 'O panorama ainda não foi ativado no banco.' : 'Não foi possível salvar a conta fixa. Verifique a conexão e tente de novo.';
      await atualizar();
      return '';
    },
    excluirContaFixa: async id => {
      const { error } = await db.rpc('excluir_conta_fixa', { p_id: id });
      if (error) return 'Não foi possível excluir a conta fixa. Tente de novo.';
      await atualizar();
      return '';
    }
  };

  /* ---------- Sessão ---------- */
  function desligarCanais() {
    if (canal) { db.removeChannel(canal); canal = null; }
    if (canalPanorama) { db.removeChannel(canalPanorama); canalPanorama = null; }
    if (canalEspera) { db.removeChannel(canalEspera); canalEspera = null; }
  }
  function encerrar() {
    desligarCanais();
    if (canalAgentes) { db.removeChannel(canalAgentes); canalAgentes = null; }
    A.agentes = agentesVazio();
    clearTimeout(timer);
    F.desconectarRemoto();
    A.usuario = null; A.espaco = null; A.membros = []; A.papel = null;
    A.pedido = null; A.pedidos = []; A.podeCriar = false;
    A.panorama = 'carregando';
  }

  async function carregarEspaco() {
    definir('carregando');
    desligarCanais();
    try {
      const { data: minha, error: e1 } = await db.from('workspace_members')
        .select('workspace_id,role').eq('user_id', A.usuario.id).maybeSingle();
      if (e1) throw e1;
      if (!minha) { await semEspaco(); return; }
      A.papel = minha.role;
      const [ws, membros] = await Promise.all([
        db.from('workspaces').select(COLUNAS_WS).eq('id', minha.workspace_id).single(),
        db.from('workspace_members').select('user_id,role,email,display_name,joined_at')
          .eq('workspace_id', minha.workspace_id).order('joined_at')
      ]);
      if (ws.error) throw ws.error;
      if (membros.error) throw membros.error;
      A.espaco = ws.data;
      A.membros = membros.data;
      A.pedido = null;
      lembrarIntencao(null);
      /* CFI criado antes da tela de nomes: o titular completa; o outro espera. */
      if (!A.espaco.nome_titular) {
        if (A.papel === 'owner') { definir('configurar'); return; }
        definir('aguardando-config');
        return;
      }
      F.configurar(A.espaco);
      const d = await baixar();
      F.conectarRemoto(API);
      F.substituir(d.rows, d.cfg);
      await carregarPedidos();
      ligarTempoReal();
      definir('pronto');
      carregarAgentes(true);
      /* Contas fixas sem prazo: completa os meses até dezembro do ano que vem. */
      if (A.panorama === 'pronto') db.rpc('gerar_contas_fixas', { p_ws: A.espaco.id }).then(r => { if (!r.error && r.data > 0) agendar(); });
    } catch (e) {
      definir('erro', 'Não foi possível carregar seus dados. Verifique a conexão e tente de novo.');
    }
  }

  /* Sem CFI: vê se já pediu para entrar em um e se pode criar o próprio. */
  async function semEspaco() {
    const [ped, pode] = await Promise.all([
      db.from('pedidos_entrada').select('id,status,nome_titular,created_at')
        .eq('user_id', A.usuario.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      db.rpc('pode_criar_cfi')
    ]);
    if (ped.error) throw ped.error;
    A.podeCriar = !pode.error && pode.data === true;
    const p = ped.data;
    A.pedido = p && (p.status === 'pendente' || p.status === 'recusado') ? p : null;
    if (A.pedido && A.pedido.status === 'pendente') {
      esperarResposta();
      definir('pedido');
      return;
    }
    definir('sem-espaco');
  }

  /* Quem pediu para entrar vê a resposta do titular na hora. */
  function esperarResposta() {
    let espera = 0;
    canalEspera = db.channel('pedido-' + A.usuario.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_entrada', filter: `user_id=eq.${A.usuario.id}` }, () => {
        clearTimeout(espera); espera = setTimeout(() => { if (A.estado === 'pedido') carregarEspaco(); }, 300);
      })
      .subscribe();
  }
  A.conferirPedido = () => { if (A.usuario) carregarEspaco(); };

  /* Pedidos de entrada esperando a autorização do titular. */
  async function carregarPedidos() {
    if (A.papel !== 'owner' || !A.espaco || A.espaco.plan !== 'conjunto') { A.pedidos = []; return; }
    const { data, error } = await db.from('pedidos_entrada').select('id,email,nome,created_at')
      .eq('workspace_id', A.espaco.id).eq('status', 'pendente').order('created_at');
    if (!error) A.pedidos = data;
  }
  async function atualizarPedidos() {
    if (A.estado !== 'pronto') return;
    const antes = A.pedidos.map(p => p.id).join();
    await carregarPedidos();
    const { data } = await db.from('workspace_members').select('user_id,role,email,display_name,joined_at')
      .eq('workspace_id', A.espaco.id).order('joined_at');
    if (data) A.membros = data;
    if (A.pedidos.map(p => p.id).join() !== antes || data) avisar('cfi:pedidos');
  }

  function ligarTempoReal() {
    const filtro = `workspace_id=eq.${A.espaco.id}`;
    canal = db.channel('espaco-' + A.espaco.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: filtro }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'targets', filter: filtro }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_entrada', filter: filtro }, () => { atualizarPedidos(); })
      /* Ao reconectar, busca o que mudou enquanto o aparelho estava sem conexão. */
      .subscribe(status => { if (status === 'SUBSCRIBED') agendar(); });
    /* Canal separado: se o panorama.sql não foi rodado, não atrapalha o resto. */
    if (A.panorama === 'pronto') {
      canalPanorama = db.channel('panorama-' + A.espaco.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contas_fixas', filter: filtro }, agendar)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cartoes', filter: filtro }, agendar)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'faturas', filter: filtro }, agendar)
        .subscribe();
    }
  }

  function mudouSessao(sessao) {
    const novo = sessao ? sessao.user : null;
    if (!novo) { encerrar(); definir('anonimo'); return; }
    if (A.usuario && A.usuario.id === novo.id) { A.usuario = novo; return; } // só renovou o token
    encerrar();
    A.usuario = novo;
    carregarEspaco();
  }

  /* ---------- Agentes (WhatsApp e CFO) ----------
     Ficam num canal próprio: se supabase/agentes.sql ainda não foi rodado, o
     resto do site segue normal e a tela de agentes só mostra um aviso. */
  function agentesVazio() { return { estado: 'carregando', vinculos: [], mensagens: [] }; }
  A.agentes = agentesVazio();
  const avisarAgentes = () => avisar('cfi:agentes');

  async function carregarAgentes(ligar) {
    if (A.estado !== 'pronto') return;
    const ws = A.espaco.id;
    const [v, m] = await Promise.all([
      db.from('whatsapp_vinculos').select('phone,user_id,profile,created_at').eq('workspace_id', ws).order('created_at'),
      db.from('cfo_mensagens').select('id,user_id,papel,texto,created_at').eq('workspace_id', ws)
        .order('created_at', { ascending: false }).limit(60)
    ]);
    if (!A.espaco || A.espaco.id !== ws) return;
    if (v.error || m.error) {
      const faltando = [v.error, m.error].some(e => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || '')));
      A.agentes = { estado: faltando ? 'sem-banco' : 'erro', vinculos: [], mensagens: [] };
      avisarAgentes();
      return;
    }
    A.agentes = { estado: 'pronto', vinculos: v.data, mensagens: m.data.reverse() };
    avisarAgentes();
    if (ligar && !canalAgentes) {
      const filtro = `workspace_id=eq.${ws}`;
      let espera = 0;
      const recarregar = () => { clearTimeout(espera); espera = setTimeout(() => carregarAgentes(false), 200); };
      canalAgentes = db.channel('agentes-' + ws)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cfo_mensagens', filter: filtro }, recarregar)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_vinculos', filter: filtro }, recarregar)
        .subscribe();
    }
  }
  A.recarregarAgentes = () => carregarAgentes(false);

  A.gerarCodigoWhats = async perfil => {
    const { data, error } = await db.rpc('gerar_codigo_whatsapp', { p_profile: perfil });
    return error ? { erro: 'Não foi possível gerar o código. Tente de novo.' } : { codigo: data };
  };
  A.desvincularWhats = async () => {
    const { error } = await db.from('whatsapp_vinculos').delete().eq('user_id', A.usuario.id);
    if (!error) await carregarAgentes(false);
    return error ? 'Não foi possível desvincular. Tente de novo.' : '';
  };

  const ERROS_CFO = {
    limite: 'Muitas perguntas na última hora. Espere um pouco e tente de novo.',
    cota: 'O limite gratuito do Gemini acabou por agora. Tente de novo mais tarde.',
    nao_autenticado: 'Sua sessão expirou. Saia e entre de novo.'
  };
  A.perguntarCFO = async pergunta => {
    try {
      const { data: s } = await db.auth.getSession();
      const r = await fetch(cfg.SUPABASE_URL + '/functions/v1/cfo', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (s.session ? s.session.access_token : ''), apikey: cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta })
      });
      const d = await r.json().catch(() => ({}));
      await carregarAgentes(false);
      if (r.ok && d.texto) return { texto: d.texto };
      return { erro: ERROS_CFO[d.erro] || (r.status === 404 ? 'O CFO ainda não foi publicado no Supabase.' : 'O CFO não conseguiu responder agora. Tente de novo em instantes.') };
    } catch (e) {
      return { erro: 'Sem conexão com o CFO. Verifique a internet e tente de novo.' };
    }
  };
  A.limparCFO = async () => {
    const { error } = await db.rpc('limpar_cfo', { p_ws: A.espaco.id });
    if (!error) await carregarAgentes(false);
    return error ? 'Não foi possível limpar a conversa.' : '';
  };

  /* ---------- Ações da tela ---------- */
  A.entrar = async provedor => {
    const { error } = await db.auth.signInWithOAuth({
      provider: provedor,
      options: { redirectTo: location.origin + location.pathname }
    });
    if (error) definir('anonimo', 'Não foi possível abrir o login. Tente de novo em instantes.');
  };
  /* Sair nunca depende do servidor: a tela muda na hora e, se o Supabase falhar ou
     não responder, a sessão guardada neste aparelho é apagada mesmo assim. */
  A.sair = async () => {
    encerrar();
    definir('anonimo');
    let saiu = false;
    try {
      const espera = new Promise(ok => setTimeout(ok, 3000, { error: true }));
      saiu = !(await Promise.race([db.auth.signOut({ scope: 'local' }), espera])).error;
    } catch (e) { /* trata abaixo */ }
    if (saiu) return;
    try { localStorage.removeItem(db.auth.storageKey); } catch (e) { /* recarrega mesmo assim */ }
    location.reload();
  };
  A.tentarDeNovo = () => { if (A.usuario) carregarEspaco(); };

  const chamar = async (fn, args) => {
    const { error } = await db.rpc(fn, args);
    if (error) return traduzir(error);
    await carregarEspaco();
    return '';
  };

  /* Cria o CFI (quem comprou) ou completa os nomes de um CFI antigo. */
  A.configurarCFI = c => chamar('configurar_cfi', {
    p_tipo: c.tipo, p_nome_titular: c.titular, p_nome_parceiro: c.parceiro || null,
    p_email_parceiro: c.email || null, p_nome_empresa: c.empresa
  });

  /* Entrar em um CFI existente: confere o e-mail de quem comprou, mostra o
     nome para a pessoa confirmar e só então envia o pedido. */
  A.procurarCFI = async email => {
    const { data, error } = await db.rpc('procurar_cfi', { p_email_titular: email });
    return error ? { erro: traduzir(error) } : { nome: data };
  };
  A.pedirEntrada = email => chamar('pedir_entrada', { p_email_titular: email });
  A.cancelarPedido = () => chamar('cancelar_pedido', {});
  A.esquecerRecusa = () => { A.pedido = null; definir('sem-espaco'); };

  A.responderPedido = async (id, aceitar) => {
    const { error } = await db.rpc('responder_pedido', { p_pedido: id, p_aceitar: aceitar });
    await atualizarPedidos();
    return error ? traduzir(error) : '';
  };
  A.trocarParceiro = async (nome, email) => {
    const { error } = await db.rpc('trocar_parceiro', { p_nome: nome, p_email: email });
    if (error) return traduzir(error);
    const { data } = await db.from('workspaces').select(COLUNAS_WS).eq('id', A.espaco.id).single();
    if (data) {
      A.espaco = data;
      F.configurar(data);
      const d = await baixar();
      F.substituir(d.rows, d.cfg);
    }
    return '';
  };

  /* O que a pessoa escolheu antes do login (criar ou entrar) sobrevive à ida ao Google. */
  function lembrarIntencao(v) {
    A.intencao = v;
    try { if (v) sessionStorage.setItem(INTENCAO, v); else sessionStorage.removeItem(INTENCAO); } catch (e) { /* fica só na memória */ }
  }
  A.definirIntencao = v => { lembrarIntencao(v); avisar('cfi:auth'); };
  try { A.intencao = sessionStorage.getItem(INTENCAO); } catch (e) { A.intencao = null; }

  A.guardarDestino = h => { try { sessionStorage.setItem(DESTINO, h); } catch (e) { /* segue sem destino */ } };
  A.pegarDestino = () => {
    try { const d = sessionStorage.getItem(DESTINO); sessionStorage.removeItem(DESTINO); return d; } catch (e) { return null; }
  };

  window.AUTH = A;
  if (!ativo) return;

  if (!window.supabase) { A.estado = 'erro'; A.erro = 'Não foi possível carregar o sistema de login. Verifique a conexão e recarregue a página.'; return; }

  db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  /* Erro devolvido pelo Google ou pela Apple na volta do login. */
  const q = new URLSearchParams(location.search);
  const erroLogin = q.get('error_description') || q.get('error');
  if (erroLogin) {
    A.erro = 'O login não foi concluído. Tente de novo.';
    history.replaceState(null, '', location.pathname + location.hash);
  }

  /* Fora do callback do Supabase, para não travar a sessão durante as consultas. */
  db.auth.onAuthStateChange((_evento, sessao) => { setTimeout(() => mudouSessao(sessao), 0); });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) agendar(); });
  window.addEventListener('online', agendar);
})();
