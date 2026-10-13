import type { Category, DateStr } from '@kingtepad/shared';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { listCategories, listHolidays } from './db';
import { supabase } from './supabase';

interface AppState {
  session: Session | null;
  categories: Category[];
  holidays: ReadonlySet<DateStr>;
  categoryById: (id: string | null) => Category | undefined;
  reloadCategories: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider 밖에서 useApp 호출');
  return v;
}

export function AppProvider({ children }: { children: (ready: boolean, session: Session | null) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [holidays, setHolidays] = useState<ReadonlySet<DateStr>>(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const reloadCategories = async () => setCategories(await listCategories());

  useEffect(() => {
    if (!session) return;
    reloadCategories();
    listHolidays().then(setHolidays);
  }, [session?.user.id]);

  const value: AppState = {
    session,
    categories,
    holidays,
    categoryById: (id) => categories.find((c) => c.id === id),
    reloadCategories,
  };

  return <Ctx.Provider value={value}>{children(authReady, session)}</Ctx.Provider>;
}
