// Textos do agente no WhatsApp. O tom é de um assistente pessoal: chama a
// pessoa pelo nome, confirma com clareza o que foi feito e dá um pouco de
// contexto do mês, sem parecer mensagem automática.
import { PERFIS, brl, dataBR, type Linha } from '../_shared/lancamento.ts';

/** Escolhe uma variação de frase de forma estável para a mesma mensagem. */
export function variar<T>(lista: T[], semente: string): T {
  let h = 0;
  for (const c of semente) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return lista[h % lista.length];
}

export function primeiroNome(nome: string | null | undefined, reserva: string): string {
  const n = String(nome || '').trim().split(/[\s@]+/)[0];
  if (!n) return reserva;
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeDoMes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1];

function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "hoje", "ontem", "amanhã" ou a data por extenso curta. */
export function quando(iso: string, hoje: string): string {
  if (iso === hoje) return 'hoje';
  if (iso === somarDias(hoje, -1)) return 'ontem';
  if (iso === somarDias(hoje, 1)) return 'amanhã';
  return dataBR(iso).slice(0, iso.slice(0, 4) === hoje.slice(0, 4) ? 5 : 10);
}

const FORMA: Record<string, string> = {
  'PIX': 'no PIX', 'PIX Corp': 'no PIX da empresa', 'Débito': 'no débito', 'Débito Aut.': 'no débito automático',
  'Dinheiro': 'em dinheiro', 'Boleto': 'no boleto', 'Transferência': 'por transferência', 'Crédito PJ': 'no crédito da empresa'
};
function meio(r: Linha): string {
  const f = FORMA[r.forma] ?? (r.forma.startsWith('Crédito') ? 'no crédito' : `em ${r.forma.toLowerCase()}`);
  return r.card && r.card !== '-' ? `${f} · ${r.card}` : f;
}

/** Bloco de um lançamento (já expandido em parcelas). */
export function bloco(linhas: Linha[], hoje: string): string {
  const r = linhas[0], p = PERFIS[r.profile];
  const icone = r.kind === 'in' ? '💰' : '💸';
  const titulo = `${icone} *${r.cat}*${r.obs ? ` — ${r.obs}` : ''}`;
  const n = linhas.length;
  const valor = n > 1
    ? `${brl(r.val * n)} em ${n}x de ${brl(r.val)} ${meio(r)}`
    : `${brl(r.val)} ${meio(r)}`;
  let data: string;
  if (n > 1) data = `📅 1ª parcela ${quando(r.venc, hoje)}, última em ${dataBR(linhas[n - 1].venc)}`;
  else if (r.pag) data = `📅 ${r.kind === 'in' ? 'recebido' : 'pago'} ${quando(r.pag, hoje)}`;
  else data = `⏰ vence ${quando(r.venc, hoje)} — deixei como pendente`;
  const onde = `${p.curto} › ${r.kind === 'in' ? 'Entradas' : 'Saídas'}${r.tipo === 'Recorrente' ? ' · todo mês' : ''}`;
  return `${titulo}\n${valor}\n${data} · ${onde}`;
}

export interface Contexto {
  /** Soma do mês na mesma categoria, já contando o lançamento novo. */
  totalCategoria: number;
  /** Quantos lançamentos a categoria tem no mês, contando o novo. */
  qtdCategoria: number;
}

export function confirmacao(o: {
  nome: string; grupos: Linha[][]; hoje: string; semente: string;
  contexto?: Contexto | null; problemas?: string[];
}): string {
  const { nome, grupos, hoje, semente } = o;
  const entrada = grupos.every(g => g[0].kind === 'in');
  const abre = grupos.length > 1
    ? variar([`Prontinho, ${nome}! Anotei os ${grupos.length} lançamentos:`, `Feito, ${nome}! Registrei os ${grupos.length} itens:`], semente)
    : entrada
      ? variar([`Opa, dinheiro entrando! 🙌 Já anotei, ${nome}:`, `Boa, ${nome}! Registrei sua entrada:`, `Anotado, ${nome}! Que venham mais dessas 😄`], semente)
      : variar([`Prontinho, ${nome}! Já anotei aqui:`, `Feito, ${nome}! Lançamento registrado:`, `Anotado, ${nome}! ✍️`, `Tudo certo, ${nome}! Registrei assim:`], semente);

  const partes = [abre, grupos.map(g => bloco(g, hoje)).join('\n\n')];

  const c = o.contexto, r = grupos[0][0];
  if (c && grupos.length === 1 && c.qtdCategoria > 1) {
    const mes = nomeDoMes(r.venc);
    partes.push(r.kind === 'in'
      ? `📊 Em *${r.cat}* você já recebeu ${brl(c.totalCategoria)} em ${mes}.`
      : `📊 Com esse, *${r.cat}* soma ${brl(c.totalCategoria)} em ${mes} (${c.qtdCategoria} lançamentos).`);
  }
  if (o.problemas?.length) {
    partes.push(`⚠️ ${o.problemas.length === 1 ? 'Um item eu não consegui lançar' : `${o.problemas.length} itens eu não consegui lançar`}: ${o.problemas.join(' ')} Me manda de novo com o valor e a forma de pagamento?`);
  }
  partes.push(variar([
    'Se algo ficou errado, é só responder *desfazer* que eu apago.',
    'Errei alguma coisa? Responde *desfazer* que eu apago na hora.',
    'Qualquer erro, me manda *desfazer* 😉'
  ], semente + 'f'));
  return partes.join('\n\n');
}

export function boasVindas(nome: string, perfil: string): string {
  return `Oi, ${nome}! 👋 Que bom ter você por aqui.

Seu WhatsApp agora está ligado ao *Controle Financeiro Integrado*, no perfil *${PERFIS[perfil]?.nome ?? perfil}*. A partir de agora eu sou seu assistente financeiro pessoal: é só me mandar o que entrou e o que saiu que eu cuido das anotações.

${comoUsar()}`;
}

function comoUsar(): string {
  return `Pode me mandar do jeito que for mais fácil:
📸 a *foto ou o PDF* de um comprovante
💬 uma *mensagem*, como "gastei 120 de gasolina no débito"
🎙️ um *áudio* contando o gasto ou o recebimento

Se for parcelado, me diz em quantas vezes. Se não for seu, avisa se é da *casa* ou da *empresa*.`;
}

export function ajuda(nome: string, semente: string): string {
  const oi = variar([`Oi, ${nome}! 😊 Tô por aqui.`, `Olá, ${nome}! Em que posso ajudar hoje?`, `E aí, ${nome}! Pronto pra anotar.`], semente);
  return `${oi}\n\n${comoUsar()}\n\nSe eu anotar algo errado, responde *desfazer* que eu apago o último.`;
}

export function agradecimento(nome: string, semente: string): string {
  return variar([`Por nada, ${nome}! Qualquer coisa, é só chamar 😊`, `Imagina, ${nome}! Tô sempre por aqui.`, `Disponha, ${nome}! 🙌`], semente);
}

export function recebendo(nome: string, tipo: 'audio' | 'midia', semente: string): string {
  return tipo === 'audio'
    ? variar([`Ouvindo seu áudio, ${nome}… 🎧 Já te respondo.`, `Recebi o áudio! Só um instante 🎧`], semente)
    : variar([`Recebi, ${nome}! Só um instante que já estou lendo 👀`, `Comprovante recebido! Deixa eu dar uma olhada… 👀`], semente);
}

export function desfeito(nome: string, linhas: { cat: string; val: number | string }[]): string {
  const total = linhas.reduce((s, l) => s + Number(l.val), 0);
  const o_que = linhas.length === 1 ? `*${linhas[0].cat}* de ${brl(total)}` : `${linhas.length} lançamentos (${brl(total)})`;
  return `Pronto, ${nome}! ↩️ Apaguei ${o_que}.\n\nSe quiser, me manda de novo do jeito certo que eu anoto.`;
}

export const nadaParaDesfazer = (nome: string) =>
  `Não encontrei nenhum lançamento seu das últimas 24 horas para desfazer, ${nome}. Se precisar apagar algo mais antigo, dá pra fazer pelo site.`;

export const naoVinculado = () =>
  `Oi! 👋 Eu sou o assistente do *Controle Financeiro Integrado*, mas ainda não conheço este número.\n\nPara a gente começar, abra o site, vá em *Agentes › WhatsApp*, gere um código e me mande aqui.`;

export const codigoInvalido = () =>
  `Hmm, esse código não funcionou 🤔 Ele pode ter expirado (vale 15 minutos). Gere um novo no site, em *Agentes › WhatsApp*, e me manda de novo.`;

export const formatoNaoSuportado = (nome: string) =>
  `${nome}, esse tipo de arquivo eu ainda não consigo ler 😅 Me manda uma foto, um PDF, um áudio ou uma mensagem de texto.`;

export const falhaTemporaria = (nome: string) =>
  `Ops${nome ? `, ${nome}` : ''}, tive um probleminha para registrar agora 😕 Pode me mandar de novo daqui a pouquinho? Se continuar, dá pra lançar pelo site.`;
