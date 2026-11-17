// Testes dos agentes, sem rede: banco em memória, Evolution API e Gemini simulados.
// Rodar: deno test supabase/functions/_testes/agentes.test.ts
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertMatch, assertRejects, assertThrows } from 'jsr:@std/assert@1.0.13';
import { BancoFalso } from './banco-falso.ts';
import { montarLinhas, contas, esquemaExtracao, descrever } from '../_shared/lancamento.ts';
import { resumir, executarFerramenta, type Lanc } from '../_shared/resumo.ts';
import { criarHandler as whatsapp } from '../whatsapp/logica.ts';
import { criarHandler as cfo } from '../cfo/logica.ts';
import { hojeSP } from '../_shared/comum.ts';
import { criarHandler as conexao } from '../whatsapp-conexao/logica.ts';
import { MARCA } from '../whatsapp/logica.ts';
import type { Evolution } from '../_shared/evolution.ts';
import * as R from '../whatsapp/respostas.ts';

const AGORA = new Date('2026-11-16T15:00:00Z'); // 12h em Brasília
const WS = 'ws-1', LUIZ = 'u-luiz', CLEIDE = 'u-cleide';

// ---------- Montagem dos lançamentos ----------

Deno.test('crédito parcelado: valor por parcela, vencimentos mensais e fim de mês', () => {
  let n = 0;
  const l = montarLinhas({ conta: 'luiz|out|ALIMENTAÇÃO', descricao: 'Mercado', valor_parcela: 100, parcelas: 3, forma: 'Crédito', cartao: 'picpay', recorrente: false, data: '2026-01-31', pago: true }, '2026-11-16', () => 'id' + n++);
  assertEquals(l.map(x => [x.venc, x.pag, x.parc, x.val, x.card, x.tipo]), [
    ['2026-01-31', '2026-01-31', '1/3', 100, 'PICPAY', 'Parcelado'],
    ['2026-02-28', null, '2/3', 100, 'PICPAY', 'Parcelado'],
    ['2026-03-31', null, '3/3', 100, 'PICPAY', 'Parcelado']
  ]);
});

Deno.test('crédito sem cartão usa o primeiro cartão; PIX de entrada não tem cartão', () => {
  const a = montarLinhas({ conta: 'cleide|out|ROUPA', descricao: '', valor_parcela: 59.9, parcelas: 1, forma: 'Crédito', cartao: '-', recorrente: false, data: '2026-11-15', pago: true }, '2026-11-16');
  assertEquals([a[0].card, a[0].tipo, a[0].parc], ['PICPAY', 'Único', '1/1']);
  const b = montarLinhas({ conta: 'luiz|in|UBER', descricao: 'Corridas', valor_parcela: 230.456, parcelas: 1, forma: 'PIX', cartao: 'NUBANK', recorrente: false, data: 'ontem', pago: true }, '2026-11-16');
  assertEquals([b[0].card, b[0].val, b[0].venc, b[0].pag], ['-', 230.46, '2026-11-16', '2026-11-16']);
});

Deno.test('casa casa o cartão pelo nome; boleto a vencer fica pendente e recorrente', () => {
  const l = montarLinhas({ conta: 'casa|out|LUZ & ÁGUA', descricao: 'Cemig', valor_parcela: 210, parcelas: 1, forma: 'Boleto', cartao: 'picpay cleide', recorrente: true, data: '2026-11-25', pago: false }, '2026-11-16');
  assertEquals([l[0].card, l[0].pag, l[0].tipo, l[0].venc], ['PICPAY CLEIDE', null, 'Recorrente', '2026-11-25']);
});

Deno.test('rejeita categoria fora da lista, valor zero e forma desconhecida vira a padrão', () => {
  assertThrows(() => montarLinhas({ conta: 'luiz|out|INVENTADA', descricao: '', valor_parcela: 10, parcelas: 1, forma: 'PIX', cartao: '-', recorrente: false, data: '2026-11-16', pago: true }, '2026-11-16'), Error, 'categoria');
  assertThrows(() => montarLinhas({ conta: 'luiz|out|CASA', descricao: '', valor_parcela: 0, parcelas: 1, forma: 'PIX', cartao: '-', recorrente: false, data: '2026-11-16', pago: true }, '2026-11-16'), Error, 'valor');
  const l = montarLinhas({ conta: 'empresa|in|R-S (Oficina)', descricao: '', valor_parcela: 500, parcelas: 1, forma: 'Crédito', cartao: '-', recorrente: false, data: '2026-11-16', pago: true }, '2026-11-16');
  assertEquals(l[0].forma, 'PIX'); // "Crédito" não existe nas entradas da empresa
});

Deno.test('esquema lista todas as categorias e o resumo descreve parcelas', () => {
  assert(contas().includes('casa|out|INVESTIMENTOS'));
  assert(!contas().some(c => c.startsWith('casa|in|')));
  assertEquals((esquemaExtracao() as any).properties.lancamentos.items.properties.conta.enum.length, contas().length);
  const txt = descrever(montarLinhas({ conta: 'luiz|out|GASOLINA', descricao: 'Shell', valor_parcela: 50, parcelas: 2, forma: 'Crédito', cartao: 'INTER', recorrente: false, data: '2026-11-16', pago: true }, '2026-11-16'));
  assertMatch(txt, /2x de R\$\s?50,00 \(total R\$\s?100,00\)/);
});

Deno.test('data de hoje em Brasília', () => {
  assertEquals(hojeSP(new Date('2026-11-17T02:30:00Z')), '2026-11-16');
});

// ---------- WhatsApp (Evolution API) ----------

const SEG = 'a'.repeat(48);
const INST = 'cfi-luiz0000-abcd';
const FONE = '5531999990000';
const JID = FONE + '@s.whatsapp.net';

function evoFalsa(opts: { estado?: string; dono?: string | null } = {}) {
  const chamadas: any[] = [];
  let n = 0;
  const evo: Evolution & { chamadas: any[]; estadoAtual: string } = {
    chamadas, estadoAtual: opts.estado ?? 'connecting',
    async criar(i, url, numero) { chamadas.push(['criar', i, url, numero]); return { base64: 'data:image/png;base64,QR', codigo: null }; },
    async qr(i, numero) { chamadas.push(['qr', i, numero]); return { base64: 'data:image/png;base64,QR2', codigo: numero ? 'ABCD-1234' : null }; },
    async estado(i) { chamadas.push(['estado', i]); return evo.estadoAtual as any; },
    async dono(i) { chamadas.push(['dono', i]); return opts.dono === undefined ? FONE : opts.dono; },
    async apagar(i) { chamadas.push(['apagar', i]); },
    async enviarTexto(i, numero, texto, citar) { chamadas.push(['enviar', i, numero, texto, citar]); return 'AGENTE' + (++n); },
    async baixarMidia(i, m) { chamadas.push(['midia', i, m]); return { base64: btoa('midia-baixada'), mime: 'image/jpeg' }; }
  };
  return evo;
}

function montarWhats(opts: { extracao?: any; erroGemini?: Error; conectado?: boolean } = {}) {
  const db = new BancoFalso();
  db.relogio = () => AGORA;
  const evo = evoFalsa();
  const chamadasGemini: any[] = [];
  const tarefas: Promise<unknown>[] = [];
  const h = whatsapp({
    db: db as any, evo,
    gerarJson: async (o) => {
      chamadasGemini.push(o);
      if (opts.erroGemini) throw opts.erroGemini;
      return { dados: opts.extracao ?? { lancamentos: [], resposta: 'Qual o valor?' }, modelo: 'teste' };
    },
    agora: () => AGORA,
    waitUntil: p => { tarefas.push(p); },
    log: () => {},
    espera: async () => {}
  });
  db.tabela('workspace_members').push({ workspace_id: WS, user_id: LUIZ, display_name: 'Luiz Filipe', email: 'l@x.test' });
  if (opts.conectado !== false) {
    db.tabela('whatsapp_conexoes').push({ user_id: LUIZ, workspace_id: WS, profile: 'luiz', instancia: INST, segredo: SEG, estado: 'conectado', phone: FONE, jids: [], atualizado: AGORA.toISOString() });
    db.tabela('whatsapp_vinculos').push({ phone: FONE, workspace_id: WS, user_id: LUIZ, profile: 'luiz' });
  }
  const avisar = async (corpo: any, seg = SEG, inst = INST) => {
    const r = await h(new Request(`https://x/whatsapp?i=${inst}&t=${seg}`, { method: 'POST', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json' } }));
    await Promise.all(tarefas.splice(0));
    return r;
  };
  const enviar = (dados: any) => avisar({ event: 'messages.upsert', instance: INST, data: dados });
  const enviados = () => evo.chamadas.filter(c => c[0] === 'enviar').map(c => ({ numero: c[2], texto: c[3] as string, citar: c[4] }));
  return { db, h, evo, avisar, enviar, enviados, chamadasGemini };
}
const eu = (id: string, message: any, remoteJid = JID, extra: any = {}) => ({ key: { remoteJid, fromMe: true, id, ...extra }, pushName: 'Luiz', message });
const texto = (id: string, body: string, remoteJid = JID) => eu(id, { conversation: body }, remoteJid);

Deno.test('webhook: senha da conexão e eventos', async () => {
  const { avisar, h } = montarWhats();
  assertEquals((await avisar({ event: 'messages.upsert', data: {} }, 'b'.repeat(48))).status, 401);
  assertEquals((await avisar({ event: 'messages.upsert', data: {} }, SEG, 'cfi-outra-0000')).status, 401);
  assertEquals((await h(new Request('https://x/whatsapp?i=cfi-luiz0000-abcd', { method: 'POST', body: '{}' }))).status, 401);
  assertEquals((await h(new Request('https://x/whatsapp', { method: 'GET' }))).status, 405);
  assertEquals((await avisar({ event: 'presence.update', data: {} })).status, 200);
});

Deno.test('só a conversa "Você" vale: outras conversas, grupos e mensagens recebidas são ignorados', async () => {
  const { enviar, enviados, chamadasGemini, db } = montarWhats();
  await enviar(texto('o1', 'gastei 50 no mercado', '5531911112222@s.whatsapp.net')); // conversa com outra pessoa
  await enviar({ ...texto('o2', 'gastei 50'), key: { remoteJid: JID, fromMe: false, id: 'o2' } }); // recebida, não escrita
  await enviar(texto('o3', 'gastei 50', '1203630@g.us'));
  assertEquals(chamadasGemini.length, 0);
  assertEquals(enviados().length, 0);
  assertEquals(db.tabela('whatsapp_mensagens').length, 0); // nada das outras conversas é gravado
});

Deno.test('conversa "Você" com endereço @lid é aprendida pelo eco da resposta do agente', async () => {
  const { enviar, enviados, db, chamadasGemini } = montarWhats();
  const LID = '99887766@lid';
  await enviar(texto('l1', 'gastei 10', LID));
  assertEquals(chamadasGemini.length, 0); // ainda não sabe que é a conversa "Você"
  db.tabela('whatsapp_mensagens').push({ message_id: 'AGENTE-X', phone: FONE, status: 'agente' });
  await enviar(texto('AGENTE-X', MARCA + '🤖 Oi', LID)); // eco da mensagem do agente
  assertEquals(db.tabela('whatsapp_conexoes')[0].jids, [LID]);
  await enviar(texto('AGENTE-Y', MARCA + '🤖 outra', '5531911112222@s.whatsapp.net')); // texto copiado para outra pessoa
  assertEquals(db.tabela('whatsapp_conexoes')[0].jids, [LID]);
  await enviar(texto('l2', 'oi', LID));
  assertMatch(enviados().at(-1)!.texto, /Luiz/);
});

Deno.test('texto vira lançamento com resposta pessoal na conversa "Você"; reenvio não duplica; desfazer apaga', async () => {
  const extracao = { lancamentos: [{ conta: 'luiz|out|GASOLINA', descricao: 'Posto Shell', valor_parcela: 120, parcelas: 1, forma: 'Débito', cartao: '-', recorrente: false, data: '2026-11-16', pago: true }], resposta: null };
  const { db, enviar, enviados, chamadasGemini } = montarWhats({ extracao });
  await enviar(texto('g1', 'gastei 120 de gasolina no débito'));
  await enviar(texto('g1', 'gastei 120 de gasolina no débito')); // reenvio
  const e = db.tabela('entries');
  assertEquals(e.length, 1);
  assertEquals([e[0].workspace_id, e[0].created_by, e[0].origem, e[0].cat, e[0].val, e[0].profile], [WS, LUIZ, 'whatsapp', 'GASOLINA', 120, 'luiz']);
  assertEquals(chamadasGemini.length, 1);
  assertMatch(chamadasGemini[0].sistema, /perfil "luiz"/);
  const r = enviados().at(-1)!;
  assertEquals(r.numero, FONE);
  assert(r.texto.startsWith(MARCA + '🤖 '));
  assertMatch(r.texto, /Luiz[\s\S]*💸 \*GASOLINA\* — Posto Shell\nR\$\s?120,00 no débito\n📅 pago hoje · Luiz › Saídas[\s\S]*desfazer/);
  assertEquals(r.citar.key.id, 'g1');
  // A resposta do agente fica registrada e o eco dela é ignorado.
  assert(db.tabela('whatsapp_mensagens').some(m => m.status === 'agente'));
  await enviar(texto('AGENTE2', r.texto));
  assertEquals(chamadasGemini.length, 1);
  await enviar(texto('g2', 'Desfazer'));
  assertEquals(e[0].deleted_at, AGORA.toISOString());
  assertMatch(enviados().at(-1)!.texto, /Apaguei \*GASOLINA\* de R\$\s?120,00/);
  await enviar(texto('g3', 'desfazer'));
  assertMatch(enviados().at(-1)!.texto, /Não encontrei nenhum lançamento/);
});

Deno.test('foto, áudio e PDF vão ao Gemini; base64 do aviso é usado e, sem ele, a mídia é baixada', async () => {
  const { enviar, enviados, chamadasGemini, evo } = montarWhats({ extracao: { lancamentos: [], resposta: 'Foi no crédito ou no débito?' } });
  await enviar(eu('a1', { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true }, base64: btoa('audio-do-aviso') }));
  assertEquals(chamadasGemini[0].partes[0].inlineData.mimeType, 'audio/ogg');
  assertEquals(atob(chamadasGemini[0].partes[0].inlineData.data), 'audio-do-aviso');
  assertMatch(enviados().at(-2)!.texto, /áudio/); // avisa que recebeu antes de ler
  assertEquals(enviados().at(-1)!.texto, MARCA + '🤖 Foi no crédito ou no débito?');
  assert(!('base64' in enviados().at(-1)!.citar.message)); // não reenvia o arquivo na citação
  await enviar(eu('i1', { imageMessage: { mimetype: 'image/jpeg', caption: 'mercado no pix' } }));
  assertEquals(atob(chamadasGemini[1].partes[0].inlineData.data), 'midia-baixada');
  assertEquals(evo.chamadas.filter(c => c[0] === 'midia')[0][2].key.id, 'i1');
  assertMatch(chamadasGemini[1].partes.at(-1).text, /mercado no pix/);
  await enviar(eu('d1', { documentWithCaptionMessage: { message: { documentMessage: { mimetype: 'application/pdf', caption: 'boleto luz' } } }, base64: btoa('pdf') }));
  assertEquals(chamadasGemini[2].partes[0].inlineData.mimeType, 'application/pdf');
  await enviar(eu('s1', { stickerMessage: {} }));
  assertMatch(enviados().at(-1)!.texto, /não consigo ler/);
  const antes = enviados().length;
  await enviar(eu('r1', { reactionMessage: { text: '👍' } }));
  await enviar(eu('p1', { protocolMessage: { type: 0 } }));
  assertEquals(enviados().length, antes);
});

Deno.test('falha do Gemini avisa com carinho e marca erro; item inválido é informado', async () => {
  const a = montarWhats({ erroGemini: new Error('503') });
  await a.enviar(texto('f1', 'gastei 30 no pix'));
  assertMatch(a.enviados().at(-1)!.texto, /Ops, Luiz, tive um probleminha/);
  assertEquals(a.db.tabela('whatsapp_mensagens').find(m => m.message_id === 'f1')!.status, 'erro');

  const b = montarWhats({ extracao: { resposta: null, lancamentos: [
    { conta: 'luiz|out|CASA', descricao: 'ok', valor_parcela: 10, parcelas: 1, forma: 'PIX', cartao: '-', recorrente: false, data: '2026-11-16', pago: true },
    { conta: 'luiz|out|CASA', descricao: 'sem valor', valor_parcela: 0, parcelas: 1, forma: 'PIX', cartao: '-', recorrente: false, data: '2026-11-16', pago: true }
  ] } });
  await b.enviar(texto('f2', 'dois gastos'));
  assertEquals(b.db.tabela('entries').length, 1);
  assertMatch(b.enviados().at(-1)!.texto, /Um item eu não consegui lançar: Não identifiquei o valor/);
});

Deno.test('WhatsApp: total do mês, parcelado e agradecimento', async () => {
  const extracao = { resposta: null, lancamentos: [{ conta: 'luiz|out|GASOLINA', descricao: 'Shell', valor_parcela: 100, parcelas: 3, forma: 'Crédito', cartao: 'INTER', recorrente: false, data: '2026-11-16', pago: true }] };
  const { db, enviar, enviados } = montarWhats({ extracao });
  db.tabela('entries').push({ id: 'velho', workspace_id: WS, profile: 'luiz', kind: 'out', cat: 'GASOLINA', val: '50.00', venc: '2026-11-03', deleted_at: null });
  await enviar(texto('p1', 'abasteci 300 em 3x no inter'));
  const t = enviados().at(-1)!.texto;
  assertMatch(t, /R\$\s?300,00 em 3x de R\$\s?100,00 no crédito · INTER/);
  assertMatch(t, /1ª parcela hoje, última em 16\/01\/2027/);
  assertMatch(t, /📊 Com esse, \*GASOLINA\* soma R\$\s?150,00 em novembro \(2 lançamentos\)/);
  await enviar(texto('p2', 'valeu!'));
  assertMatch(enviados().at(-1)!.texto, /Luiz/);
  assertEquals(db.tabela('entries').length, 4);
});

Deno.test('conexão: aviso de "open" grava o número, liga ao perfil e dá boas-vindas; "close" marca desconectado', async () => {
  const { db, avisar, enviados } = montarWhats({ conectado: false });
  db.tabela('whatsapp_conexoes').push({ user_id: LUIZ, workspace_id: WS, profile: 'casa', instancia: INST, segredo: SEG, estado: 'aguardando', phone: null, jids: [], atualizado: AGORA.toISOString() });
  db.tabela('whatsapp_vinculos').push({ phone: FONE, workspace_id: 'ws-velho', user_id: 'u-velho', profile: 'luiz' }); // número estava com outra pessoa
  await avisar({ event: 'connection.update', data: { instance: INST, state: 'open', wuid: JID } });
  const cx = db.tabela('whatsapp_conexoes')[0];
  assertEquals([cx.estado, cx.phone], ['conectado', FONE]);
  assertEquals(db.tabela('whatsapp_vinculos').map(v => [v.phone, v.user_id, v.profile]), [[FONE, LUIZ, 'casa']]);
  assertMatch(enviados()[0].texto, /Oi, Luiz! 👋[\s\S]*perfil \*Casa/);
  await avisar({ event: 'CONNECTION_UPDATE', data: { state: 'open', wuid: JID } }); // repetido: sem nova boas-vindas
  assertEquals(enviados().length, 1);
  await avisar({ event: 'connection.update', data: { state: 'close', statusReason: 401 } });
  assertEquals(db.tabela('whatsapp_conexoes')[0].estado, 'desconectado');
});

// ---------- Conexão pelo site ----------

function montarConexao(estadoEvo = 'connecting') {
  const db = new BancoFalso();
  db.relogio = () => AGORA;
  db.usuarios['tok-luiz'] = { id: LUIZ, email: 'l@x.test' };
  db.usuarios['tok-sem'] = { id: 'u-sem', email: 's@x.test' };
  db.tabela('workspace_members').push({ workspace_id: WS, user_id: LUIZ, display_name: 'Luiz', email: 'l@x.test' });
  const evo = evoFalsa({ estado: estadoEvo });
  let relogio = AGORA.getTime();
  const h = conexao({ db: db as any, evo, urlWebhook: 'https://sb.test/functions/v1/whatsapp', origens: ['https://site.test'], agora: () => new Date(relogio), log: () => {}, espera: async () => {} });
  const pedir = async (token: string | null, corpo: any) => {
    const r = await h(new Request('https://x/whatsapp-conexao', { method: 'POST', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json', origin: 'https://site.test', ...(token ? { authorization: 'Bearer ' + token } : {}) } }));
    return { status: r.status, dados: await r.json() };
  };
  return { db, evo, pedir, avancar: (ms: number) => { relogio += ms; } };
}

Deno.test('conexão pelo site: login, QR Code, código de pareamento, conectado, perfil e desconectar', async () => {
  const { db, evo, pedir, avancar } = montarConexao();
  assertEquals((await pedir(null, { acao: 'estado' })).status, 401);
  assertEquals((await pedir('tok-sem', { acao: 'estado' })).status, 403);
  assertEquals((await pedir('tok-luiz', { acao: 'estado' })).dados.estado, 'nenhuma');
  assertEquals((await pedir('tok-luiz', { acao: 'conectar', perfil: 'xx' })).status, 400);

  const c1 = await pedir('tok-luiz', { acao: 'conectar', perfil: 'luiz' });
  assertEquals([c1.status, c1.dados.estado, c1.dados.qr.base64], [200, 'aguardando', 'data:image/png;base64,QR']);
  assert(!('segredo' in c1.dados) && !JSON.stringify(c1.dados).includes(db.tabela('whatsapp_conexoes')[0].segredo));
  const cx = { ...db.tabela('whatsapp_conexoes')[0] };
  assertMatch(cx.instancia, /^cfi-u-luiz-[0-9a-f]{8}$/);
  const criar = evo.chamadas.find(c => c[0] === 'criar');
  assertEquals(criar[2], `https://sb.test/functions/v1/whatsapp?i=${cx.instancia}&t=${cx.segredo}`);

  assertEquals((await pedir('tok-luiz', { acao: 'conectar', perfil: 'luiz' })).status, 429); // clique repetido
  avancar(10000);
  const c2 = await pedir('tok-luiz', { acao: 'conectar', perfil: 'casa', numero: '+55 (31) 99999-0000' });
  assertEquals(c2.dados.qr.codigo, 'ABCD-1234');
  assert(evo.chamadas.some(c => c[0] === 'apagar' && c[1] === cx.instancia)); // a conexão antiga é apagada
  assertEquals(db.tabela('whatsapp_conexoes').length, 1);

  const e1 = await pedir('tok-luiz', { acao: 'estado' });
  assertEquals([e1.dados.estado, e1.dados.qr.base64], ['aguardando', 'data:image/png;base64,QR2']);
  evo.estadoAtual = 'open';
  const e2 = await pedir('tok-luiz', { acao: 'estado' });
  assertEquals([e2.dados.estado, e2.dados.phone, e2.dados.perfil], ['conectado', FONE, 'casa']);
  assertEquals(db.tabela('whatsapp_vinculos').map(v => [v.phone, v.profile]), [[FONE, 'casa']]);
  assert(evo.chamadas.some(c => c[0] === 'enviar' && /Oi, Luiz/.test(c[3]))); // boas-vindas

  const p = await pedir('tok-luiz', { acao: 'perfil', perfil: 'empresa' });
  assertEquals(p.dados.perfil, 'empresa');
  assertEquals(db.tabela('whatsapp_vinculos')[0].profile, 'empresa');

  evo.estadoAtual = 'close';
  assertEquals((await pedir('tok-luiz', { acao: 'estado' })).dados.estado, 'desconectado');

  const d = await pedir('tok-luiz', { acao: 'desconectar' });
  assertEquals(d.dados.estado, 'nenhuma');
  assertEquals([db.tabela('whatsapp_conexoes').length, db.tabela('whatsapp_vinculos').length], [0, 0]);
});

Deno.test('conexão pelo site: QR expirado e servidor fora do ar', async () => {
  const { pedir, evo } = montarConexao('close');
  await pedir('tok-luiz', { acao: 'conectar', perfil: 'luiz' });
  assertEquals((await pedir('tok-luiz', { acao: 'estado' })).dados.expirado, true);
  evo.estado = async () => { throw new Error('evolution_nao_configurada'); };
  const r = await pedir('tok-luiz', { acao: 'estado' });
  assertEquals([r.status, r.dados.erro], [502, 'servidor_nao_configurado']);
  assertEquals((await pedir('tok-luiz', { acao: 'conectar', perfil: 'luiz', numero: '123' })).status, 400);
});

// ---------- CFO ----------

const LINHAS: Lanc[] = [
  { profile: 'luiz', kind: 'in', cat: 'UBER', obs: '', val: '3000.00', forma: 'PIX', tipo: 'Único', card: '-', parc: '1/1', venc: '2026-11-05', pag: '2026-11-05' },
  { profile: 'luiz', kind: 'out', cat: 'GASOLINA', obs: 'Shell', val: '400.00', forma: 'Crédito', tipo: 'Único', card: 'INTER', parc: '1/1', venc: '2026-11-10', pag: '2026-11-10' },
  { profile: 'luiz', kind: 'out', cat: 'ELETRÔNICOS', obs: 'iPhone', val: '500.00', forma: 'Crédito', tipo: 'Parcelado', card: 'INTER', parc: '2/10', venc: '2026-12-10', pag: null },
  { profile: 'luiz', kind: 'out', cat: 'INTERNET', obs: 'Vivo', val: '100.00', forma: 'Boleto', tipo: 'Recorrente', card: '-', parc: '1/1', venc: '2026-11-01', pag: null },
  { profile: 'empresa', kind: 'in', cat: 'R-S (Oficina)', obs: '', val: '8000.00', forma: 'PIX', tipo: 'Único', card: '-', parc: '1/1', venc: '2026-10-20', pag: '2026-10-20' }
];

Deno.test('resumo do CFO: meses, atrasados, faturas e ferramentas', () => {
  const r: any = resumir(LINHAS, [{ scope: 'meta', key: 'luiz|out|GASOLINA', value: '300' }, { scope: 'limite', key: 'x', value: 0 }], '2026-11-16');
  const nov = r.perfis.luiz.por_mes.find((m: any) => m.mes === '2026-11');
  assertEquals([nov.recebido, nov.gasto, nov.a_pagar], [3000, 400, 100]);
  assertEquals(r.perfis.luiz.atrasados.map((a: any) => a.cat), ['INTERNET']);
  assertEquals(r.perfis.luiz.faturas_credito_proximos_meses.INTER, { '2026-11': 400, '2026-12': 500 });
  assertEquals(r.perfis.cleide.sem_lancamentos, true);
  assertEquals(r.metas_e_limites.length, 1);
  const c: any = executarFerramenta('consultar_lancamentos', { perfil: 'luiz', tipo: 'out', situacao: 'pendente' }, LINHAS, '2026-11-16');
  assertEquals([c.quantidade, c.soma], [2, 600]);
  assertEquals(c.lancamentos.map((l: any) => l.situacao), ['a vencer', 'atrasado']);
  const t: any = executarFerramenta('totais_por_categoria', { tipo: 'in', de: '2026-01-01', ate: '2026-12-31' }, LINHAS, '2026-11-16');
  assertEquals(t[0], { categoria: 'empresa · R-S (Oficina)', pago: 8000, pendente: 0, quantidade: 1, total: 8000 });
  assertThrows(() => executarFerramenta('apagar_tudo', {}, LINHAS, '2026-11-16'));
});

function montarCFO(conversar?: any) {
  const db = new BancoFalso();
  db.relogio = () => AGORA;
  db.usuarios['tok-luiz'] = { id: LUIZ, email: 'l@x.test' };
  db.usuarios['tok-estranho'] = { id: 'u-x', email: 'x@x.test' };
  db.tabela('workspace_members').push({ workspace_id: WS, user_id: LUIZ, display_name: 'Luiz', email: 'l@x.test' });
  LINHAS.forEach(l => db.tabela('entries').push({ ...l, id: crypto.randomUUID(), workspace_id: WS, deleted_at: null }));
  db.tabela('entries').push({ ...LINHAS[0], id: 'outro', workspace_id: 'ws-2', deleted_at: null, val: '999999' });
  const chamadas: any[] = [];
  const h = cfo({
    db: db as any, agora: () => AGORA, origens: ['https://site.test'], log: () => {},
    conversar: conversar ?? (async (o: any) => {
      chamadas.push(o);
      const r = await o.executar('consultar_lancamentos', { perfil: 'luiz', tipo: 'out' });
      return { texto: `Gastos de saída: ${r.soma}`, modelo: 'teste', passos: 2 };
    })
  });
  const perguntar = (token: string | null, corpo: any = { pergunta: 'Como estamos?' }) => h(new Request('https://x/cfo', {
    method: 'POST', body: JSON.stringify(corpo),
    headers: { 'content-type': 'application/json', origin: 'https://site.test', ...(token ? { authorization: 'Bearer ' + token } : {}) }
  }));
  return { db, h, perguntar, chamadas };
}

Deno.test('CFO: login, espaço, resposta com ferramenta e histórico salvo', async () => {
  const { db, h, perguntar, chamadas } = montarCFO();
  const pre = await h(new Request('https://x/cfo', { method: 'OPTIONS', headers: { origin: 'https://site.test' } }));
  assertEquals([pre.status, pre.headers.get('access-control-allow-origin')], [204, 'https://site.test']);
  assertEquals((await perguntar(null)).status, 401);
  assertEquals((await perguntar('tok-estranho')).status, 403);
  assertEquals((await perguntar('tok-luiz', { pergunta: '  ' })).status, 400);
  const r = await perguntar('tok-luiz');
  assertEquals(r.status, 200);
  assertEquals((await r.json()).texto, 'Gastos de saída: 1000'); // só o espaço do Luiz
  assertMatch(chamadas[0].sistema, /Quem está falando com você agora: Luiz/);
  assert(!chamadas[0].sistema.includes('999999'));
  assertEquals(db.tabela('cfo_mensagens').map(m => [m.papel, m.texto]), [['user', 'Como estamos?'], ['cfo', 'Gastos de saída: 1000']]);
  await perguntar('tok-luiz', { pergunta: 'E o cartão?' });
  assertEquals(chamadas[1].historico.map((c: any) => c.role), ['user', 'model', 'user']);
});

Deno.test('CFO: limite por hora e falha do Gemini', async () => {
  const { db, perguntar } = montarCFO();
  for (let i = 0; i < 30; i++) db.tabela('cfo_mensagens').push({ workspace_id: WS, papel: 'user', texto: 'x', created_at: '2026-11-16T14:30:00Z' });
  assertEquals((await perguntar('tok-luiz')).status, 429);
  const b = montarCFO(async () => { throw Object.assign(new Error('cota'), { status: 429 }); });
  const r = await b.perguntar('tok-luiz');
  assertEquals([r.status, (await r.json()).erro], [502, 'cota']);
  assertEquals(b.db.tabela('cfo_mensagens').length, 0); // a pergunta sem resposta não fica na conversa
});

Deno.test('gemini: sem chave configurada falha sem tentar a rede', async () => {
  const { gerarJson } = await import('../_shared/gemini.ts');
  Deno.env.delete('GEMINI_API_KEY');
  await assertRejects(() => gerarJson({ sistema: 's', partes: [{ text: 'x' }], esquema: {} }), Error, 'GEMINI_API_KEY');
});

Deno.test('respostas: datas relativas e variação estável', () => {
  assertEquals(R.quando('2026-11-16', '2026-11-16'), 'hoje');
  assertEquals(R.quando('2026-11-15', '2026-11-16'), 'ontem');
  assertEquals(R.quando('2026-11-17', '2026-11-16'), 'amanhã');
  assertEquals(R.quando('2026-11-20', '2026-11-16'), '20/11');
  assertEquals(R.quando('2027-01-05', '2026-11-16'), '05/01/2027');
  assertEquals(R.variar(['a', 'b', 'c'], 'x1'), R.variar(['a', 'b', 'c'], 'x1'));
  assertEquals(R.primeiroNome('CLEIDE nascimento', 'X'), 'Cleide');
  assertEquals(R.primeiroNome('', 'Luiz'), 'Luiz');
  const conta = R.bloco([{ id: '1', profile: 'casa', kind: 'out', cat: 'ENERGIA', obs: 'Cemig', val: 210.5, forma: 'Boleto', tipo: 'Recorrente', card: '-', parc: '1/1', venc: '2026-11-25', pag: null }], '2026-11-16');
  assertMatch(conta, /⏰ vence 25\/11 — deixei como pendente · Casa › Saídas · todo mês/);
});
