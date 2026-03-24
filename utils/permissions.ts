import type { ViewId } from '../components/Layout/Sidebar';
import type { UserProfile } from '../types/user';
import { PERMISSIONS_SCHEMA_VERSION } from '../types/user';

/** Gerente sem lista de views no Firestore = comportamento antigo (todas as views). */
export function userHasViewAccess(profile: UserProfile | null | undefined, view: ViewId): boolean {
  if (!profile) return false;
  // Backlog sempre visível para qualquer usuário autenticado.
  if (view === 'backlog') return true;
  if (profile.role === 'administrador') return true;
  const views = Array.isArray(profile.views) ? profile.views : [];
  if (profile.role === 'gerente' && views.length === 0) return true;
  return views.includes(view);
}

/** Pode escolher outra pessoa como responsável da tarefa (Tático / Operacional). */
export function userCanAssignTarefasToOthers(
  profile: UserProfile | null | undefined,
  view: ViewId,
): boolean {
  if (!profile) return false;
  if (profile.role === 'administrador') return true;
  if (view !== 'table' && view !== 'operacional') return false;
  if (!userHasViewAccess(profile, view)) return false;

  const mp = profile.modulePermissions;
  if (mp == null || Object.keys(mp).length === 0) return true;

  const allowed = mp[view];
  if (allowed === undefined) return true;
  if (allowed.length === 0) return false;
  if (allowed.includes('tarefa_assign')) return true;

  const ver = profile.permissionsSchemaVersion ?? 1;
  if (ver < PERMISSIONS_SCHEMA_VERSION && allowed.includes('tarefa_write')) return true;
  return false;
}

/**
 * Ações granulares por módulo. Legado: sem `modulePermissions` = todas as ações nas views permitidas.
 * Se a view existir no mapa com array vazio: somente `read` (modo leitura).
 */
export function userHasModuleAction(
  profile: UserProfile | null | undefined,
  view: ViewId,
  actionId: string
): boolean {
  if (!profile) return false;
  if (profile.role === 'administrador') return true;
  if (actionId === 'tarefa_assign') {
    return userCanAssignTarefasToOthers(profile, view);
  }
  if (!userHasViewAccess(profile, view)) return false;

  const mp = profile.modulePermissions;
  if (mp == null || Object.keys(mp).length === 0) {
    return true;
  }

  const allowed = mp[view];
  if (allowed === undefined) {
    // Para Backlog com configuração nova de permissões, ausência de entrada
    // significa somente leitura até o admin definir ações explícitas.
    if (view === 'backlog') return actionId === 'read';
    return true;
  }
  if (allowed.length === 0) {
    return actionId === 'read';
  }
  return allowed.includes(actionId);
}
