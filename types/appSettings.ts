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
  /**
   * Quando true: permite alterar manualmente a empresa/workspace no modal de Backlog.
   * Quando false: a empresa do Backlog é definida automaticamente pelo workspace ativo.
   */
  backlogPermiteAlterarEmpresa: boolean;
  /**
   * Quando true: permite alterar manualmente a data no modal de Backlog.
   * Quando false: a data fica bloqueada no Backlog, usando o valor padrão do sistema.
   */
  backlogPermiteAlterarData: boolean;
  /**
   * Quando true: usuários podem alterar o prazo (data de vencimento) das tarefas no Tático.
   * Quando false: o campo prazo fica somente leitura.
   */
  tarefaPermiteAlterarData: boolean;
}
