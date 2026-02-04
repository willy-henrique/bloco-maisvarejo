import { useState, useEffect, useCallback, useRef } from 'react';
import { ActionItem, ItemStatus, UrgencyLevel } from '../types';
import { StorageService } from '../services/storageService';
import { isFirebaseConfigured, subscribeBoard, saveBoardItems, getBoardDataOnce } from '../services/firestoreSync';

const INITIAL_ITEMS: ActionItem[] = [
  {
    id: '1',
    what: 'Homologação do Adaptive ERP com SuperConcentrador',
    why: 'Redução de erros operacionais e melhoria do churn rate',
    where: 'Frente de Loja / Retaguarda',
    when: '2026-02-13',
    who: 'Gustavo',
    how: 'Testes integrados de ponta a ponta e validação de fluxo',
    status: ItemStatus.EXECUTING,
    urgency: UrgencyLevel.CRITICAL,
    notes: 'Atenção especial à sincronização do SuperConcentrador.',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: '2',
    what: 'Capacitação e Sustentação de Equipe',
    why: 'Garantir autonomia do time e excelência no suporte',
    where: 'Auditório WillTech / Online',
    when: '2026-02-20',
    who: 'Grazi',
    how: 'Treinamento intensivo sobre novos módulos e processos',
    status: ItemStatus.ACTIVE,
    urgency: UrgencyLevel.HIGH,
    notes: 'Focar na reciclagem do time veterano.',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: '3',
    what: 'Upgrade de Infraestrutura e Redes',
    why: 'Estabilidade do ambiente cloud e performance de acesso',
    where: 'Datacenter / Cloud',
    when: '2026-03-05',
    who: 'LG',
    how: 'Migração de instâncias e otimização de largura de banda',
    status: ItemStatus.ACTIVE,
    urgency: UrgencyLevel.MEDIUM,
    notes: 'Agendar janela de manutenção noturna.',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

export function useStrategicBoard(encryptionKey: CryptoKey | null) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const persistItems = useCallback(async (encryptionKey: CryptoKey, newItems: ActionItem[]) => {
    await StorageService.saveItems(newItems, encryptionKey);
    if (isFirebaseConfigured) await saveBoardItems(newItems, encryptionKey);
  }, []);

  const fetchItems = useCallback(async () => {
    if (!encryptionKey) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await StorageService.getItems(encryptionKey);
      if (data.length === 0) {
        await StorageService.saveItems(INITIAL_ITEMS, encryptionKey);
        if (isFirebaseConfigured) await saveBoardItems(INITIAL_ITEMS, encryptionKey);
        setItems(INITIAL_ITEMS);
      } else {
        setItems(data);
      }
    } catch (err) {
      setError('Erro ao carregar dados estratégicos.');
    } finally {
      setLoading(false);
    }
  }, [encryptionKey]);

  useEffect(() => {
    if (!encryptionKey) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (isFirebaseConfigured) {
      let cancelled = false;
      (async () => {
        try {
          const remote = await getBoardDataOnce(encryptionKey);
          if (cancelled) return;
          if (remote && remote.items.length > 0) {
            setItems(remote.items);
          } else {
            const local = await StorageService.getItems(encryptionKey);
            if (local.length > 0) {
              setItems(local);
              await saveBoardItems(local, encryptionKey);
            } else {
              setItems(INITIAL_ITEMS);
              await persistItems(encryptionKey, INITIAL_ITEMS);
            }
          }
        } catch {
          const local = await StorageService.getItems(encryptionKey);
          if (local.length > 0) setItems(local);
          else setItems(INITIAL_ITEMS);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      const unsub = subscribeBoard(encryptionKey, (remoteItems) => {
        if (Array.isArray(remoteItems)) setItems(remoteItems);
      }, () => {});
      unsubRef.current = unsub ?? null;
      return () => {
        cancelled = true;
        if (unsubRef.current) unsubRef.current();
        unsubRef.current = null;
      };
    } else {
      fetchItems();
    }
  }, [encryptionKey, fetchItems, persistItems]);

  const addItem = async (newItem: Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!encryptionKey) return;
    const item: ActionItem = {
      ...newItem,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const updated = [item, ...items];
    setItems(updated);
    await persistItems(encryptionKey, updated);
  };

  const updateItem = async (id: string, updates: Partial<ActionItem>) => {
    if (!encryptionKey) return;
    const updated = items.map(item =>
      item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item
    );
    setItems(updated);
    await persistItems(encryptionKey, updated);
  };

  const deleteItem = async (id: string) => {
    if (!encryptionKey) return;
    const updated = items.filter(item => item.id !== id);
    setItems(updated);
    await persistItems(encryptionKey, updated);
  };

  const updateStatus = async (id: string, newStatus: ItemStatus) => {
    await updateItem(id, { status: newStatus });
  };

  return {
    items,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    updateStatus,
    refresh: fetchItems
  };
}
