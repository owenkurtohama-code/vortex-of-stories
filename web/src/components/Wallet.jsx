import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';

const LABELS = {
  welcome_bonus: 'Welcome bonus',
  welcome_reversal: 'Welcome bonus reversed',
  daily_login: 'Daily reward',
  extra_message: 'Extra chat message',
  premium_month_purchase_coins: 'Premium month bought with coins',
  profile_picture: 'Profile picture',
  riddle_correct: 'Riddle answer',
};

// The member's coin balance, daily reward and recent activity. Hidden for the administrator.
export default function Wallet() {
  const { user, profile, isVerified } = useSession();
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [daily, setDaily] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user || !isVerified) return;
    const [b, h, d] = await Promise.all([
      supabase.rpc('coin_balance'),
      supabase.from('coin_ledger').select('id, delta, kind, created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(25),
      supabase.rpc('daily_login_status'),
    ]);
    setBalance(b.data ?? 0);
    setHistory(h.data ?? []);
    setDaily(d.data ?? null);
  }, [user, isVerified]);

  useEffect(() => { load(); }, [load]);

  if (!user || profile?.role === 'admin') return null;

  if (!isVerified) {
    return (
      <section className="card">
        <h2>Your coins</h2>
        <p className="muted">Verify your email to receive and spend coins.</p>
      </section>
    );
  }

  async function claim() {
    setMessage(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('claim_daily_login');
    setBusy(false);
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setMessage(data?.claimed
      ? { type: 'ok', text: `You received ${data.coins} coins.` }
      : { type: 'error', text: 'The daily reward is not ready yet.' });
    load();
  }

  const nextText = daily?.next_at ? new Date(daily.next_at).toLocaleString() : '';

  return (
    <section className="card">
      <h2>Your coins</h2>
      <p className="coin-balance">{balance ?? '…'} <span className="muted" style={{ fontSize: '1rem' }}>coins</span></p>

      <div className="action-row">
        <button type="button" onClick={claim} disabled={busy || !daily?.can_claim}>
          {daily?.can_claim ? `Claim daily reward (+${daily.coins})` : `Next daily reward: ${nextText}`}
        </button>
      </div>
      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}

      <h3>Recent activity</h3>
      {history.length === 0 && <p className="muted">No coin activity yet.</p>}
      <ul>
        {history.map((h) => (
          <li key={h.id} style={{ margin: '.3rem 0' }}>
            {LABELS[h.kind] ?? h.kind}{' '}
            <span className={h.delta > 0 ? 'ok' : 'error'}>{h.delta > 0 ? `+${h.delta}` : h.delta}</span>{' '}
            <span className="muted">· {new Date(h.created_at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
