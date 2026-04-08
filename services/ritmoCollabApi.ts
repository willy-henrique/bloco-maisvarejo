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

export async function apiGetBlockContext(
  planId: string,
  tarefas: Tarefa[],
): Promise<
  { task_id: string; task_title: string; task_owner: string; block_reason: string }[] | null
> {
  try {
    const resp = await fetch('/api/ritmo-block-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: planId, tarefas }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      context?: { task_id: string; task_title: string; task_owner: string; block_reason: string }[];
    };
    return Array.isArray(data.context) ? data.context : null;
  } catch {
    return null;
  }
}
