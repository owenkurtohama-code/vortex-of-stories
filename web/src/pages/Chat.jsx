import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';
import Avatar from '../components/Avatar.jsx';
import Riddles from '../components/Riddles.jsx';

// Community chat. Your own messages appear on the right. Closed riddles appear as reveal cards in time order.
export default function Chat() {
  const { user, profile, isVerified } = useSession();
  const [messages, setMessages] = useState(null);
  const [reveals, setReveals] = useState([]);
  const [body, setBody] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [limitHit, setLimitHit] = useState(false);

  async function load() {
    const { data: rows, error } = await supabase
      .from('main_chat_messages')
      .select('id, body, created_at, user_id')
      .eq('hidden', false)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setMessage({ type: 'error', text: 'Messages could not be loaded.' });
    } else {
      const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
      const people = {};
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, username, avatar_url').in('id', ids);
        (profiles ?? []).forEach((p) => { people[p.id] = p; });
      }
      setMessages((rows ?? []).map((r) => ({ ...r, person: people[r.user_id] ?? null })));
    }

    const { data: closed } = await supabase.from('riddles')
      .select('id, closed_at').eq('status', 'closed').not('closed_at', 'is', null)
      .order('closed_at', { ascending: false }).limit(20);
    const found = await Promise.all((closed ?? []).map(async (r) => {
      const { data } = await supabase.rpc('get_riddle_reveal', { p_riddle: r.id });
      return data ? { ...data, id: r.id, closed_at: r.closed_at } : null;
    }));
    setReveals(found.filter(Boolean));
  }

  useEffect(() => { load(); }, []);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('post_main_chat', { p_body: body.trim() });
    setBusy(false);
    if (error) {
      setMessage({ type: 'error', text: friendly(error) });
      if ((error.message ?? '').includes('daily_chat_limit_reached')) setLimitHit(true);
      return;
    }
    setBody('');
    setLimitHit(false);
    load();
  }

  async function buyExtra() {
    setMessage(null);
    setBusy(true);
    const { error } = await supabase.rpc('spend_coins', {
      p_kind: 'extra_message', p_request_key: crypto.randomUUID(),
    });
    setBusy(false);
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setLimitHit(false);
    setMessage({ type: 'ok', text: 'One extra message added for today. Send your message now.' });
  }

  async function report(id) {
    const reason = window.prompt('Why are you reporting this message? (3 to 1000 characters)');
    if (!reason) return;
    const { error } = await supabase.rpc('report_content', { p_type: 'chat_message', p_target: id, p_reason: reason });
    setMessage(error
      ? { type: 'error', text: friendly(error) }
      : { type: 'ok', text: 'Thank you. The report has been sent to the administrators.' });
  }

  const canPost = Boolean(user) && isVerified;
  const canBuyExtra = limitHit && canPost && profile?.role !== 'admin';

  // Messages and reveals in one timeline, oldest first.
  const feed = [
    ...(messages ?? []).map((m) => ({ kind: 'msg', at: m.created_at, key: `m-${m.id}`, data: m })),
    ...reveals.map((r) => ({ kind: 'reveal', at: r.closed_at, key: `r-${r.id}`, data: r })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  return (
    <section>
      <h1>Community chat</h1>
      <p className="muted">Main chat. Registered, verified members can send 10 messages per day (UTC). Guests can read.</p>

      <Riddles canAnswer={canPost} isAdmin={profile?.role === 'admin'} />

      {canPost ? (
        <form onSubmit={send} className="card">
          <label htmlFor="chat-body">Your message</label>
          <textarea id="chat-body" maxLength={1000} required value={body} onChange={(e) => setBody(e.target.value)} />
          <p><button type="submit" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button></p>
          {canBuyExtra && (
            <p>
              <button type="button" className="btn-secondary" onClick={buyExtra} disabled={busy}>
                Buy one extra message for today (5 coins)
              </button>
            </p>
          )}
        </form>
      ) : (
        <p className="card">
          {user
            ? 'Verify your email to post in the community chat.'
            : <>Read-only for guests. <a href="#/login">Sign in</a> to join the conversation.</>}
        </p>
      )}

      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}
      {messages === null && <p role="status">Loading messages…</p>}
      {messages?.length === 0 && reveals.length === 0 && <p className="muted">No messages yet.</p>}

      <div className="chat-list">
        {feed.map((item) => {
          if (item.kind === 'reveal') {
            const r = item.data;
            return (
              <div key={item.key} className="card reveal-card">
                <p className="riddle-label">Riddle closed · answer revealed</p>
                <p className="riddle-question">{r.question}</p>
                <p><strong>Accepted answers:</strong> {r.answers.join(', ')}</p>
                <ul className="reveal-list">
                  {r.entries.map((e, i) => (
                    <li key={i}>
                      <strong>{e.username}</strong>: {e.answer}{' '}
                      <span className={e.correct ? 'ok' : 'error'}>{e.correct ? '✓ correct' : '✗ not correct'}</span>
                    </li>
                  ))}
                </ul>
                {r.entries.length === 0 && <p className="muted">Nobody answered this riddle.</p>}
              </div>
            );
          }
          const m = item.data;
          const own = Boolean(user) && m.user_id === user.id;
          return (
            <div key={item.key} className={`chat-row${own ? ' own' : ''}`}>
              <Avatar url={m.person?.avatar_url} name={m.person?.username} size={32} />
              <div className="chat-bubble">
                <div className="chat-meta">
                  <strong>{own ? 'You' : (m.person?.username ?? 'Member')}</strong>
                  <span> · {new Date(m.created_at).toLocaleString()}</span>
                </div>
                <div className="chat-text">{m.body}</div>
                {user && !own && (
                  <button type="button" className="btn-small chat-report" onClick={() => report(m.id)}>Report</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
