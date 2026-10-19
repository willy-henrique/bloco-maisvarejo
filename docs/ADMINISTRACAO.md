# Documentação de Administração — Bloco Mais Varejo

**Versão:** 1.0  
**Atualizado em:** 2026-05-19  
**Audience:** Administradores e responsáveis técnicos pelo sistema

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Perfis de Usuário](#2-perfis-de-usuário)
3. [Views e Módulos do Sistema](#3-views-e-módulos-do-sistema)
4. [Permissões por Perfil](#4-permissões-por-perfil)
5. [Acesso por Empresa / Workspace](#5-acesso-por-empresa--workspace)
6. [Status Ativo / Inativo](#6-status-ativo--inativo)
7. [Schema de Permissões Granulares](#7-schema-de-permissões-granulares)
8. [Fluxo de Autenticação e Autorização](#8-fluxo-de-autenticação-e-autorização)
9. [Referência Técnica](#9-referência-técnica)

---

## 1. Visão Geral

O sistema de administração do Bloco Mais Varejo é baseado em três eixos de controle:

| Eixo | O que controla |
|---|---|
| **Perfil (role)** | Nível de acesso geral do usuário |
| **Views** | Quais módulos/telas o usuário pode acessar |
| **Empresas** | Quais workspaces/empresas o usuário visualiza |

Cada usuário possui um registro no Firestore com os campos que definem esses três eixos. Toda verificação de permissão parte desse registro.

---

## 2. Perfis de Usuário

Existem três perfis (`role`) no sistema:

```
'administrador' | 'gerente' | 'usuario'
```

### 2.1 Usuário (Técnico de Suporte)

Perfil de acesso básico, destinado a técnicos e colaboradores operacionais.

**Características:**
- Acesso restrito às views explicitamente atribuídas no cadastro
- Visualiza apenas itens que são de sua responsabilidade, que criou ou que acompanha como observador
- Não pode visualizar itens de outros usuários fora de seu escopo
- Status deve ser `ativo: true` para conseguir autenticar

**Views padrão:** Backlog e Operacional

**Ações disponíveis — Backlog:**
- Visualizar itens
- Criar itens

**Ações disponíveis — Operacional:**
- Visualizar tarefas
- Criar e editar tarefas
- Atribuir tarefas a outras pessoas
- Adicionar e remover observadores

---

### 2.2 Gerente / Líder

Perfil intermediário com acesso expandido, destinado a gerentes de loja, líderes de equipe e coordenadores.

**Características:**
- Acesso a todas as views listadas no cadastro
- No módulo Estratégico, é tratado como admin interno: visualiza todos os itens da equipe
- No módulo Operacional, segue o filtro padrão (por responsabilidade/criação/observação)
- Pode gerenciar dados de workspace (empresa e vínculo entre workspaces)
- Não acessa o painel de administração de usuários

**Views padrão:** Backlog, Estratégico, Tático, Operacional e Desempenho

**Ações disponíveis — Backlog:**
- Visualizar e criar itens
- Editar detalhes
- Alterar empresa e workspaces

**Ações disponíveis — Tático (5W2H):**
- Criar e editar prioridades (inclusive arquivar)
- Criar e editar planos 5W2H
- Visualizar todos os planos de ataque da equipe
- Criar, editar e excluir tarefas
- Atribuir tarefas a outras pessoas
- Adicionar e remover observadores
- Visualizar e atribuir itens entre workspaces

**Ações disponíveis — Operacional:**
- Visualizar e criar/editar tarefas
- Atribuir tarefas a outras pessoas
- Adicionar e remover observadores
- Visualizar e atribuir itens entre workspaces

---

### 2.3 Administrador (Workspace Específico)

Perfil administrativo com escopo limitado a um ou mais workspaces determinados.

**Características:**
- Acesso a todas as views do sistema
- Visualiza e gerencia apenas os workspaces/empresas atribuídos no cadastro
- Acesso total dentro do seu escopo: sem restrição de criação, edição ou visualização
- É bloqueado imediatamente quando desligado da empresa (campo `ativo`)
- Pode acessar o painel de administração de usuários

**Empresas:** Somente as listadas no campo `empresas` do cadastro

---

### 2.4 Administrador Geral

Perfil de acesso irrestrito, destinado exclusivamente a responsáveis técnicos da plataforma.

**Características:**
- Acesso a **todas** as views, ações e dados do sistema
- Visualiza **todas** as empresas e workspaces sem restrição
- Ignora qualquer filtro de visibilidade de itens (vê tudo)
- Nenhuma ação está bloqueada
- Identificado por `role: 'administrador'` com `empresas: ['*']` ou array vazio

> **Atenção:** Este perfil não deve ser concedido a usuários de negócio. É destinado exclusivamente a administradores técnicos com responsabilidade total sobre a plataforma.

---

## 3. Views e Módulos do Sistema

| ViewId | Nome exibido | Descrição |
|---|---|---|
| `workspace` | Workspace | Gerenciamento de espaços de trabalho |
| `dashboard` | Estratégico | Painel estratégico, OKRs e visão de equipe |
| `table` | Tático (5W2H) | Planos de ação, prioridades e gerencial |
| `backlog` | Backlog | Fila de demandas e itens pendentes |
| `performance` | Desempenho | Indicadores e métricas de performance |
| `roadmap` | Roadmap | Planejamento de longo prazo |
| `operacional` | Operacional | Gestão de tarefas operacionais do dia a dia |
| `agenda` | Agenda | Agenda pessoal do usuário |
| `chat` | Chat | Comunicação interna da equipe |

> O Backlog é sempre acessível para qualquer usuário autenticado, independente da configuração de views.

---

## 4. Permissões por Perfil

### Matriz de Acesso por View

| View | Usuário | Gerente | Administrador | Admin Geral |
|---|---|---|---|---|
| Workspace | — | Leitura | Total | Total |
| Estratégico | — | Total (vê todos) | Total | Total |
| Tático | — | Total | Total | Total |
| Backlog | Leitura / Criar | Total | Total | Total |
| Desempenho | — | Leitura | Total | Total |
| Roadmap | — | Leitura | Total | Total |
| Operacional | Parcial¹ | Total | Total | Total |
| Agenda | Leitura | Leitura | Total | Total |
| Chat | Leitura | Leitura | Total | Total |

¹ Parcial = criar/editar tarefas próprias, atribuir, gerenciar observadores.

---

### Ações Granulares Disponíveis

As ações são controladas por `modulePermissions` no cadastro de cada usuário. A tabela abaixo lista as ações possíveis por módulo:

**Backlog**

| Ação | Descrição |
|---|---|
| `read` | Visualizar itens |
| `create` | Criar novos itens |
| `edit` | Editar itens existentes |
| `workspace_edit` | Alterar empresa / vínculo de workspace |
| `delete` | Excluir itens |
| `workflow` | Alterar status / fluxo do item |

**Estratégico (dashboard)**

| Ação | Descrição |
|---|---|
| `read` | Visualizar |
| `create` | Criar |
| `edit` | Editar |
| `workspace_edit` | Alterar workspace |
| `delete` | Excluir |
| `workflow` | Alterar fluxo |
| `link_tatico` | Vincular ao módulo tático |

**Tático / 5W2H (table)**

| Ação | Descrição |
|---|---|
| `read` | Visualizar |
| `prioridade_write` | Criar e editar prioridades |
| `plano_write` | Criar e editar planos |
| `plano_delete` | Excluir planos |
| `ver_todos_planos` | Ver todos os planos da equipe |
| `tarefa_write` | Criar e editar tarefas |
| `tarefa_assign` | Atribuir tarefas a outras pessoas |
| `tarefa_delete` | Excluir tarefas |
| `observer_edit` | Gerenciar observadores |
| `cross_workspace_view` | Visualizar itens de outros workspaces |
| `cross_workspace_assign` | Atribuir entre workspaces |

**Operacional**

| Ação | Descrição |
|---|---|
| `read` | Visualizar |
| `tarefa_write` | Criar e editar tarefas |
| `tarefa_assign` | Atribuir tarefas a outras pessoas |
| `tarefa_delete` | Excluir tarefas |
| `observer_edit` | Gerenciar observadores |
| `cross_workspace_view` | Visualizar itens de outros workspaces |
| `cross_workspace_assign` | Atribuir entre workspaces |

---

## 5. Acesso por Empresa / Workspace

Cada usuário possui o campo `empresas: string[]` em seu cadastro, que define quais workspaces ele pode visualizar e operar.

### Regras de Acesso

| Condição | Resultado |
|---|---|
| `empresas` contém `'*'` | Acesso a todas as empresas |
| `empresas` contém `'todas'` | Acesso a todas as empresas |
| `role === 'administrador'` com `empresas: []` | Acesso a todas as empresas |
| Empresa listada em `empresas[]` | Acesso somente àquela empresa |

### Comportamento de Bloqueio

Quando um usuário é desligado de uma empresa:
1. Remover a empresa do campo `empresas[]` do cadastro
2. O usuário perde imediatamente o acesso aos dados daquele workspace
3. Se `empresas` ficar vazio e o perfil não for `administrador`, o usuário não visualiza nenhum workspace

---

## 6. Status Ativo / Inativo

O campo `ativo: boolean` controla se o usuário pode acessar o sistema.

### Regras

| Status | Comportamento |
|---|---|
| `ativo: true` | Autenticação permitida normalmente |
| `ativo: false` | Login bloqueado; sessão encerrada automaticamente |

### Quando definir como inativo

- Desligamento imediato: setar `ativo: false` bloqueia o acesso na próxima tentativa de login
- Para casos de afastamento temporário, prefer `ativo: false` ao invés de remover o cadastro, preservando o histórico

### Efeitos colaterais do status inativo

- O usuário é removido de dropdowns de responsável e dono em toda a plataforma
- Seu nome não aparece nas listagens de usuários ativos
- Não é possível atribuir novos itens a um usuário inativo

---

## 7. Schema de Permissões Granulares

O sistema utiliza um campo `permissionsSchemaVersion` para controlar compatibilidade com cadastros legados.

| Versão | Comportamento |
|---|---|
| Não definida / `1` | Legado: sem verificação de ações granulares. Usuários têm acesso total às views atribuídas, exceto Backlog (somente leitura) |
| `2` | Transição: verificações granulares ativas, mas com fallback para `tarefa_write` em ações de observador |
| `3` (atual) | Verificação explícita de cada ação. Ações não listadas em `modulePermissions` são bloqueadas |

> **Recomendação:** Todos os novos cadastros devem utilizar `permissionsSchemaVersion: 3` com `modulePermissions` explícito para cada view atribuída.

---

## 8. Fluxo de Autenticação e Autorização

```
[1] Usuário faz login (email + senha)
         │
         ▼
[2] Firebase Authentication valida credenciais
         │
         ▼
[3] Sistema carrega UserProfile do Firestore
         │
         ├─ profile.ativo === false? → logout + erro "Conta desativada"
         │
         ▼
[4] UserContext disponibiliza perfil e helpers:
    - hasView(viewId)
    - hasModuleAction(viewId, actionId)
    - hasEmpresa(empresa)
         │
         ▼
[5] Cada view verifica acesso:
    - Admin? → acesso total, sem filtros
    - Gerente? → acesso às views atribuídas; vê todos os itens no Estratégico
    - Usuário? → acesso às views atribuídas; filtra por responsabilidade/criação/observação
         │
         ▼
[6] Filtro de visibilidade de itens:
    - seesAllPrioridades (admin) → exibe tudo
    - Caso contrário → exibe somente itens:
        • criados pelo usuário
        • atribuídos ao usuário como responsável
        • onde o usuário é observador
```

---

## 9. Referência Técnica

### Arquivos-chave

| Responsabilidade | Arquivo |
|---|---|
| Tipos de role e UserProfile | `types/user.ts` |
| Tipos de ViewId e módulos | `components/Layout/Sidebar.tsx` |
| Ações de módulo (ModulePermissionMap) | `types/modulePermissions.ts` |
| Funções de verificação de permissão | `utils/permissions.ts` |
| Contexto de usuário e helpers | `contexts/UserContext.tsx` |
| Filtro de visibilidade — Operacional | `components/Dashboard/OperacionalView.tsx` |
| Filtro de visibilidade — Estratégico | `components/Dashboard/EstrategicoView.tsx` |
| Utilitário de matching de responsável | `components/Dashboard/responsavelSearchUtils.ts` |
| Guarda de rota admin | `routes/AdminRoute.tsx` |

### Estrutura do UserProfile (Firestore)

```typescript
{
  uid: string;                          // Firebase UID (chave primária)
  email: string;                        // E-mail do usuário
  nome: string;                         // Nome de exibição
  role: 'administrador' | 'gerente' | 'usuario';
  views: ViewId[];                      // Views permitidas
  modulePermissions?: {                 // Ações por view (opcional, veja schema)
    [viewId: string]: string[];
  };
  permissionsSchemaVersion?: number;   // Versão do schema (padrão: 1)
  empresas: string[];                  // Workspaces permitidos
  ativo: boolean;                      // true = ativo, false = bloqueado
  criadoEm: number;                    // Timestamp de criação
  criadoPor: string;                   // UID de quem criou
}
```

### Exemplos de Configuração

**Usuário operacional (acesso mínimo):**
```json
{
  "role": "usuario",
  "views": ["backlog", "operacional"],
  "modulePermissions": {
    "backlog": ["read", "create"],
    "operacional": ["read", "tarefa_write", "tarefa_assign", "observer_edit"]
  },
  "permissionsSchemaVersion": 3,
  "empresas": ["Mais Varejo"],
  "ativo": true
}
```

**Gerente com acesso tático completo:**
```json
{
  "role": "gerente",
  "views": ["backlog", "dashboard", "table", "operacional", "performance"],
  "modulePermissions": {
    "backlog": ["read", "create", "edit", "workspace_edit"],
    "dashboard": ["read", "create", "edit"],
    "table": ["read", "prioridade_write", "plano_write", "ver_todos_planos", "tarefa_write", "tarefa_assign", "tarefa_delete", "observer_edit", "cross_workspace_view", "cross_workspace_assign"],
    "operacional": ["read", "tarefa_write", "tarefa_assign", "tarefa_delete", "observer_edit", "cross_workspace_view", "cross_workspace_assign"],
    "performance": ["read"]
  },
  "permissionsSchemaVersion": 3,
  "empresas": ["Mais Varejo"],
  "ativo": true
}
```

**Administrador de workspace específico:**
```json
{
  "role": "administrador",
  "views": [],
  "modulePermissions": {},
  "permissionsSchemaVersion": 3,
  "empresas": ["Mais Varejo", "Auge"],
  "ativo": true
}
```

**Administrador Geral:**
```json
{
  "role": "administrador",
  "views": [],
  "modulePermissions": {},
  "permissionsSchemaVersion": 3,
  "empresas": ["*"],
  "ativo": true
}
```

---

*Documentação gerada com base na implementação atual do sistema. Manter atualizada a cada alteração no modelo de permissões.*
