import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';

// The only place where members are sent to the payment page. Verification is manual (see spec, section 8).
const KOFI_URL = 'https://ko-fi.com/s/3b87d440a9';

export default function Premium() {
  const { user, profile, premium, isVerified } = useSession();
  const [packages, setPackages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [orderRef, setOrderRef] = useState('');
  const [mine, setMine] = useState([]);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadMine() {
    if (!user) return;
    const { data } = await supabase
      .from('payment_submissions')
      .select('id, package_months, order_reference, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setMine(data ?? []);
  }

  useEffect(() => {
    supabase.from('premium_packages').select('months, price_usd').order('months')
      .then(({ data }) => setPackages(data ?? []));
  }, []);

  useEffect(() => { loadMine(); }, [user]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('submit_payment', {
      p_website_username: profile?.username ?? '',
      p_months: selected,
      p_order_reference: orderRef.trim(),
    });
    setBusy(false);
    if (error) {
      setMessage({ type: 'error', text: friendly(error) });
      return;
    }
    setMessage({ type: 'ok', text: 'Submitted. An administrator will check your order. Premium is not active until it is approved.' });
    setOrderRef('');
    loadMine();
  }

  return (
    <section>
      <h1>Premium</h1>
      <p className="muted">Premium adds expanded themes, Premium author notes and theory sections, and offline downloads of individual chapters.</p>
      {premium && <p className="card ok">You currently have Premium. Thank you for supporting Vortex of Stories.</p>}

      <h2>Choose a package</h2>
      <div className="grid">
        {packages.map((p) => (
          <button
            key={p.months}
            type="button"
            className={selected === p.months ? '' : 'btn-secondary'}
            aria-pressed={selected === p.months}
            onClick={() => setSelected(p.months)}
            style={{ padding: '1.25rem', textAlign: 'left' }}
          >
            <strong>{p.months} {p.months === 1 ? 'month' : 'months'}</strong>
            <div>${Number(p.price_usd).toFixed(2)} USD</div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2>Step 1: Pay on Ko-fi</h2>
          <p>After you pay, copy the Ko-fi order reference from your receipt or confirmation.</p>
          <a className="btn" href={KOFI_URL} target="_blank" rel="noopener noreferrer">
            Open the Ko-fi page (opens in a new tab)
          </a>

          <h2 style={{ marginTop: '1.5rem' }}>Step 2: Tell us your order</h2>
          {!user && <p className="error">Please <a href="#/login">sign in</a> first.</p>}
          {user && !isVerified && <p className="error">Verify your email before submitting an order.</p>}
          {user && isVerified && (
            <form onSubmit={submit}>
              <p className="muted">Website username: <strong>{profile?.username}</strong></p>
              <label htmlFor="order">Ko-fi order reference</label>
              <input id="order" required minLength={4} maxLength={100} value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)} />
              <p><button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit order for verification'}</button></p>
            </form>
          )}
          <p className="muted">Returning from Ko-fi does not activate Premium by itself. Premium starts only after an administrator verifies your order.</p>
        </div>
      )}

      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}

      {user && mine.length > 0 && (
        <section className="card" style={{ marginTop: '1.5rem' }}>
          <h2>Your orders</h2>
          <ul>
            {mine.map((o) => (
              <li key={o.id}>
                {o.package_months} months · ref {o.order_reference} · <span className="status">{o.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
