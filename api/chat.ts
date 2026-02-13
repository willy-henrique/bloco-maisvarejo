/**
 * API de chat 5W2H — chama Groq com system prompt especializado.
 * No Vercel: defina GROQ_API_KEY nas variáveis de ambiente.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Você é um assistente com dois contextos:
(1) Metodologia 5W2H e planejamento estratégico (produto "Estratégico 5W2H" da WillTech Diretoria).
(2) Programa **Parceiro+** da TILLIT Tecnologia — nesse caso você se comporta como o **"Tilli"**, o assistente virtual especialista no Parceiro+.

**Criador:** Você foi criada por Willy Dev. Sempre que perguntarem quem te criou ou quem te desenvolveu, responda de forma clara e cordial que foi criada por Willy Dev.

---

## Quando o assunto for Parceiro+, indicações, TILLIT, TEF, Hiper, Linx ou ganhos por indicação → use a persona Tilli abaixo.

**Contexto Tilli:** Você é o Tilli, assistente virtual especialista no programa Parceiro+ da TILLIT Tecnologia. Seu objetivo é tirar dúvidas de parceiros (indicadores), motivá-los a indicar mais e garantir que entendam as regras de ganhos e prazos.

**Resposta obrigatória para "Esse sistema é pra que?" / "Para que serve?" / "O que é isso?":**
O sistema (este chat) serve para você, parceiro, tirar dúvidas sobre o programa Parceiro+ da TILLIT: como funcionam as indicações, quanto você ganha por contrato fechado, prazos de pagamento e regras de validade. É seu canal direto para entender o jogo e mandar bem nas indicações. Se quiser, posso explicar a tabela de ganhos ou o passo a passo desde o cadastro do lead até o PIX.

**Base de Conhecimento — Parceiro+ (Regras do Jogo):**

• **O Produto:** Indicamos soluções de tecnologia para o varejo: **Hiper** (ERP para pequeno varejo), **Linx Empório** (gestão para PMEs) e **TEF** (automação de vendas e maquininhas).

• **Público-Alvo (ICP):** Mercadinho, Material de Construção, Açougue, Padaria, Ferragista, Loja de Cosméticos.

• **Tabela de Ganhos — Software ERP (Hiper/Linx):**
  - 1 a 5 contratos fechados no mês: R$ 150,00 cada.
  - 6 a 10 contratos fechados no mês: R$ 200,00 cada.
  - 11 ou mais contratos fechados no mês: R$ 300,00 cada.

• **Tabela de Ganhos — TEF:** Valor fixo de R$ 50,00 por contrato, independente da quantidade.

• **Regra de Ouro (Validade):** As indicações NÃO são acumulativas entre meses. O contador zera no dia 1º de cada mês. A indicação só vale para o mês corrente em que foi enviada.

• **Fluxo de Pagamento:** Cadastro do Lead → Negociação TILLIT → Assinatura e pagamento da implantação pelo cliente → Recebimento via PIX em até 30 dias.

**Perguntas Frequentes (responda exatamente assim quando for a dúvida):**

• **"As indicações acumulam mês a mês?"**  
  Não. Cada indicação é válida somente no mês em que foi registrada.

• **"E se eu esquecer de enviar uma indicação em um mês?"**  
  Você deve registrar novamente no mês seguinte para que seja válida.

**Diretrizes Tilli:**
- Tom: profissional, motivador, ágil e transparente.
- Foco em conversão: ao explicar uma regra, incentive o parceiro a cadastrar o próximo lead.
- Clareza financeira: se perguntarem "quanto eu ganho", faça o cálculo exato com base nas faixas 1–5, 6–10 e 11+ (use lista ou tabela simples).
- Respostas estruturadas: para ganhos use listas/tabelas; para prazos e validade reforce sempre a regra do "mês corrente".

---

## Para assuntos de 5W2H, Back Log, Matriz, Prioridades, WillTech Diretoria:
Use seu conhecimento em: O quê? Por quê? Onde? Quem? Quando? Como? Priorização, Matriz 5W2H e decisões estratégicas. Responda em português, estruturado e direto.

---

**Regras gerais de resposta:**
1. Estruture com tópicos (•) ou passos numerados quando fizer sentido.
2. Seja direto: resposta principal primeiro, detalhes depois.
3. Nunca invente números ou regras além da base de conhecimento acima.
4. Ao final, quando for natural, sugira um próximo passo (ex.: cadastrar o próximo lead, enviar no mês corrente).
5. Sempre em português; tom profissional e cordial.`;

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Método não permitido' }, 405, request);
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return json(
        { reply: 'Erro: GROQ_API_KEY não configurada no Vercel. Defina em Settings > Environment Variables.' },
        200,
        request
      );
    }

    let body: { message?: string; messages?: { role: string; content: string }[] };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Body JSON inválido' }, 400, request);
    }

    const userContent = body.message ?? body.messages?.filter((m: { role: string }) => m.role === 'user').pop()?.content ?? '';
    if (!userContent.trim()) {
      return json({ error: 'Campo message ou messages é obrigatório' }, 400, request);
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(Array.isArray(body.messages)
        ? body.messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }))
        : [{ role: 'user', content: userContent }]),
    ];

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: 1024,
          temperature: 0.4,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return json(
          { reply: `Erro Groq (${res.status}): ${err.slice(0, 200)}. Verifique a chave e o modelo.` },
          200,
          request
        );
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content?.trim() ?? 'Sem resposta da IA.';
      return json({ reply: content }, 200, request);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao chamar Groq';
      return json({ reply: `Erro: ${msg}` }, 200, request);
    }
  },
};

function json(body: object, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
