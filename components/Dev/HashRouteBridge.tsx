import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Converte URLs em formato "#/rota" para rotas reais do BrowserRouter.
 * Ex.: http://localhost:3000/#/willydev -> /willydev
 */
export function HashRouteBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const applyHashRoute = () => {
      const hash = window.location.hash ?? '';
      if (!hash.startsWith('#/')) return;
      const target = hash.slice(1);
      if (!target || target === location.pathname) return;
      navigate(target, { replace: true });
    };

    applyHashRoute();
    window.addEventListener('hashchange', applyHashRoute);
    return () => window.removeEventListener('hashchange', applyHashRoute);
  }, [navigate, location.pathname]);

  return null;
}
