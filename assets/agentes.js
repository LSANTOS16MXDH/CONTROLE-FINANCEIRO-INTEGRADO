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

  const sugestoes = (F) => [
    F.CFI.casal ? 'Como está nossa saúde financeira este mês?' : 'Como está minha saúde financeira este mês?',
    F.CFI.casal ? 'Onde estamos gastando mais do que deveríamos?' : 'Onde estou gastando mais do que deveria?',
    'Monte um plano para quitar o cartão e montar uma reserva.',
    `Como está o resultado da ${F.PROFILES.empresa.nome} no ano?`
  ];

  window.AGENTES = function (ctx) {
    const { A, F, esc, pageHead, footer, toast, route, $ } = ctx;
    const cfg = window.CFI_CONFIG || {};
    const st = { codigo: null, perfil: null, rascunho: '', enviando: null, erro: '' };

    const nomeMembro = id => {
      const m = (A.membros || []).find(x => x.user_id === id);
      return m ? (m.display_name || m.email || 'Conta') : 'Conta';
    };
    const perfilPadrao = () => {
      if (st.perfil) return st.perfil;
      /* Quem comprou lança como titular; quem foi autorizado, como parceiro(a). */
      return A.papel === 'member' && F.PROFILES.parceiro ? 'parceiro' : 'titular';
    };
    const fone = n => {
      const d = String(n);
      return d.length > 8 ? `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, -4).replace(/\d/g, '•')}-${d.slice(-4)}` : d;
    };
    const horaBR = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    /* ---------- Cartão do WhatsApp ---------- */
    function cartaoWhats(ag) {
      const meu = ag.vinculos.find(v => A.usuario && v.user_id === A.usuario.id);
      const lista = ag.vinculos.length ? `<ul class="ag-vinc">${ag.vinculos.map(v => `<li>
          <span><b>${esc(fone(v.phone))}</b><small>${esc(nomeMembro(v.user_id))}${A.usuario && v.user_id === A.usuario.id ? ' (você)' : ''} · lança em ${esc((F.PROFILES[v.profile] || {}).nome || v.profile)}</small></span>
          ${A.usuario && v.user_id === A.usuario.id ? '<button class="btn btn-ghost btn-sm" data-ag-desvincular>Desvincular</button>' : ''}
        </li>`).join('')}</ul>` : '<p class="muted">Nenhum número vinculado ainda.</p>';

      let vincular = '';
      if (st.codigo && Date.now() < st.codigo.ate) {
        const msg = `VINCULAR ${st.codigo.codigo}`;
        const num = String(cfg.WHATSAPP_NUMERO || '').replace(/\D/g, '');
        vincular = `<div class="ag-codigo">
          <span class="ag-label">Envie esta mensagem ao agente pelo seu WhatsApp</span>
          <code id="ag-codigo-txt">${esc(msg)}</code>
          <div class="ag-acoes">
            <button class="btn btn-ink btn-sm" data-ag-copiar>Copiar</button>
            ${num ? `<a class="btn btn-ghost btn-sm" href="https://wa.me/${num}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>` : ''}
          </div>
          <small>Vale até ${new Date(st.codigo.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Os lançamentos vão para <b>${esc(F.PROFILES[st.codigo.perfil].nome)}</b>, a menos que a mensagem diga casa ou empresa.</small>
        </div>`;
      } else if (!meu) {
        const opts = Object.keys(F.PROFILES).map(p => `<option value="${p}"${p === perfilPadrao() ? ' selected' : ''}>${esc(F.PROFILES[p].nome)}</option>`).join('');
        vincular = `<form class="ag-form" id="ag-form-vinculo">
          <label for="ag-perfil">Perfil padrão dos seus lançamentos</label>
          <div class="gate-row"><select id="ag-perfil">${opts}</select><button class="btn btn-ink btn-sm" type="submit">Gerar código</button></div>
        </form>`;
      }

      return `<section class="card agente ag-whats">
        <div class="ag-topo">${AVATAR.whats}
          <div><h2>Agente de Lançamentos</h2><p>Lança no site o que você mandar pelo WhatsApp: foto do comprovante, PDF, mensagem ou áudio.</p></div>
          <span class="ag-status ${ag.vinculos.length ? 'on' : ''}">${ag.vinculos.length ? 'Ativo' : 'Aguardando vínculo'}</span>
        </div>
        <div class="ag-corpo">
          <div>
            <h3>Números vinculados</h3>
            ${lista}
            ${vincular}
          </div>
          <div class="ag-dicas">
            <h3>Como usar</h3>
            <ul>
              <li><b>“gastei 120 de gasolina no débito”</b></li>
              <li><b>“comprei uma blusa de 300 em 3x no nubank”</b></li>
              <li><b>“recebi 850 das entregas no pix”</b></li>
              <li>Uma <b>foto ou PDF</b> do comprovante, ou um <b>áudio</b> contando o gasto.</li>
              <li>Diga se é ${F.CFI.casal ? 'da <b>casa</b> ou ' : ''}da <b>empresa</b>. Responda <b>desfazer</b> para apagar o último lançamento.</li>
            </ul>
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
      const areas = Object.keys(F.PROFILES).map(p => (p === 'casa' ? 'a casa' : p === 'empresa' ? 'a ' + F.PROFILES[p].nome : F.PROFILES[p].nome));
      const listaAreas = areas.length > 1 ? areas.slice(0, -1).join(', ') + ' ou ' + areas[areas.length - 1] : areas[0];
      const vazio = `<div class="cfo-vazio"><p>Pergunte sobre qualquer área: ${esc(listaAreas)}. O CFO lê todos os lançamentos, metas e limites antes de responder.</p>
        <div class="cfo-sug">${sugestoes(F).map(s => `<button class="chip" data-ag-sugestao="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
      return `<section class="card agente ag-cfo">
        <div class="ag-topo">${AVATAR.cfo}
          <div><h2>CFO</h2><p>Diretor financeiro ${F.CFI.casal ? 'da família' : 'pessoal'} e da empresa: diagnóstico, riscos, metas e próximos passos com base nos seus números.</p></div>
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
        if ('agDesvincular' in b.dataset) { A.desvincularWhats().then(msg => { if (msg) toast(msg); else toast('Número desvinculado.'); route(); }); return true; }
        if ('agCopiar' in b.dataset) {
          const t = $('#ag-codigo-txt').textContent;
          navigator.clipboard.writeText(t).then(() => toast('Mensagem copiada.'), () => toast('Copie manualmente: ' + t));
          return true;
        }
        if (b.dataset.agSugestao) { enviarCFO(b.dataset.agSugestao); return true; }
        if ('agLimpar' in b.dataset) { A.limparCFO().then(msg => { if (msg) toast(msg); route(); }); return true; }
        if ('agRecarregar' in b.dataset) { A.recarregarAgentes(); return true; }
        return false;
      },
      submit(form) {
        if (form.id === 'ag-form-vinculo') {
          const perfil = $('#ag-perfil').value;
          st.perfil = perfil;
          A.gerarCodigoWhats(perfil).then(r => {
            if (r.erro) { toast(r.erro); return; }
            st.codigo = { codigo: r.codigo, perfil, ate: Date.now() + 15 * 60 * 1000 };
            route();
          });
          return true;
        }
        if (form.id === 'ag-form-cfo') { enviarCFO($('#cfo-campo').value); return true; }
        return false;
      },
      input(el) { if (el.id === 'cfo-campo') st.rascunho = el.value; },
      keydown(e) {
        if (e.target.id === 'cfo-campo' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          enviarCFO(e.target.value);
        }
      },
      /* O vínculo feito pelo WhatsApp encerra o código mostrado na tela. */
      atualizou() {
        if (st.codigo && (A.agentes.vinculos || []).some(v => A.usuario && v.user_id === A.usuario.id)) st.codigo = null;
      },
      limpar() { st.codigo = null; st.perfil = null; st.rascunho = ''; st.enviando = null; st.erro = ''; }
    };
  };
})();
