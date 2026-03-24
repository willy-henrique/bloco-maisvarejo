import type { Responsavel, Tarefa } from '../../types';

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
