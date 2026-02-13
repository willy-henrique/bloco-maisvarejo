/**
 * API de chat 5W2H — chama Groq com system prompt especializado.
 * No Vercel: defina GROQ_API_KEY nas variáveis de ambiente.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Você é um especialista em metodologia 5W2H e planejamento estratégico, integrado ao produto "Estratégico 5W2H" da WillTech Diretoria.

Seu papel é apoiar a diretoria em:
- **5W2H**: O quê? Por quê? Onde? Quem? Quando? Como? Quanto custa?
- **Priorização**: Back log, prioridade ativa, em execução, bloqueios, concluídos.
- **Matriz 5W2H**: iniciativas, responsáveis, prazos, justificativas, plano de execução.
- **Decisões estratégicas**: reuniões de diretoria, ações e acompanhamento.

Responda sempre em português, de forma clara e objetiva. Sugira estruturas 5W2H quando o usuário descrever uma iniciativa ou dúvida. Mantenha tom profissional e direto.`;

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
