import { useRef, useCallback, useEffect } from 'react';
import type { Tab } from '../types/browser';
import {
  clearClosedTabsInStore,
  pushClosedTabsToStore,
  reopenClosedAt,
  setReopenHandler,
  useClosedTabsStack
} from '../services/closedTabsStore';

export interface UseClosedTabsOptions {
  /** Stack'ten pop'lanan sekmeyi geri açan tab-oluşturma callback'i (App.tsx'te kalır). */
  onReopen?: (tab: Tab) => void;
}

/**
 * Kapalı-sekme-geri-al (undo close) stack'i: App.tsx'ten birebir taşıma (pure code motion).
 *
 * - Stack state + LIFO sıra aynen korunur (push sona ekler, reopen sondan pop'lar).
 * - Cap/limit 50 ile sınırlıdır (MAX_CLOSED_TABS, closedTabsStore).
 * - Liste artık yeniden başlatmalar arasında saklanır (closedTabsStore.ts):
 *   gizli ve ajan sekmeleri diske yazılmaz, okunan her kayıt doğrulanır.
 * - Incognito sekmeler stack'e girmez (Chrome/Firefox parity: gizli sekmeler
 *   Ctrl+Shift+T ile geri açılmaz). Filtre tek yer olarak burada uygulanır,
 *   call-site guard'larına gerek yoktur.
 * - Boş `king://newtab` eleme filtresi hook'ta değil, push call-site'larında
 *   (`handleCloseTab` içindeki guard'lar) aynen durur.
 * - Tab oluşturma (`setTabs`/`setActiveTabId`/workspace switch/id-collision)
 *   hook'a taşınmadı; `onReopen` callback'i olarak App.tsx'ten alınır.
 * - Ref senkronizasyonu mutasyon anında eşzamanlı yapılır; hızlı çift Ctrl+Shift+T
 *   aynı sekmeyi iki kez açmaz.
 */
export function useClosedTabs({ onReopen }: UseClosedTabsOptions = {}) {
  // The list lives in closedTabsStore so it survives restarts and the tab
  // context menu can show and reopen it without prop drilling.
  const closedTabsStack = useClosedTabsStack() as Tab[];

  const onReopenRef = useRef(onReopen);
  useEffect(() => {
    onReopenRef.current = onReopen;
  }, [onReopen]);

  // One handler recreates a tab for both the shortcut and the menu entries.
  useEffect(() => {
    setReopenHandler(tab => onReopenRef.current?.(tab));
    return () => setReopenHandler(null);
  }, []);

  const pushClosedTab = useCallback((tab: Tab) => {
    if (tab.isIncognito) return;
    pushClosedTabsToStore([tab]);
  }, []);

  const pushClosedTabs = useCallback((tabs: Tab[]) => {
    pushClosedTabsToStore(tabs);
  }, []);

  const clearClosedTabs = useCallback(() => {
    clearClosedTabsInStore();
  }, []);

  // The store updates synchronously, so a fast double Ctrl+Shift+T cannot
  // reopen the same tab twice.
  const reopenLastClosed = useCallback(() => {
    reopenClosedAt(0);
  }, []);

  const reopenAt = useCallback((indexFromEnd: number) => {
    reopenClosedAt(indexFromEnd);
  }, []);

  return { closedTabsStack, pushClosedTab, pushClosedTabs, reopenLastClosed, reopenAt, clearClosedTabs };
}
