import { useEffect, useState } from 'react';
import { subscribeToCollection, getDocument, setDocument } from '../lib/db';
import { AdminUser } from '../types';
import { safeSessionStorage, safeStorage } from './safeStorage';

export interface AdminPresence {
  id: string;
  name: string;
  role: string;
  username: string;
  lastSeen: number;
}

export interface VisitorPresence {
  sessionId: string;
  lastSeen: number;
}

function getVisitorSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  let sid = safeSessionStorage.getItem('qaem_visitor_sid');
  if (!sid) {
    sid = `visitor_${Math.random().toString(36).substring(2)}_${Date.now()}`;
    safeSessionStorage.setItem('qaem_visitor_sid', sid);
  }
  return sid;
}

export async function resetVisitorStats(): Promise<boolean> {
  try {
    await setDocument('siteStats', 'global', { totalCount: 0 });
    if (typeof window !== 'undefined') {
      safeSessionStorage.removeItem('qaem_total_counted');
      safeStorage.removeItem('qaem_total_visitors');
    }
    return true;
  } catch (err) {
    console.error('Error resetting visitor stats:', err);
    if (typeof window !== 'undefined') {
      safeStorage.setItem('qaem_total_visitors', '0');
      safeSessionStorage.removeItem('qaem_total_counted');
    }
    return true;
  }
}

export function useOnlinePresence(adminLoggedIn: boolean, currentAdminUser?: AdminUser | null) {
  const [activeAdmins, setActiveAdmins] = useState<AdminPresence[]>([]);
  const [onlineVisitorsCount, setOnlineVisitorsCount] = useState<number>(0);
  const [totalVisitorsCount, setTotalVisitorsCount] = useState<number>(0);

  // 1. Admin Presence Heartbeat & Subscription
  useEffect(() => {
    if (!adminLoggedIn || !currentAdminUser) return;
    const adminId = currentAdminUser.id;
    const adminData = {
      id: adminId,
      name: currentAdminUser.fullName || currentAdminUser.username || 'مشرف القافلة',
      role: currentAdminUser.role || 'مشرف إداري',
      username: currentAdminUser.username || 'admin',
      lastSeen: Date.now(),
    };

    setDocument('adminPresences', adminId, adminData).catch(() => {});

    const interval = setInterval(() => {
      setDocument('adminPresences', adminId, { ...adminData, lastSeen: Date.now() }).catch(() => {});
    }, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [adminLoggedIn, currentAdminUser]);

  useEffect(() => {
    const unsubscribe = subscribeToCollection<AdminPresence>('adminPresences', (list) => {
      const now = Date.now();
      const active = (list || []).filter((item) => item && item.lastSeen && now - item.lastSeen < 60000);
      setActiveAdmins(active);
    });
    return () => unsubscribe();
  }, []);

  // 2. Visitor Online Heartbeat & Subscription
  useEffect(() => {
    const sessionId = getVisitorSessionId();
    const updateVisitorHeartbeat = () => {
      setDocument('onlineVisitors', sessionId, { sessionId, lastSeen: Date.now() }).catch(() => {});
    };

    updateVisitorHeartbeat();
    const interval = setInterval(updateVisitorHeartbeat, 20000);

    const unsubscribeVisitors = subscribeToCollection<VisitorPresence>('onlineVisitors', (list) => {
      const now = Date.now();
      const active = (list || []).filter((item) => item && item.lastSeen && now - item.lastSeen < 50000);
      setOnlineVisitorsCount(Math.max(0, active.length));
    });

    // 3. Total Visitors Counter in Firestore (siteStats/global)
    const countTotalVisitor = async () => {
      try {
        const statsDoc = await getDocument<{ totalCount: number }>('siteStats', 'global');
        let currentTotal = typeof statsDoc?.totalCount === 'number' ? statsDoc.totalCount : 0;
        const hasCounted = safeSessionStorage.getItem('qaem_total_counted');
        if (!hasCounted) {
          currentTotal += 1;
          await setDocument('siteStats', 'global', { totalCount: currentTotal });
          safeSessionStorage.setItem('qaem_total_counted', 'true');
        }
        setTotalVisitorsCount(currentTotal);
      } catch {
        let localTotal = 0;
        const cached = safeStorage.getItem('qaem_total_visitors');
        if (cached) localTotal = parseInt(cached, 10) || 0;
        if (!safeSessionStorage.getItem('qaem_total_counted')) {
          localTotal += 1;
          safeStorage.setItem('qaem_total_visitors', String(localTotal));
          safeSessionStorage.setItem('qaem_total_counted', 'true');
        }
        setTotalVisitorsCount(localTotal);
      }
    };

    countTotalVisitor();

    return () => {
      clearInterval(interval);
      unsubscribeVisitors();
    };
  }, []);

  return {
    activeAdmins,
    onlineVisitorsCount,
    totalVisitorsCount,
  };
}
