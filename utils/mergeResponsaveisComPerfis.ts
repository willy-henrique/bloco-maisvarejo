import type { Responsavel } from '../types';
import type { UserProfile } from '../types/user';

/**
 * Lista para atribuição (dono, WHO, tarefa): prioriza usuários do cadastro administrativo (Firebase),
 * mantém entradas legadas do board (ex.: r1, r2) que não sejam uid de perfil.
 */
export function mergeResponsaveisComPerfis(
  boardResponsaveis: Responsavel[],
  perfis: UserProfile[] | undefined | null,
): Responsavel[] {
  const map = new Map<string, Responsavel>();
  for (const u of perfis ?? []) {
    if (u.ativo === false) continue;
    const fromEmail = (u.email ?? '').split('@')[0]?.trim();
    const nome =
      (u.nome ?? '').trim() || fromEmail || 'Usuário';
    map.set(u.uid, { id: u.uid, nome: nome || u.uid });
  }
  for (const r of boardResponsaveis) {
    if (!r?.id) continue;
    if (!map.has(r.id)) {
      map.set(r.id, { id: r.id, nome: (r.nome ?? r.id).trim() || r.id });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
  );
}
