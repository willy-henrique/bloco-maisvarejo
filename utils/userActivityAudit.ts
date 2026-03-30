import type { ActionItem, RitmoGestaoBoard, Responsavel } from '../types';
import type { UserProfile } from '../types/user';
import { responsavelIdsForLoggedUser } from '../components/Dashboard/responsavelSearchUtils';

function normStr(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

function buildActivityRefSet(target: UserProfile, responsaveis: Responsavel[]): Set<string> {
  const refs = new Set<string>();
  const add = (s: string | null | undefined) => {
    const n = normStr(s);
    if (n) refs.add(n);
  };
  add(target.uid);
  add(target.nome);
  add(target.email);
  if (target.email.includes('@')) {
    add(target.email.split('@')[0]?.trim());
  }
  for (const x of responsavelIdsForLoggedUser(target.uid, target.nome, responsaveis, { email: target.email })) {
    add(x);
  }
  return refs;
}

function valueTouchesRefs(value: string | undefined | null, refs: Set<string>): boolean {
  const v = normStr(value);
  if (!v) return false;
  if (refs.has(v)) return true;
  for (const part of v.split('|')) {
    if (refs.has(normStr(part))) return true;
  }
  return false;
}

export type UserActivityAuditResult = {
  /** true somente se não há vínculos com iniciativas, ritmo, responsáveis nem cadastro de outros usuários. */
  semHistoricoNaPlataforma: boolean;
  motivos: string[];
};

/**
 * Verifica se o usuário aparece em qualquer registro de negócio (criador, dono, WHO, responsável, etc.).
 * Usado para permitir exclusão apenas de cadastros “zerados”.
 */
export function auditarAtividadeUsuarioNaPlataforma(
  target: UserProfile,
  todosPerfis: UserProfile[],
  items5w2h: ActionItem[],
  ritmo: RitmoGestaoBoard,
): UserActivityAuditResult {
  const motivos: string[] = [];
  const responsaveis = Array.isArray(ritmo.responsaveis) ? ritmo.responsaveis : [];
  const refs = buildActivityRefSet(target, responsaveis);

  const targetUid = normStr(target.uid);
  for (const u of todosPerfis) {
    if (normStr(u.uid) === targetUid) continue;
    if (targetUid && normStr(u.criadoPor) === targetUid) {
      motivos.push('Este usuário cadastrou outra pessoa no sistema.');
      break;
    }
  }

  for (const it of items5w2h) {
    if (valueTouchesRefs(it.created_by, refs) || valueTouchesRefs(it.who, refs)) {
      motivos.push('Existem iniciativas no quadro Estratégico vinculadas a este usuário (criação ou WHO).');
      break;
    }
  }

  for (const b of ritmo.backlog ?? []) {
    if (valueTouchesRefs(b.created_by, refs)) {
      motivos.push('Existem itens no backlog (Ritmo) criados por este usuário.');
      break;
    }
  }

  for (const p of ritmo.prioridades ?? []) {
    if (valueTouchesRefs(p.dono_id, refs) || valueTouchesRefs(p.created_by, refs)) {
      motivos.push('Existem prioridades vinculadas a este usuário.');
      break;
    }
  }

  for (const pl of ritmo.planos ?? []) {
    if (valueTouchesRefs(pl.who_id, refs) || valueTouchesRefs(pl.created_by, refs)) {
      motivos.push('Existem planos de ataque vinculados a este usuário.');
      break;
    }
  }

  for (const t of ritmo.tarefas ?? []) {
    if (valueTouchesRefs(t.responsavel_id, refs) || valueTouchesRefs(t.created_by, refs)) {
      motivos.push('Existem tarefas vinculadas a este usuário.');
      break;
    }
  }

  for (const r of responsaveis) {
    if (valueTouchesRefs(r.id, refs) || valueTouchesRefs(r.nome, refs)) {
      motivos.push('Este usuário consta na lista de responsáveis do board.');
      break;
    }
  }

  return {
    semHistoricoNaPlataforma: motivos.length === 0,
    motivos,
  };
}
