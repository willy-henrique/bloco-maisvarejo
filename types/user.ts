import type { ViewId } from '../components/Layout/Sidebar';
import type { ModulePermissionMap } from './modulePermissions';

export type UserRole = 'administrador' | 'gerente' | 'usuario';
export type ExternalWorkspaceLinkKind = 'drive' | 'docs' | 'sheet' | 'other';

export interface ExternalWorkspaceLink {
  id: string;
  workspace: string;
  label: string;
  url: string;
  kind?: ExternalWorkspaceLinkKind;
  isPrimary?: boolean;
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/** A partir de 3, `observer_edit` é avaliado explicitamente por módulo. */
export const PERMISSIONS_SCHEMA_VERSION = 3;

export interface UserProfile {
  uid: string;
  email: string;
  nome: string;
  role: UserRole;
  views: ViewId[];
  /** Permissões por módulo (gerente/usuário). Legado: ausente = todas as ações. */
  modulePermissions?: ModulePermissionMap;
  /** Versão do esquema de permissões (Firestore). */
  permissionsSchemaVersion?: number;
  empresas: string[];
  externalWorkspaceLinks?: ExternalWorkspaceLink[];
  ativo: boolean;
  criadoEm: number;
  criadoPor: string;
}
