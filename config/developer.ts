export const DEVELOPER_EMAIL = 'willydev01@gmail.com';

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

export function isDeveloperEmail(email: string | null | undefined): boolean {
  return norm(email) === norm(DEVELOPER_EMAIL);
}
