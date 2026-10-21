import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [premium, setPremium] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadAccount(sessionUser) {
    if (!sessionUser) {
      setProfile(null);
      setPremium(false);
      return;
    }
    const { data: p } = await supabase
      .from('profiles')
            .select('id, username, display_name, bio, role, suspended, email_verified_at, avatar_url')
      .eq('id', sessionUser.id)
      .maybeSingle();
    setProfile(p ?? null);
    const { data: hasPremium } = await supabase.rpc('has_premium');
    setPremium(Boolean(hasPremium));
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null;
      if (!active) return;
      setUser(u);
      await loadAccount(u);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setUser(session?.user ?? null);
      await loadAccount(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = {
    user,
    profile,
    premium,
    loading,
    recovering,
    setRecovering,
    isVerified: Boolean(profile?.email_verified_at),
    refreshAccount: () => loadAccount(user),
    signOut: () => supabase.auth.signOut(),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
