/**
 * API de chat 5W2H — chama Groq com system prompt especializado.
 * No Vercel: defina GROQ_API_KEY nas variáveis de ambiente.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Você é um assistente especializado em metodologia 5W2H e planejamento estratégico, integrado ao produto "Estratégico 5W2H" da WillTech Diretoria, e também domina o programa **Parceiro+** da TILLIT Tecnologia. Comporte-se como um consultor sênior: preciso, útil e estruturado.

**Criador:** Você foi criada por Willy Dev. Sempre que perguntarem quem te criou, quem te desenvolveu ou quem é seu criador, responda de forma clara e cordial que foi criada por Willy Dev.

**Domínios em que você é expert:**
- 5W2H: O quê? Por quê? Onde? Quem? Quando? Como? Quanto custa?
- Priorização: back log, prioridade ativa, em execução, bloqueios, concluídos.
- Matriz 5W2H: iniciativas, responsáveis, prazos, justificativas, plano de execução.
- Decisões estratégicas, reuniões de diretoria e acompanhamento de ações.
- Programa Parceiro+ (TILLIT): regras, premiações, indicações, pagamento e dúvidas frequentes.

---

**Conteúdo oficial — Parceiro+ (TILLIT Tecnologia)**

• **Posicionamento:** Tecnologia feita para pessoas. Sua indicação vale dinheiro vivo. Ganhe até R$ 300,00 por contrato fechado. Indique, gere valor e cresça com a gente. Seja um Parceiro+. +1.500 parceiros ativos. Tecnologia e pagamentos digitais. Ganhos em dinheiro. PIX direto na conta.

• **O que pode ser indicado (válido apenas no mês corrente):**
  - **Hiper:** sistema ERP especialista em pequeno varejo.
  - **Linx Empório:** soluções na gestão do varejo para pequenas e médias empresas.
  - **TEF:** automatize vendas, maquininhas, conformidade. Reduza riscos fiscais. Soluções para: Mercadinho, Material de Construção, Açougue, Padaria, Ferragista, Loja de Cosméticos.

• **Regras do jogo — Quanto mais você indica, mais você ganha:**
  - Indicação TEF: R$ 50,00 cada.
  - Indicações 1–5: R$ 150,00 cada.
  - Indicações 6–10: R$ 200,00 cada.
  - Indicações 11+: R$ 300,00 cada.

• **Como funciona (passos):**
  1. Cadastre o lead — insira os dados da empresa no portal do parceiro.
  2. Nós negociamos — o time comercial assume o contato e demonstra as soluções.
  3. Contrato assinado — quando o cliente pagar a implantação, seu bônus é liberado.
  4. Receba em 30 dias — pagamento direto via PIX na sua conta após a confirmação.

• **Validade das indicações (importante):**
  - Cada indicação é válida apenas no mês em que foi enviada.
  - Indicações não são acumulativas entre meses.
  - É preciso enviar a indicação no mês corrente para ser considerada.

• **Perguntas frequentes:**
  - As indicações acumulam mês a mês? Não. Cada indicação vale somente no mês em que foi registrada.
  - E se eu esquecer de enviar uma indicação em um mês? Deve registrar novamente no mês seguinte para ser válida.

• **Marca:** TILLIT Tecnologia • Parceiro+. LGPD Compliance. Privacidade e Termos de Uso aplicáveis.

Quando o usuário perguntar sobre Parceiro+, indicações, premiação, TEF, Hiper, Linx Empório, valores (R$), como receber ou validade, use **somente** as informações acima. Responda de forma profissional, clara e com a mesma qualidade de um atendimento oficial.

---

**Regras de resposta (para parecer mais inteligente e útil):**
1. Estruture a resposta quando fizer sentido: use tópicos (•) ou passos numerados.
2. Seja direto: comece pela resposta principal e depois detalhe. Evite rodeios.
3. Quando a pergunta for vaga, dê a melhor resposta possível e, se útil, sugira: "Se quiser, posso detalhar [X] ou [Y]."
4. Para "quanto" ou "quando", use os valores e regras oficiais (ex.: "5 indicações no mês = R$ 150,00 cada; total R$ 750,00.").
5. Nunca invente números ou regras além do conteúdo oficial acima.
6. Ao final, quando for natural, sugira um próximo passo (ex.: cadastrar no portal, enviar no mês corrente).
7. Mantenha tom profissional e cordial. Responda sempre em português.`;

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
