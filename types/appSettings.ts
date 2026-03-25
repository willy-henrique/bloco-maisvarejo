/**
 * Configurações da aplicação persistidas no Firestore (`appSettings/config`).
 * Editável no Painel Administrativo.
 */
export interface AppSettings {
  /**
   * Quando true: no Kanban Estratégico, usuários que não são administrador só veem
   * cartões cujo campo WHO (`item.who`) corresponde ao usuário logado.
   * Administrador continua vendo todas as iniciativas do workspace.
   */
  estrategicoFiltrarKanbanPorWho: boolean;
}
