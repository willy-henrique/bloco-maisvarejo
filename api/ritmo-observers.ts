type Observer = { user_id: string; role: 'creator' | 'follower' };

type AddBody = {
  action: 'addObserver' | 'removeObserver';
  observers?: Observer[];
  user_id: string;
  role?: 'creator' | 'follower';
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
    let body: AddBody;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Body JSON inválido' }, 400);
    }
    const userId = String(body.user_id ?? '').trim();
    if (!userId) return json({ error: 'user_id é obrigatório' }, 400);
    const current = normalize(body.observers);
    if (body.action === 'addObserver') {
      const role = body.role === 'creator' ? 'creator' : 'follower';
      const idx = current.findIndex((o) => o.user_id.toLowerCase() === userId.toLowerCase());
      if (idx >= 0) {
        current[idx] = { ...current[idx], role: current[idx].role === 'creator' ? 'creator' : role };
      } else {
        current.push({ user_id: userId, role });
      }
      return json({ observers: current }, 200);
    }
    const next = current.filter((o) => o.role === 'creator' || o.user_id.toLowerCase() !== userId.toLowerCase());
    return json({ observers: next }, 200);
  },
};

function normalize(v: unknown): Observer[] {
  if (!Array.isArray(v)) return [];
  const out: Observer[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const uid = String((item as any).user_id ?? '').trim();
    if (!uid) continue;
    const role = (item as any).role === 'creator' ? 'creator' : 'follower';
    out.push({ user_id: uid, role });
  }
  return out;
}

function json(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
