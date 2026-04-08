import type { Observer, Responsavel, Tarefa } from '../../types';

function normStr(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

/** Indica se a tarefa está atribuída ao usuário logado (id/nome no cadastro de responsáveis). */
export function tarefaAtribuidaAoUsuario(
  t: Tarefa,
  myResponsavelIds: Set<string>,
  responsaveis: Responsavel[],
): boolean {
  if (myResponsavelIds.size === 0) return false;
  const raw = (t.responsavel_id ?? '').trim();
  if (!raw) return false;
  const n = normStr(raw);
  if (myResponsavelIds.has(n)) return true;
  const r = responsaveis.find((x) => normStr(x.id) === n || normStr(x.nome) === n);
  if (!r) return false;
  return myResponsavelIds.has(normStr(r.id)) || myResponsavelIds.has(normStr(r.nome));
}

function refsFromResponsavelValue(value: string, responsaveis: Responsavel[]): string[] {
  const raw = value.trim();
  if (!raw) return [];
  const n = normStr(raw);
  const matched = responsaveis.find((r) => normStr(r.id) === n || normStr(r.nome) === n);
  if (!matched) return [n];
  return [n, normStr(matched.id), normStr(matched.nome)].filter(Boolean);
}

export function userIsObserver(
  observers: Observer[] | undefined,
  myResponsavelIds: Set<string>,
): boolean {
  if (!Array.isArray(observers) || observers.length === 0 || myResponsavelIds.size === 0) return false;
  return observers.some((o) => myResponsavelIds.has(normStr(o.user_id)));
}

export function canViewByOwnershipOrObserver(
  ownerRefs: string[],
  observers: Observer[] | undefined,
  myResponsavelIds: Set<string>,
  responsaveis: Responsavel[],
): boolean {
  if (myResponsavelIds.size === 0) return false;
  if (userIsObserver(observers, myResponsavelIds)) return true;
  for (const ref of ownerRefs) {
    const normalizedRefs = refsFromResponsavelValue(ref, responsaveis);
    if (normalizedRefs.some((r) => myResponsavelIds.has(r))) return true;
  }
  return false;
}
