import type { Responsavel } from '../../types';
import type { UserProfile } from '../../types/user';

function normStr(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

/** Evita mostrar UID/código técnico cru na UI (Firebase ~28 chars, sem espaços). */
function looksLikeOpaqueUserId(value: string): boolean {
  const v = value.trim();
  if (!v || v.includes(' ') || v.includes('@')) return false;
  return /^[a-zA-Z0-9_-]{22,36}$/.test(v);
}

/** Dicas extras quando `profile.nome` difere do Auth ou está vazio (ex.: login só com email). */
export type LoggedUserIdentityExtras = {
  email?: string | null;
  displayName?: string | null;
};

function collectIdentityHints(
  loggedUserUid: string | undefined,
  loggedUserName: string | undefined,
  extras?: LoggedUserIdentityExtras | null,
): Set<string> {
  const hints = new Set<string>();
  const add = (s: string | null | undefined) => {
    const n = normStr(s);
    if (n) hints.add(n);
  };
  add(loggedUserUid);
  add(loggedUserName);
  if (extras?.email) {
    add(extras.email.split('@')[0]?.trim());
  }
  add(extras?.displayName ?? undefined);
  return hints;
}

/**
 * Chaves normalizadas para saber se uma prioridade/tarefa "é do" usuário logado.
 * Inclui uid, nome (perfil), parte local do email, displayName do Auth e todos os ids em
 * `responsaveis` cujo nome coincide com qualquer dessas dicas (evita perfil “vazio” ou
 * duplicata legado vs uid).
 */
export function responsavelIdsForLoggedUser(
  loggedUserUid: string | undefined,
  loggedUserName: string | undefined,
  responsaveis: Responsavel[],
  identityExtras?: LoggedUserIdentityExtras | null,
): Set<string> {
  const hints = collectIdentityHints(loggedUserUid, loggedUserName, identityExtras);
  const ids = new Set<string>();
  for (const h of hints) ids.add(h);
  for (const r of responsaveis) {
    const rn = normStr(r.nome);
    if (!rn) continue;
    for (const h of hints) {
      if (rn === h) {
        ids.add(normStr(r.id));
        break;
      }
    }
  }
  return ids;
}

export function resolveResponsavelDisplay(
  responsaveis: Responsavel[],
  valueId: string,
): { id: string; nome: string } {
  const v = (valueId ?? '').trim();
  if (!v) return { id: '', nome: '' };
  const byId = responsaveis.find((r) => normStr(r.id) === normStr(v));
  if (byId) return { id: byId.id, nome: byId.nome };
  const byNome = responsaveis.find((r) => normStr(r.nome) === normStr(v));
  if (byNome) return { id: byNome.id, nome: byNome.nome };
  return { id: v, nome: v };
}

/**
 * Nome para exibir no Kanban / itens 5W2H quando `who` pode ser uid Firebase, id de responsável ou nome legado.
 * Se ainda estiver só o uid cru, tenta o perfil administrativo (`listAllUsers`).
 */
export function nomeExibicaoWhoParaItem(
  who: string,
  responsaveis: Responsavel[],
  perfisCadastro?: UserProfile[] | null,
): string {
  const w = (who ?? '').trim();
  if (!w) return '';
  const r = resolveResponsavelDisplay(responsaveis, w);
  if (r.nome && normStr(r.nome) !== normStr(w)) return r.nome;
  for (const u of perfisCadastro ?? []) {
    if (u.ativo === false) continue;
    if (normStr(u.uid) === normStr(w) && (u.nome ?? '').trim()) {
      return (u.nome ?? '').trim();
    }
  }
  for (const u of perfisCadastro ?? []) {
    if (u.ativo === false) continue;
    if (normStr(u.email) === normStr(w) && (u.nome ?? '').trim()) {
      return (u.nome ?? '').trim();
    }
  }
  const out = r.nome || w;
  if (normStr(out) === normStr(w) && looksLikeOpaqueUserId(w)) {
    return 'Usuário';
  }
  return out;
}

/** Mesmo cadastro (id ou nome legados que resolvem para o mesmo responsável). */
export function sameResponsavelReference(
  responsaveis: Responsavel[],
  a: string,
  b: string,
): boolean {
  const na = normStr(a);
  const nb = normStr(b);
  if (na === nb) return true;
  const ra = resolveResponsavelDisplay(responsaveis, a);
  const rb = resolveResponsavelDisplay(responsaveis, b);
  if (!ra.id || !rb.id) return false;
  return normStr(ra.id) === normStr(rb.id);
}

/** Prefixo no nome; se não houver, busca por substring (ex.: "will" → "Willy"). */
/**
 * O dono da prioridade pode estar como id, nome, uid ou texto legado tipo "A | B".
 * Diz se o usuário (conjunto de ids/nomes normalizados) deve ver a prioridade como dono.
 */
export function donoPrioridadeCorrespondeAoUsuario(
  donoId: string,
  myIds: Set<string>,
  responsaveis: Responsavel[],
): boolean {
  if (myIds.size === 0) return false;
  const d = (donoId ?? '').trim();
  if (!d) return false;
  const segments = d.includes('|')
    ? d.split('|').map((s) => s.trim()).filter(Boolean)
    : [d];
  for (const seg of segments) {
    if (myIds.has(normStr(seg))) return true;
    const r = resolveResponsavelDisplay(responsaveis, seg);
    if (r.id && myIds.has(normStr(r.id))) return true;
    if (r.nome && myIds.has(normStr(r.nome))) return true;
  }
  return false;
}

/** Nome(s) para exibir: resolve cada segmento "A | B" contra responsáveis e, se informado, perfis Firebase (uid → nome). */
export function displayNomeDonoPrioridade(
  donoId: string,
  responsaveis: Responsavel[],
  perfisCadastro?: UserProfile[] | null,
): string {
  const d = (donoId ?? '').trim();
  if (!d) return '';
  const segments = d.includes('|')
    ? d.split('|').map((s) => s.trim()).filter(Boolean)
    : [d];
  const names = segments.map((seg) => {
    const r = resolveResponsavelDisplay(responsaveis, seg);
    if (r.nome && normStr(r.nome) !== normStr(seg)) return r.nome;

    for (const u of perfisCadastro ?? []) {
      if (u.ativo === false) continue;
      if (normStr(u.uid) === normStr(seg) && (u.nome ?? '').trim()) {
        return (u.nome ?? '').trim();
      }
    }
    for (const u of perfisCadastro ?? []) {
      if (u.ativo === false) continue;
      if (normStr(u.email) === normStr(seg) && (u.nome ?? '').trim()) {
        return (u.nome ?? '').trim();
      }
    }

    const fallback = r.nome || seg;
    if (normStr(fallback) === normStr(seg) && looksLikeOpaqueUserId(seg)) {
      return seg.length > 10 ? `${seg.slice(0, 6)}…` : seg;
    }
    return fallback;
  });
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].join(' | ');
}

export function filterResponsaveisByPrefix(
  responsaveis: Responsavel[],
  query: string,
  limit = 12,
): Responsavel[] {
  const q = normStr(query);
  if (!q) return responsaveis.slice(0, limit);
  const byPrefix = responsaveis.filter((r) => normStr(r.nome).startsWith(q)).slice(0, limit);
  if (byPrefix.length > 0) return byPrefix;
  return responsaveis.filter((r) => normStr(r.nome).includes(q)).slice(0, limit);
}
