import type { ViewId } from '../components/Layout/Sidebar';
import type { ModulePermissionMap } from './modulePermissions';

export type UserRole = 'administrador' | 'gerente' | 'usuario';

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
  ativo: boolean;
  criadoEm: number;
  criadoPor: string;
}
