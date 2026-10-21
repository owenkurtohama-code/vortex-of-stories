import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. See docs/03_SETUP_STEPS.md.');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',          // required so password-reset links work with the hash-based router
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
