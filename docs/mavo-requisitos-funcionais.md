# Mavo Gestão - Requisitos Funcionais

## Objetivo
Garantir colaboração e visibilidade no Ritmo de Gestão Simplificado sem descaracterizar o modelo.

## Invariantes do Produto
- No nível estratégico, cada prioridade possui dono único.
- Máximo de 3 prioridades ativas por quadro.
- Tarefas não sobem para o quadro estratégico como itens de gestão.
- Propagação de bloqueio é obrigatória: tarefa bloqueada pode bloquear plano e prioridade.
- Observador acompanha, mas não substitui responsabilidade do dono.

## Cenários de Dor e Requisitos
### Cenario 1 - Delegação sem perda de acompanhamento
- Problema: ao delegar, o criador perde rastreabilidade.
- Requisito: criador entra automaticamente em `observadores`.
- Aceite:
  - ao criar prioridade/plano/tarefa, criador está em observadores;
  - delegar não remove visibilidade do criador.

### Cenario 2 - Bloqueio sem causa visível
- Problema: plano aparece bloqueado sem causa compreensível para quem visualiza parcialmente tarefas.
- Requisito: exibir causa raiz quando bloqueio vier de tarefa não visível.
- Aceite:
  - plano bloqueado mostra titulo da tarefa, responsavel e motivo;
  - usuário sem permissão continua sem editar tarefa de terceiros.

### Cenario 3 - Colaboração entre workspaces
- Problema: colaboração entre equipes de workspaces diferentes depende de intervenção manual.
- Requisito: suportar visualização e atribuição cross-workspace por permissão explícita.
- Aceite:
  - ações cross-workspace só aparecem com permissão;
  - origem e workspace atual são rastreados no registro.

## Regras de UX
- Tela principal mantém foco em "sou dono/responsável".
- Itens acompanhados aparecem com indicador "Acompanhando".
- Backlog segue como demanda potencial, não compromisso ativo.

## Não Objetivos
- Não transformar o Mavo em gerenciador genérico de tarefas.
- Não remover separação entre níveis estratégico, gerencial e operacional.

## Matriz de Testes Críticos
- Delegação com rastreabilidade:
  - criar item com `created_by = A`, delegar para B;
  - validar que A permanece em `observadores` e continua vendo o item.
- Bloqueio propagado com causa:
  - bloquear tarefa de C em plano de B;
  - validar plano/prioridade bloqueados e exibição de causa raiz para B.
- Permissão de escrita:
  - usuário observador sem ação de escrita tenta editar;
  - validar bloqueio de edição.
- Cross-workspace:
  - sem `cross_workspace_view`, item externo não aparece;
  - com `cross_workspace_view`, item aparece;
  - sem `cross_workspace_assign`, atribuição cruzada deve falhar.

## Rollout Recomendado
1. Ativar schema com `observadores` e normalização (sem alterar UX).
2. Ativar visibilidade por observador.
3. Ativar painel de causa raiz de bloqueio.
4. Ativar permissões `cross_workspace_*` para grupo piloto.
5. Expandir para produção após validação dos cenários críticos.
