type Tarefa = {
  id: string;
  plano_id: string;
  titulo: string;
  responsavel_id: string;
  status_tarefa: 'Pendente' | 'EmExecucao' | 'Bloqueada' | 'Concluida';
  bloqueio_motivo?: string;
};

type Body = {
  plan_id: string;
  tarefas?: Tarefa[];
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
    let body: Body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Body JSON inválido' }, 400);
    }
    const planId = String(body.plan_id ?? '').trim();
    if (!planId) return json({ error: 'plan_id é obrigatório' }, 400);
    const tarefas = Array.isArray(body.tarefas) ? body.tarefas : [];
    const context = tarefas
      .filter((t) => t.plano_id === planId && t.status_tarefa === 'Bloqueada')
      .map((t) => ({
        task_id: t.id,
        task_title: t.titulo,
        task_owner: t.responsavel_id,
        block_reason: t.bloqueio_motivo ?? '',
      }));
    return json({ blocked: context.length > 0, context }, 200);
  },
};

function json(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
