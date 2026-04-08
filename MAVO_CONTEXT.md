# MAVO_CONTEXT

## Invariantes de Dominio
1. `Prioridade.dono_id` é unico e obrigatório.
2. Máximo de 3 prioridades não concluídas.
3. `observadores` não altera ownership nem limites estratégicos.
4. Propagação de bloqueio:
   - se existe tarefa bloqueada no plano, plano = `Bloqueado`;
   - se existe plano bloqueado na prioridade, prioridade = `Bloqueado`.

## Entidades
### Prioridade
- Campos críticos: `id`, `dono_id`, `status_prioridade`, `observadores`, `workspace_id`, `workspace_origem`.

### PlanoDeAtaque
- Campos críticos: `id`, `prioridade_id`, `who_id`, `status_plano`, `observadores`, `workspace_id`, `workspace_origem`.

### Tarefa
- Campos críticos: `id`, `plano_id`, `responsavel_id`, `status_tarefa`, `bloqueio_motivo`, `bloqueada_em`, `observadores`, `workspace_id`, `workspace_origem`.

## Regras de Visibilidade
- Um item é visível se usuário:
  - é dono/responsável; ou
  - está em `observadores`.
- Usuário observador pode ler, mas não ganha escrita automaticamente.

## Regras de Permissão
- `cross_workspace_view`: permite visualizar colaboração entre workspaces.
- `cross_workspace_assign`: permite atribuição entre workspaces.
- Sem ação marcada no módulo: comportamento de leitura.

## Payloads Válidos
```json
{
  "dono_id": "uid_123",
  "observadores": ["uid_456"],
  "workspace_id": "Mais Varejo",
  "workspace_origem": "Auge"
}
```

## Payloads Inválidos
```json
{
  "dono_id": "",
  "observadores": ["uid_1", ""]
}
```
- `dono_id` vazio invalida prioridade.
- observadores vazios devem ser normalizados e removidos.
