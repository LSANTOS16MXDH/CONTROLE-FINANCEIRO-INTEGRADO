// Testes dos agentes, sem rede: banco em memória, Meta e Gemini simulados.
// Rodar: deno test supabase/functions/_testes/agentes.test.ts
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertMatch, assertRejects, assertThrows } from 'jsr:@std/assert@1.0.13';
import { BancoFalso } from './banco-falso.ts';
import { montarLinhas, contas, esquemaExtracao, descrever } from '../_shared/lancamento.ts';
import { resumir, executarFerramenta, type Lanc } from '../_shared/resumo.ts';
import { criarHandler as whatsapp } from '../whatsapp/logica.ts';
import { criarHandler as cfo } from '../cfo/logica.ts';
import { hojeSP } from '../_shared/comum.ts';
import { numeroDeEnvio } from '../whatsapp/meta.ts';

const SEGREDO = 'segredo-de-teste';
const AGORA = new Date('2026-11-16T15:00:00Z'); // 12h em Brasília
const WS = 'ws-1', LUIZ = 'u-luiz', CLEIDE = 'u-cleide';

async function assinar(corpo: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(corpo)));
  return 'sha256=' + Array.from(mac, b => b.toString(16).padStart(2, '0')).join('');
}

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

// ---------- WhatsApp ----------

function montarWhats(opts: { extracao?: any; erroGemini?: Error } = {}) {
  const db = new BancoFalso();
  db.relogio = () => AGORA;
  const enviados: { para: string; texto: string }[] = [];
  const chamadasGemini: any[] = [];
  const tarefas: Promise<unknown>[] = [];
  const h = whatsapp({
    db: db as any, appSecret: SEGREDO, verifyToken: 'verifica', phoneNumberId: 'PNID',
    gerarJson: async (o) => {
      chamadasGemini.push(o);
      if (opts.erroGemini) throw opts.erroGemini;
      return { dados: opts.extracao ?? { lancamentos: [], resposta: 'Qual o valor?' }, modelo: 'teste' };
    },
    baixarMidia: async (id) => ({ bytes: new TextEncoder().encode('midia-' + id), mime: id.startsWith('aud') ? 'audio/ogg; codecs=opus' : 'image/jpeg' }),
    enviarTexto: async (_pid, para, texto) => { enviados.push({ para, texto }); },
    agora: () => AGORA,
    waitUntil: p => { tarefas.push(p); },
    log: () => {}
  });
  const enviar = async (msgs: any[], pid = 'PNID') => {
    const corpo = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: pid }, messages: msgs } }] }] });
    const r = await h(new Request('https://x/whatsapp', { method: 'POST', body: corpo, headers: { 'x-hub-signature-256': await assinar(corpo) } }));
    await Promise.all(tarefas.splice(0));
    return r;
  };
  const vincular = () => db.tabela('whatsapp_vinculos').push({ phone: '5531999990000', workspace_id: WS, user_id: LUIZ, profile: 'luiz' });
  return { db, h, enviar, enviados, chamadasGemini, vincular };
}
const texto = (id: string, body: string, from = '5531999990000') => ({ from, id, type: 'text', text: { body } });

Deno.test('webhook: verificação da Meta e assinatura', async () => {
  const { h } = montarWhats();
  const ok = await h(new Request('https://x/whatsapp?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=123'));
  assertEquals([ok.status, await ok.text()], [200, '123']);
  assertEquals((await h(new Request('https://x/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1'))).status, 403);
  const falsa = await h(new Request('https://x/whatsapp', { method: 'POST', body: '{}', headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) } }));
  assertEquals(falsa.status, 401);
  assertEquals((await h(new Request('https://x/whatsapp', { method: 'POST', body: '{}' }))).status, 401);
});

Deno.test('número sem vínculo recebe a instrução só uma vez; outro número de telefone da Meta é ignorado', async () => {
  const { enviar, enviados, chamadasGemini } = montarWhats();
  await enviar([texto('m1', 'gastei 50 no mercado')]);
  await enviar([texto('m2', 'oi?')]);
  assertEquals(enviados.length, 1);
  assertMatch(enviados[0].texto, /não está vinculado/);
  await enviar([texto('m3', 'gastei 50')], 'OUTRO');
  assertEquals(enviados.length, 1);
  assertEquals(chamadasGemini.length, 0);
});

Deno.test('vínculo por código: válido, inválido e bloqueio após 5 erros', async () => {
  const { db, enviar, enviados } = montarWhats();
  db.tabela('whatsapp_codigos').push({ codigo: 'AB12CD34', workspace_id: WS, user_id: CLEIDE, profile: 'cleide', expires_at: '2026-11-16T15:10:00Z' });
  db.tabela('whatsapp_codigos').push({ codigo: 'FFFF0000', workspace_id: WS, user_id: LUIZ, profile: 'luiz', expires_at: '2026-11-16T14:00:00Z' });
  await enviar([texto('v1', 'FFFF0000', '5531988880000')]);
  assertMatch(enviados.at(-1)!.texto, /inválido ou expirado/);
  await enviar([texto('v2', 'vincular ab12cd34', '5531988880000')]);
  assertMatch(enviados.at(-1)!.texto, /vinculado ao perfil \*Cleide Nascimento\*/);
  assertEquals(db.tabela('whatsapp_vinculos'), [{ phone: '5531988880000', workspace_id: WS, user_id: CLEIDE, profile: 'cleide' } as any].map(v => ({ ...v, id: db.tabela('whatsapp_vinculos')[0].id, created_at: db.tabela('whatsapp_vinculos')[0].created_at, deleted_at: null, status: 'recebida', entry_ids: [] })));
  assertEquals(db.tabela('whatsapp_codigos').length, 1); // o usado foi apagado
  for (let i = 0; i < 6; i++) await enviar([texto('x' + i, '0000000' + i, '5531977770000')]);
  assertEquals(enviados.filter(e => e.para === '5531977770000').length, 5);
  assertEquals(db.tabela('whatsapp_mensagens').find(m => m.message_id === 'x5')!.status, 'bloqueado');
});

Deno.test('texto vira lançamento, reenvio da Meta não duplica e desfazer apaga', async () => {
  const extracao = { lancamentos: [{ conta: 'luiz|out|GASOLINA', descricao: 'Posto Shell', valor_parcela: 120, parcelas: 1, forma: 'Débito', cartao: '-', recorrente: false, data: '2026-11-16', pago: true }], resposta: null };
  const { db, enviar, enviados, chamadasGemini, vincular } = montarWhats({ extracao });
  vincular();
  await enviar([texto('g1', 'gastei 120 de gasolina no débito')]);
  await enviar([texto('g1', 'gastei 120 de gasolina no débito')]); // reenvio
  const e = db.tabela('entries');
  assertEquals(e.length, 1);
  assertEquals([e[0].workspace_id, e[0].created_by, e[0].origem, e[0].cat, e[0].val, e[0].profile], [WS, LUIZ, 'whatsapp', 'GASOLINA', 120, 'luiz']);
  assertEquals(chamadasGemini.length, 1);
  assertMatch(chamadasGemini[0].sistema, /perfil "luiz"/);
  assertMatch(chamadasGemini[0].partes.at(-1).text, /gasolina/);
  assertMatch(enviados.at(-1)!.texto, /✅ Lançado:[\s\S]*GASOLINA[\s\S]*desfazer/);
  await enviar([texto('g2', 'Desfazer')]);
  assertEquals(e[0].deleted_at, AGORA.toISOString());
  assertMatch(enviados.at(-1)!.texto, /Desfeito: 1/);
  await enviar([texto('g3', 'desfazer')]);
  assertMatch(enviados.at(-1)!.texto, /Não há lançamento/);
});

Deno.test('áudio e foto vão ao Gemini como dados; sem lançamento devolve a pergunta', async () => {
  const { enviar, enviados, chamadasGemini, vincular } = montarWhats({ extracao: { lancamentos: [], resposta: 'Foi no crédito ou no débito?' } });
  vincular();
  await enviar([{ from: '5531999990000', id: 'a1', type: 'audio', audio: { id: 'aud-9', mime_type: 'audio/ogg; codecs=opus', voice: true } }]);
  const partes = chamadasGemini[0].partes;
  assertEquals(partes[0].inlineData.mimeType, 'audio/ogg');
  assertEquals(atob(partes[0].inlineData.data), 'midia-aud-9');
  assertEquals(enviados.at(-1)!.texto, 'Foi no crédito ou no débito?');
  await enviar([{ from: '5531999990000', id: 'i1', type: 'image', image: { id: 'img-1', mime_type: 'image/jpeg', caption: 'mercado no pix' } }]);
  assertEquals(chamadasGemini[1].partes[0].inlineData.mimeType, 'image/jpeg');
  assertMatch(chamadasGemini[1].partes.at(-1).text, /mercado no pix/);
  await enviar([{ from: '5531999990000', id: 's1', type: 'sticker', sticker: { id: 'st' } }]);
  assertMatch(enviados.at(-1)!.texto, /Consigo ler/);
  await enviar([{ from: '5531999990000', id: 'r1', type: 'reaction', reaction: { emoji: '👍' } }]);
  assertEquals(enviados.length, 3);
});

Deno.test('falha do Gemini avisa a pessoa e marca erro; item inválido é informado', async () => {
  const a = montarWhats({ erroGemini: new Error('503') });
  a.vincular();
  await a.enviar([texto('f1', 'gastei 30 no pix')]);
  assertMatch(a.enviados.at(-1)!.texto, /Não consegui registrar/);
  assertEquals(a.db.tabela('whatsapp_mensagens')[0].status, 'erro');

  const b = montarWhats({ extracao: { resposta: null, lancamentos: [
    { conta: 'luiz|out|CASA', descricao: 'ok', valor_parcela: 10, parcelas: 1, forma: 'PIX', cartao: '-', recorrente: false, data: '2026-11-16', pago: true },
    { conta: 'luiz|out|CASA', descricao: 'sem valor', valor_parcela: 0, parcelas: 1, forma: 'PIX', cartao: '-', recorrente: false, data: '2026-11-16', pago: true }
  ] } });
  b.vincular();
  await b.enviar([texto('f2', 'dois gastos')]);
  assertEquals(b.db.tabela('entries').length, 1);
  assertMatch(b.enviados.at(-1)!.texto, /1 item\(ns\) não lançado/);
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

Deno.test('celular do Brasil sem o nono dígito recebe o 9 no envio', () => {
  assertEquals(numeroDeEnvio('553188887777'), '5531988887777');
  assertEquals(numeroDeEnvio('5531988887777'), '5531988887777');
  assertEquals(numeroDeEnvio('553133334444'), '553133334444'); // fixo
  assertEquals(numeroDeEnvio('15551677598'), '15551677598');
});
