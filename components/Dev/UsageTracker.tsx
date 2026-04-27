import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../../contexts/UserContext';
import { trackUsageHeartbeat } from '../../services/devAnalytics';

export function UsageTracker() {
  const { isAuthenticated, profile } = useUser();
  const location = useLocation();
  const lastPathRef = useRef<string>('');

  useEffect(() => {
    if (!isAuthenticated || !profile?.uid) return;
    const path = `${location.pathname}${location.search}`;
    const isPageView = path !== lastPathRef.current;
    lastPathRef.current = path;

    const send = () =>
      trackUsageHeartbeat({
        uid: profile.uid,
        nome: profile.nome ?? '',
        path,
        pageView: isPageView,
      });

    void send();
    const id = window.setInterval(() => {
      void trackUsageHeartbeat({
        uid: profile.uid,
        nome: profile.nome ?? '',
        path: `${window.location.pathname}${window.location.search}`,
      });
    }, 30000);

    return () => window.clearInterval(id);
  }, [isAuthenticated, profile?.uid, profile?.nome, location.pathname, location.search]);

  return null;
}
