import React from 'react';

type Props = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

/**
 * Ícone em grade (mesmo desenho do Lucide LayoutDashboard).
 * SVG local para o cabeçalho e métricas ficarem idênticos ao menu Estratégico,
 * sem depender de resolução de módulo / cache de bundle.
 */
export const EstrategicoGridIcon: React.FC<Props> = ({
  size = 18,
  className = '',
  strokeWidth = 2,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <rect width="7" height="9" x="3" y="3" rx="1" />
    <rect width="7" height="5" x="14" y="3" rx="1" />
    <rect width="7" height="9" x="14" y="12" rx="1" />
    <rect width="7" height="5" x="3" y="16" rx="1" />
  </svg>
);
