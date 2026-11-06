/* Login e sincronização com o Supabase.
   Estados: local (sem configuração) | carregando | anonimo | sem-espaco | pronto | erro */
(function () {
  'use strict';

  const cfg = window.CFI_CONFIG || {};
  const F = window.FIN;
  const ativo = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const DESTINO = 'cfi.destino';

  const A = {
    ativo, apple: !!cfg.APPLE_LOGIN,
    estado: ativo ? 'carregando' : 'local',
    usuario: null, espaco: null, membros: [], papel: null, erro: '',
    ehDono: () => !ativo || A.papel === 'owner'
  };

  const avisar = nome => window.dispatchEvent(new Event(nome));
  const definir = (estado, erro) => { A.estado = estado; A.erro = erro || ''; avisar('cfi:auth'); };

  const MENSAGENS = {
    nao_autorizado: 'Esta conta ainda não pode criar um espaço. Se você recebeu um convite, use o código dele.',
    ja_participa: 'Esta conta já participa de um espaço.',
    convite_invalido: 'Código de convite não encontrado. Confira o código e tente de novo.',
    espaco_cheio: 'Este espaço já está com todas as contas ocupadas.'
  };
  const traduzir = e => {
    const m = (e && e.message) || '';
    const k = Object.keys(MENSAGENS).find(c => m.includes(c));
    return k ? MENSAGENS[k] : 'Não foi possível concluir. Verifique a conexão e tente de novo.';
  };

  let db = null, canal = null, timer = 0;

  /* ---------- Conversão entre banco e tela ---------- */
  const paraBanco = (p, kind, r) => ({
    id: r.id, workspace_id: A.espaco.id, profile: p, kind, cat: r.cat, obs: r.obs || '', val: r.val,
    forma: r.forma, tipo: r.tipo || 'Único', card: r.card || '-', parc: r.parc, venc: r.venc, pag: r.pag || null
  });
  const daTela = l => ({
    id: l.id, cat: l.cat, obs: l.obs, val: Number(l.val), forma: l.forma, tipo: l.tipo,
    card: l.card, parc: l.parc, venc: l.venc, pag: l.pag || ''
  });

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
    const c = { metas: {}, limites: {}, empresa: {} };
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
    apagarTudo: () => enviar(db.rpc('apagar_dados', { p_ws: A.espaco.id }))
  };

  /* ---------- Sessão ---------- */
  function encerrar() {
    if (canal) { db.removeChannel(canal); canal = null; }
    clearTimeout(timer);
    F.desconectarRemoto();
    A.usuario = null; A.espaco = null; A.membros = []; A.papel = null;
  }

  async function carregarEspaco() {
    definir('carregando');
    try {
      const { data: minha, error: e1 } = await db.from('workspace_members')
        .select('workspace_id,role').eq('user_id', A.usuario.id).maybeSingle();
      if (e1) throw e1;
      if (!minha) { definir('sem-espaco'); return; }
      A.papel = minha.role;
      const [ws, membros] = await Promise.all([
        db.from('workspaces').select('*').eq('id', minha.workspace_id).single(),
        db.from('workspace_members').select('user_id,role,email,display_name,joined_at')
          .eq('workspace_id', minha.workspace_id).order('joined_at')
      ]);
      if (ws.error) throw ws.error;
      if (membros.error) throw membros.error;
      A.espaco = ws.data;
      A.membros = membros.data;
      const d = await baixar();
      F.conectarRemoto(API);
      F.substituir(d.rows, d.cfg);
      ligarTempoReal();
      definir('pronto');
    } catch (e) {
      definir('erro', 'Não foi possível carregar seus dados. Verifique a conexão e tente de novo.');
    }
  }

  function ligarTempoReal() {
    const filtro = `workspace_id=eq.${A.espaco.id}`;
    canal = db.channel('espaco-' + A.espaco.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: filtro }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'targets', filter: filtro }, agendar)
      /* Ao reconectar, busca o que mudou enquanto o aparelho estava sem conexão. */
      .subscribe(status => { if (status === 'SUBSCRIBED') agendar(); });
  }

  function mudouSessao(sessao) {
    const novo = sessao ? sessao.user : null;
    if (!novo) { encerrar(); definir('anonimo'); return; }
    if (A.usuario && A.usuario.id === novo.id) { A.usuario = novo; return; } // só renovou o token
    encerrar();
    A.usuario = novo;
    carregarEspaco();
  }

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
  A.criarEspaco = nome => chamar('criar_espaco', { p_nome: nome });
  A.aceitarConvite = codigo => chamar('entrar_com_convite', { p_codigo: codigo });
  A.novoConvite = async () => {
    const { data, error } = await db.rpc('novo_convite', { p_ws: A.espaco.id });
    if (error) return traduzir(error);
    A.espaco.invite_code = data;
    return '';
  };

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
