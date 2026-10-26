import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';

const PRICE = 500;

// Lets a member spend coins on one month of Premium. Hidden for the administrator.
export default function CoinPremium() {
  const { user, profile, isVerified } = useSession();
  const [balance, setBalance] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !isVerified) return;
    supabase.rpc('coin_balance').then(({ data }) => setBalance(data ?? 0));
  }, [user, isVerified]);

  if (!user || !isVerified || profile?.role === 'admin') return null;

  async function buy() {
    if (!window.confirm(`Spend ${PRICE} coins on one month of Premium?`)) return;
    setMessage(null);
    setBusy(true);
    const { error } = await supabase.rpc('spend_coins', {
      p_kind: 'premium_month_purchase_coins',
      p_request_key: crypto.randomUUID(),
    });
    setBusy(false);
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setMessage({ type: 'ok', text: 'One month of Premium has been added to your account.' });
    const { data } = await supabase.rpc('coin_balance');
    setBalance(data ?? 0);
  }

  return (
    <section className="card">
      <h2>Buy Premium with coins</h2>
      <p className="muted">One month of Premium costs {PRICE} coins. Your balance: {balance ?? '…'} coins.</p>
      <button type="button" onClick={buy} disabled={busy || balance === null || balance < PRICE}>
        {busy ? 'Buying…' : `Buy one month for ${PRICE} coins`}
      </button>
      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}
    </section>
  );
}
