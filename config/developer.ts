export const DEVELOPER_EMAIL = 'willydev01@gmail.com';

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

export function isDeveloperEmail(email: string | null | undefined): boolean {
  return norm(email) === norm(DEVELOPER_EMAIL);
}

export function isDeveloperName(nome: string | null | undefined): boolean {
  return norm(nome) === 'willy dev';
}

export function isDeveloperProfile(profile: {
  email?: string | null;
  nome?: string | null;
} | null | undefined): boolean {
  if (!profile) return false;
  return isDeveloperEmail(profile.email) || isDeveloperName(profile.nome);
}
