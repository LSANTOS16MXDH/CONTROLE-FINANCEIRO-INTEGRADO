/* Tela dos agentes: lançamentos pelo WhatsApp e CFO. O app.js chama
   window.AGENTES(ctx) uma vez e repassa a rota e os eventos da tela. */
(function () {
  'use strict';

  /* Avatares ("skins") de cada agente. */
  const AVATAR = {
    whats: `<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
      <defs><linearGradient id="av-w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10B981"/><stop offset="1" stop-color="#00C8F0"/></linearGradient></defs>
      <circle cx="32" cy="32" r="30" fill="url(#av-w)"/>
      <path d="M20 22h24a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H30l-7 6v-6h-3a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4z" fill="#fff" opacity=".95"/>
      <path d="M24 29h16M24 35h10" stroke="#0E9F8E" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="44" cy="37" r="6" fill="#0D1524"/><path d="M41.5 37l1.8 1.8 3.2-3.4" stroke="#5FE3FF" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    cfo: `<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
      <defs><linearGradient id="av-c" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FF8A3D"/><stop offset=".55" stop-color="#7C5CFF"/><stop offset="1" stop-color="#00C8F0"/></linearGradient></defs>
      <circle cx="32" cy="32" r="30" fill="url(#av-c)"/>
      <rect x="18" y="34" width="6" height="12" rx="2" fill="#fff" opacity=".7"/>
      <rect x="29" y="27" width="6" height="19" rx="2" fill="#fff" opacity=".85"/>
      <rect x="40" y="20" width="6" height="26" rx="2" fill="#fff"/>
      <path d="M17 28l10-7 8 5 12-9" stroke="#0D1524" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  };

  /* Markdown mínimo e seguro: o texto é escapado antes de virar HTML. */
  function md(texto, esc) {
    const inline = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    const out = [];
    let lista = null;
    const fechar = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };
    String(texto).replace(/\r/g, '').split('\n').forEach(l => {
      const t = l.trim();
      let m;
      if (!t) { fechar(); return; }
      if ((m = t.match(/^#{1,4}\s+(.*)$/))) { fechar(); out.push(`<h4>${inline(m[1])}</h4>`); return; }
      if ((m = t.match(/^[-*•]\s+(.*)$/))) { if (lista !== 'ul') { fechar(); out.push('<ul>'); lista = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); return; }
      if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { if (lista !== 'ol') { fechar(); out.push('<ol>'); lista = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); return; }
      if (/^[-*_]{3,}$/.test(t)) { fechar(); return; }
      fechar(); out.push(`<p>${inline(t)}</p>`);
    });
    fechar();
    return out.join('');
  }

  const SUGESTOES = [
    'Como está nossa saúde financeira este mês?',
    'Onde estamos gastando mais do que deveríamos?',
    'Monte um plano para quitar o cartão e montar uma reserva.',
    'Como está o resultado da Sixteen Design no ano?'
  ];

  window.AGENTES = function (ctx) {
    const { A, F, esc, pageHead, footer, toast, route, $ } = ctx;
    const st = { perfil: null, rascunho: '', enviando: null, erro: '' };

    const nomeMembro = id => {
      const m = (A.membros || []).find(x => x.user_id === id);
      return m ? (m.display_name || m.email || 'Conta') : 'Conta';
    };
    const perfilPadrao = () => {
      if (st.perfil) return st.perfil;
      const nome = (nomeMembro(A.usuario && A.usuario.id) + ' ' + ((A.usuario && A.usuario.email) || '')).toLowerCase();
      return Object.keys(F.PROFILES).find(p => nome.includes(F.PROFILES[p].curto.toLowerCase())) || 'luiz';
    };
    const fone = n => {
      const d = String(n);
      return d.length > 8 ? `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, -4).replace(/\d/g, '•')}-${d.slice(-4)}` : d;
    };
    const horaBR = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    /* ---------- Cartão do WhatsApp ----------
       Cada pessoa conecta o próprio WhatsApp como aparelho conectado, por QR
       Code (no computador) ou por código de pareamento (no celular). */
    const noCelular = () => window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    const wa = { carregado: false, ocupado: false, estado: null, phone: null, perfil: null, qr: null, expirado: false, conectando: false, erro: '', modo: null, numero: '55', timer: 0 };

    function aplicarWhats(r) {
      if (r.erro) { wa.erro = r.erro; return; }
      wa.erro = '';
      wa.estado = r.estado; wa.phone = r.phone; wa.perfil = r.perfil || wa.perfil;
      wa.expirado = !!r.expirado; wa.conectando = !!r.conectando;
      if (r.qr) wa.qr = r.qr;
      if (r.estado !== 'aguardando') wa.qr = null;
    }
    const naTela = () => location.hash === '#agentes' && A.estado === 'pronto';
    function acompanhar() {
      clearTimeout(wa.timer);
      if (wa.estado !== 'aguardando' || wa.expirado || !naTela()) return;
      wa.timer = setTimeout(async () => {
        if (!naTela() || wa.ocupado) return acompanhar();
        const r = await A.whatsConexao('estado', wa.modo === 'codigo' ? { numero: wa.numero } : {});
        const antes = wa.estado;
        if (!r.erro) aplicarWhats(r);
        if (naTela()) render();
        if (antes !== 'conectado' && wa.estado === 'conectado') toast('WhatsApp conectado! Veja a mensagem de boas-vindas na conversa “Você”.');
        acompanhar();
      }, 3500);
    }
    async function carregarWhats() {
      if (wa.ocupado) return;
      wa.ocupado = true;
      const r = await A.whatsConexao('estado');
      wa.ocupado = false; wa.carregado = true;
      aplicarWhats(r);
      if (naTela()) render();
      acompanhar();
    }
    async function gerar() {
      if (wa.ocupado) return;
      const perfil = ($('#wa-perfil') || {}).value || perfilPadrao();
      st.perfil = perfil;
      if (wa.modo === 'codigo' && !/^\d{12,15}$/.test(wa.numero.replace(/\D/g, ''))) { wa.erro = 'Digite seu número com 55, DDD e celular. Ex.: 5531999990000.'; render(); return; }
      wa.ocupado = true; wa.erro = ''; wa.qr = null; render();
      const r = await A.whatsConexao('conectar', { perfil, ...(wa.modo === 'codigo' ? { numero: wa.numero } : {}) });
      wa.ocupado = false;
      aplicarWhats(r);
      render();
      acompanhar();
    }

    function passos(lista) { return `<ol class="wa-passos">${lista.map(p => `<li>${p}</li>`).join('')}</ol>`; }

    function painelConexao() {
      if (!wa.carregado) return '<p class="muted">Verificando a conexão…</p>';
      const perfis = Object.keys(F.PROFILES).map(p => `<option value="${p}"${p === (wa.perfil || perfilPadrao()) ? ' selected' : ''}>${esc(F.PROFILES[p].nome)}</option>`).join('');
      const erro = wa.erro ? `<p class="form-err" role="alert">${esc(wa.erro)}</p>` : '';

      if (wa.estado === 'conectado') {
        return `<div class="wa-ok">
          <p class="wa-linha"><span class="wa-ponto on"></span>Conectado · <b>${esc(fone(wa.phone))}</b></p>
          <div class="ag-form"><label for="wa-perfil">Seus lançamentos vão para</label><select id="wa-perfil">${perfis}</select></div>
          <div class="ag-codigo">
            <span class="ag-label">Como usar</span>
            ${passos([
              'No WhatsApp, abra a conversa <b>com você mesmo</b> (aparece como “Você” ou com seu nome e “(você)”).',
              'Mande o gasto ou o recebimento: mensagem, foto ou PDF do comprovante, ou áudio.',
              'O assistente responde ali mesmo, com 🤖, confirmando o lançamento.'
            ])}
            <div class="ag-acoes">
              <a class="btn btn-ink btn-sm" href="https://wa.me/${esc(wa.phone)}" target="_blank" rel="noopener">Abrir minha conversa</a>
              <button class="btn btn-ghost btn-sm" data-wa-desconectar>Desconectar</button>
            </div>
          </div>
          ${erro}
        </div>`;
      }

      if (wa.estado === 'aguardando' && !wa.expirado && (wa.qr || wa.conectando)) {
        const codigo = wa.qr && wa.qr.codigo;
        let miolo;
        if (wa.conectando) miolo = '<p class="wa-linha"><span class="wa-ponto gira"></span>Conectando… só mais um instante.</p>';
        else if (wa.modo === 'codigo' && codigo) {
          miolo = `<span class="ag-label">Seu código de conexão</span>
            <code class="wa-codigo" id="wa-codigo-txt">${esc(codigo)}</code>
            ${passos([
              'Toque na <b>notificação do WhatsApp</b> que chegou agora no seu celular, <b>ou</b> abra o WhatsApp › <b>Configurações</b> › <b>Aparelhos conectados</b> › <b>Conectar aparelho</b> › <b>Conectar com número de telefone</b>.',
              'Digite o código acima.'
            ])}
            <div class="ag-acoes"><button class="btn btn-ghost btn-sm" data-wa-copiar>Copiar código</button></div>`;
        } else if (wa.qr && wa.qr.base64) {
          miolo = `<div class="wa-qr"><img src="${esc(wa.qr.base64)}" alt="QR Code para conectar o WhatsApp" width="232" height="232"></div>
            ${passos([
              'No celular, abra o WhatsApp › <b>Configurações</b> (no Android, toque em ⋮) › <b>Aparelhos conectados</b>.',
              'Toque em <b>Conectar aparelho</b> e aponte a câmera para este código.'
            ])}`;
        } else miolo = '<p class="wa-linha"><span class="wa-ponto gira"></span>Preparando o código…</p>';
        return `<div class="ag-codigo wa-aguardando">
          ${miolo}
          <p class="wa-linha muted"><span class="wa-ponto gira"></span>Aguardando a conexão. Esta tela atualiza sozinha.</p>
          <div class="ag-acoes"><button class="btn btn-ghost btn-sm" data-wa-cancelar>Cancelar</button></div>
        </div>${erro}`;
      }

      const modo = wa.modo || (noCelular() ? 'codigo' : 'qr');
      const aviso = wa.estado === 'desconectado'
        ? '<p class="notice">Seu WhatsApp foi desconectado (pelo celular ou por falta de conexão). Conecte de novo para voltar a lançar.</p>'
        : wa.expirado ? '<p class="notice">O código expirou antes da conexão. Gere um novo.</p>' : '';
      return `${aviso}<form class="ag-form wa-form" id="wa-form">
          <label for="wa-perfil">Seus lançamentos vão para</label>
          <select id="wa-perfil">${perfis}</select>
          <div class="wa-modos" role="tablist">
            <button type="button" role="tab" class="${modo === 'qr' ? 'on' : ''}" aria-selected="${modo === 'qr'}" data-wa-modo="qr">QR Code<small>no computador</small></button>
            <button type="button" role="tab" class="${modo === 'codigo' ? 'on' : ''}" aria-selected="${modo === 'codigo'}" data-wa-modo="codigo">Código<small>no próprio celular</small></button>
          </div>
          ${modo === 'codigo' ? `<label for="wa-numero">Seu número de WhatsApp (com 55 e DDD)</label>
            <input id="wa-numero" inputmode="tel" autocomplete="tel" placeholder="5531999990000" value="${esc(wa.numero)}">` : ''}
          <button class="btn btn-ink" type="submit" ${wa.ocupado ? 'disabled' : ''}>${wa.ocupado ? 'Gerando…' : modo === 'qr' ? 'Gerar QR Code' : 'Gerar código'}</button>
        </form>${erro}`;
    }

    function cartaoWhats(ag) {
      if (!wa.carregado && !wa.ocupado) setTimeout(carregarWhats, 0);
      const outros = ag.vinculos.filter(v => !A.usuario || v.user_id !== A.usuario.id);
      const lista = outros.length ? `<h3>Também conectados no espaço</h3><ul class="ag-vinc">${outros.map(v => `<li>
          <span><b>${esc(fone(v.phone))}</b><small>${esc(nomeMembro(v.user_id))} · lança em ${esc((F.PROFILES[v.profile] || {}).nome || v.profile)}</small></span>
        </li>`).join('')}</ul>` : '';
      const ligado = wa.estado === 'conectado';
      return `<section class="card agente ag-whats">
        <div class="ag-topo">${AVATAR.whats}
          <div><h2>Assistente no WhatsApp</h2><p>Conecte o seu WhatsApp e mande gastos para você mesmo: o assistente lança no site e confirma na hora.</p></div>
          <span class="ag-status ${ligado ? 'on' : ''}">${ligado ? 'Conectado' : 'Desconectado'}</span>
        </div>
        <div class="ag-corpo">
          <div>
            <h3>Seu WhatsApp</h3>
            ${painelConexao()}
            ${lista}
          </div>
          <div class="ag-dicas">
            <h3>Exemplos</h3>
            <ul>
              <li><b>“gastei 120 de gasolina no débito”</b></li>
              <li><b>“comprei uma blusa de 300 em 3x no nubank”</b></li>
              <li><b>“recebi 850 das entregas no pix”</b></li>
              <li>Uma <b>foto ou PDF</b> do comprovante, ou um <b>áudio</b> contando o gasto.</li>
              <li>Diga se é da <b>casa</b> ou da <b>empresa</b>. Responda <b>desfazer</b> para apagar o último lançamento.</li>
            </ul>
            <p class="wa-priv">O assistente só responde na conversa “Você”: as outras conversas são ignoradas e nada delas é guardado. A conexão funciona como o WhatsApp Web e pode ser desfeita a qualquer momento em <b>Aparelhos conectados</b>.</p>
          </div>
        </div>
      </section>`;
    }

    /* ---------- CFO ---------- */
    function cartaoCFO(ag) {
      const msgs = ag.mensagens.slice();
      if (st.enviando && !msgs.some(m => m.papel === 'user' && m.texto === st.enviando)) {
        msgs.push({ id: 'pendente', papel: 'user', texto: st.enviando, user_id: A.usuario.id, created_at: new Date().toISOString() });
      }
      const bolha = m => m.papel === 'cfo'
        ? `<div class="msg cfo"><span class="msg-av">${AVATAR.cfo}</span><div class="msg-b md">${md(m.texto, esc)}<small>CFO · ${horaBR(m.created_at)}</small></div></div>`
        : `<div class="msg eu"><div class="msg-b"><p>${esc(m.texto).replace(/\n/g, '<br>')}</p><small>${esc(nomeMembro(m.user_id))} · ${horaBR(m.created_at)}</small></div></div>`;
      const vazio = `<div class="cfo-vazio"><p>Pergunte sobre qualquer área: Luiz, Cleide, a casa ou a Sixteen Design. O CFO lê todos os lançamentos, metas e limites antes de responder.</p>
        <div class="cfo-sug">${SUGESTOES.map(s => `<button class="chip" data-ag-sugestao="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
      return `<section class="card agente ag-cfo">
        <div class="ag-topo">${AVATAR.cfo}
          <div><h2>CFO</h2><p>Diretor financeiro da família e da empresa: diagnóstico, riscos, metas e próximos passos com base nos seus números.</p></div>
          ${msgs.length ? '<button class="btn btn-ghost btn-sm" data-ag-limpar>Nova conversa</button>' : ''}
        </div>
        <div class="cfo-chat" id="cfo-chat" aria-live="polite">
          ${msgs.length ? msgs.map(bolha).join('') : vazio}
          ${st.enviando ? `<div class="msg cfo"><span class="msg-av">${AVATAR.cfo}</span><div class="msg-b digitando" aria-label="O CFO está analisando"><i></i><i></i><i></i><small>Analisando os números…</small></div></div>` : ''}
        </div>
        ${st.erro ? `<p class="form-err gate-err" role="alert">${esc(st.erro)}</p>` : ''}
        <form class="cfo-form" id="ag-form-cfo">
          <textarea id="cfo-campo" rows="2" maxlength="4000" placeholder="Pergunte ao CFO…" aria-describedby="cfo-nota" ${st.enviando ? 'disabled' : ''}>${esc(st.rascunho)}</textarea>
          <button class="btn btn-ink" type="submit" ${st.enviando ? 'disabled' : ''}>Enviar</button>
        </form>
        <p class="cfo-nota" id="cfo-nota">Enter envia; Shift+Enter quebra a linha. As respostas são geradas por IA (Google Gemini) a partir dos seus lançamentos: use como orientação e confira decisões importantes.</p>
      </section>`;
    }

    function render() {
      const ag = A.agentes || { estado: 'carregando', vinculos: [], mensagens: [] };
      let corpo;
      if (!A.ativo) corpo = '<p class="notice">Os agentes funcionam com o login ativo, porque usam o banco de dados.</p>';
      else if (ag.estado === 'carregando') corpo = '<p class="notice">Carregando os agentes…</p>';
      else if (ag.estado === 'sem-banco') corpo = '<p class="notice">Os agentes ainda não foram ativados no banco de dados. Rode o arquivo <code>supabase/agentes.sql</code> no SQL Editor do Supabase.</p>';
      else if (ag.estado === 'erro') corpo = '<p class="notice">Não foi possível carregar os agentes. <button class="linkbtn" data-ag-recarregar>Tentar de novo</button></p>';
      else corpo = `<div class="ag-grid">${cartaoWhats(ag)}${cartaoCFO(ag)}</div>`;
      $('#view').innerHTML = `${pageHead('Agentes inteligentes')}${corpo}${footer('Agentes inteligentes')}`;
      const chat = $('#cfo-chat');
      if (chat) chat.scrollTop = chat.scrollHeight;
    }

    async function enviarCFO(texto) {
      const t = String(texto || '').trim();
      if (!t || st.enviando) return;
      st.enviando = t; st.rascunho = ''; st.erro = '';
      render();
      const r = await A.perguntarCFO(t);
      st.enviando = null;
      if (r.erro) { st.erro = r.erro; st.rascunho = t; }
      render();
      const campo = $('#cfo-campo');
      if (campo && !r.erro) campo.focus();
    }

    return {
      render,
      click(b) {
        if (b.dataset.waModo) { wa.modo = b.dataset.waModo; wa.erro = ''; render(); return true; }
        if ('waCancelar' in b.dataset || 'waDesconectar' in b.dataset) {
          if ('waDesconectar' in b.dataset && !confirm('Desconectar seu WhatsApp do assistente?')) return true;
          clearTimeout(wa.timer);
          A.whatsConexao('desconectar').then(r => { aplicarWhats(r); wa.modo = null; if (!r.erro && 'waDesconectar' in b.dataset) toast('WhatsApp desconectado.'); render(); });
          return true;
        }
        if ('waCopiar' in b.dataset) {
          const t = ($('#wa-codigo-txt') || {}).textContent || '';
          navigator.clipboard.writeText(t).then(() => toast('Código copiado.'), () => toast('Copie manualmente: ' + t));
          return true;
        }
        if (b.dataset.agSugestao) { enviarCFO(b.dataset.agSugestao); return true; }
        if ('agLimpar' in b.dataset) { A.limparCFO().then(msg => { if (msg) toast(msg); route(); }); return true; }
        if ('agRecarregar' in b.dataset) { A.recarregarAgentes(); return true; }
        return false;
      },
      submit(form) {
        if (form.id === 'wa-form') { if (!wa.modo) wa.modo = noCelular() ? 'codigo' : 'qr'; gerar(); return true; }
        if (form.id === 'ag-form-cfo') { enviarCFO($('#cfo-campo').value); return true; }
        return false;
      },
      input(el) {
        if (el.id === 'cfo-campo') st.rascunho = el.value;
        if (el.id === 'wa-numero') wa.numero = el.value.replace(/[^\d+ ()-]/g, '');
        if (el.id === 'wa-perfil') {
          st.perfil = el.value;
          if (wa.estado === 'conectado') A.whatsConexao('perfil', { perfil: el.value }).then(r => {
            if (r.erro) toast(r.erro); else { aplicarWhats(r); toast('Pronto: os próximos lançamentos vão para ' + F.PROFILES[el.value].nome + '.'); }
          });
        }
      },
      keydown(e) {
        if (e.target.id === 'cfo-campo' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          enviarCFO(e.target.value);
        }
      },
      atualizou() { /* o estado da conexão vem da função whatsapp-conexao */ },
      limpar() {
        st.perfil = null; st.rascunho = ''; st.enviando = null; st.erro = '';
        clearTimeout(wa.timer); Object.assign(wa, { carregado: false, ocupado: false, estado: null, phone: null, perfil: null, qr: null, expirado: false, conectando: false, erro: '', modo: null, numero: '55' });
      }
    };
  };
})();
