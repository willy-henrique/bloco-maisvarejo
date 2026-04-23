import type { ExternalWorkspaceLink } from '../types/user';

function normalize(v: string): string {
  return v.trim().toLowerCase();
}

export function listActiveExternalLinksByWorkspace(
  links: ExternalWorkspaceLink[] | undefined,
  workspace: string
): ExternalWorkspaceLink[] {
  const target = normalize(workspace);
  if (!target) return [];
  return (links ?? []).filter((link) => {
    if (!link?.url?.trim()) return false;
    if (link.active === false) return false;
    return normalize(link.workspace ?? '') === target;
  });
}

export function resolvePrimaryExternalLinkForWorkspace(
  links: ExternalWorkspaceLink[] | undefined,
  workspace: string
): ExternalWorkspaceLink | null {
  const scoped = listActiveExternalLinksByWorkspace(links, workspace);
  if (scoped.length === 0) return null;
  return scoped.find((link) => link.isPrimary) ?? scoped[0];
}
