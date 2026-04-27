import type { Observer, Tarefa } from '../types';

export async function apiAddObserver(
  observers: Observer[],
  userId: string,
  role: Observer['role'] = 'follower',
): Promise<Observer[] | null> {
  try {
    const resp = await fetch('/api/ritmo-observers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'addObserver',
        observers,
        user_id: userId,
        role,
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { observers?: Observer[] };
    return Array.isArray(data.observers) ? data.observers : null;
  } catch {
    return null;
  }
}

export async function apiRemoveObserver(
  observers: Observer[],
  userId: string,
): Promise<Observer[] | null> {
  try {
    const resp = await fetch('/api/ritmo-observers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'removeObserver',
        observers,
        user_id: userId,
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { observers?: Observer[] };
    return Array.isArray(data.observers) ? data.observers : null;
  } catch {
    return null;
  }
}

/**
 * Contexto do bloqueio de um plano: derivado 100% das tarefas do próprio plano,
 * sem depender de endpoint remoto. Antes existia /api/ritmo-block-context
 * (que retornava 404 em produção e poluía o console). A informação que essa
 * rota expunha — id/título/dono/motivo das tarefas bloqueadas — já está nos
 * dados que o cliente possui, então evitamos a chamada desnecessária.
 */
export async function apiGetBlockContext(
  planId: string,
  tarefas: Tarefa[],
): Promise<
  { task_id: string; task_title: string; task_owner: string; block_reason: string }[]
> {
  const bloqueadas = tarefas.filter(
    (t) => t.plano_id === planId && t.status_tarefa === 'Bloqueada',
  );
  return bloqueadas.map((t) => ({
    task_id: t.id,
    task_title: t.titulo,
    task_owner: t.responsavel_id,
    block_reason: t.bloqueio_motivo || '',
  }));
}
