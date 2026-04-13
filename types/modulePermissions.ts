import type { ViewId } from '../components/Layout/Sidebar';

/**
 * Mapa: view → lista de IDs de ação permitidos.
 * Perfis legados sem este campo = todas as ações nas views que possuem.
 */
export type ModulePermissionMap = Partial<Record<ViewId, string[]>>;

/** Ações disponíveis por módulo (IDs estáveis para Firestore). */
export const MODULE_ACTIONS: Record<ViewId, { id: string; label: string }[]> = {
  backlog: [
    { id: 'read', label: 'Visualizar' },
    { id: 'create', label: 'Criar itens' },
    { id: 'edit', label: 'Editar detalhes' },
    { id: 'delete', label: 'Excluir' },
    { id: 'workflow', label: 'Priorizar, arquivar e status' },
  ],
  dashboard: [
    { id: 'read', label: 'Visualizar' },
    { id: 'create', label: 'Criar no quadro' },
    { id: 'edit', label: 'Editar detalhes' },
    { id: 'delete', label: 'Excluir' },
    { id: 'workflow', label: 'Mover colunas e arquivar' },
    { id: 'link_tatico', label: 'Abrir no Tático' },
  ],
  table: [
    { id: 'read', label: 'Visualizar' },
    { id: 'prioridade_write', label: 'Criar/editar prioridades (incl. arquivar)' },
    { id: 'plano_write', label: 'Criar/editar planos 5W2H' },
    { id: 'plano_delete', label: 'Excluir planos' },
    {
      id: 'ver_todos_planos',
      label: 'Ver todos os planos de ataque (visão da equipe)',
    },
    { id: 'tarefa_write', label: 'Criar/editar tarefas' },
    {
      id: 'tarefa_assign',
      label: 'Atribuir tarefas a outras pessoas',
    },
    { id: 'tarefa_delete', label: 'Excluir tarefas' },
    { id: 'observer_edit', label: 'Adicionar/remover observadores' },
    {
      id: 'cross_workspace_view',
      label: 'Visualizar itens compartilhados entre workspaces',
    },
    {
      id: 'cross_workspace_assign',
      label: 'Atribuir entre workspaces',
    },
  ],
  operacional: [
    { id: 'read', label: 'Visualizar' },
    { id: 'tarefa_write', label: 'Criar/editar tarefas' },
    {
      id: 'tarefa_assign',
      label: 'Atribuir tarefas a outras pessoas',
    },
    { id: 'tarefa_delete', label: 'Excluir tarefas' },
    { id: 'observer_edit', label: 'Adicionar/remover observadores' },
    {
      id: 'cross_workspace_view',
      label: 'Visualizar itens compartilhados entre workspaces',
    },
    {
      id: 'cross_workspace_assign',
      label: 'Atribuir entre workspaces',
    },
  ],
  performance: [{ id: 'read', label: 'Visualizar' }],
  roadmap: [
    { id: 'read', label: 'Visualizar' },
    { id: 'edit', label: 'Abrir/editar iniciativa' },
  ],
  ia: [
    { id: 'read', label: 'Visualizar' },
    { id: 'send', label: 'Enviar mensagens' },
  ],
  workspace: [{ id: 'read', label: 'Visualizar' }],
};

/** Opções de view no formulário admin (sem Workspace — só administrador). */
export const ADMIN_SELECTABLE_VIEWS: { id: ViewId; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'dashboard', label: 'Estratégico' },
  { id: 'table', label: 'Tático' },
  { id: 'operacional', label: 'Operacional' },
  { id: 'performance', label: 'Desempenho' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'ia', label: '5W2H CHAT' },
];

export function allActionIdsForView(view: ViewId): string[] {
  return (MODULE_ACTIONS[view] ?? []).map((a) => a.id);
}

export function defaultModulePermissionsForViews(views: ViewId[]): ModulePermissionMap {
  const m: ModulePermissionMap = {};
  for (const v of views) {
    m[v] = allActionIdsForView(v);
  }
  return m;
}
