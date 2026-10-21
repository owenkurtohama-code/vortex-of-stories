import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';

export default function Chat() {
  const { user, isVerified } = useSession();
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from('main_chat_messages')
      .select('id, body, created_at, profiles(username)')
      .eq('hidden', false)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) setMessage({ type: 'error', text: 'Messages could not be loaded.' });
    else setMessages(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('post_main_chat', { p_body: body.trim() });
    setBusy(false);
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setBody('');
    load();
  }

  async function report(id) {
    const reason = window.prompt('Why are you reporting this message? (3 to 1000 characters)');
    if (!reason) return;
    const { error } = await supabase.rpc('report_content', { p_type: 'chat_message', p_target: id, p_reason: reason });
    setMessage(error
      ? { type: 'error', text: friendly(error) }
      : { type: 'ok', text: 'Thank you. The report has been sent to the administrators.' });
  }

  return (
    <section>
      <h1>Community chat</h1>
      <p className="muted">Main chat. Registered, verified members can send 10 messages per day (UTC). Guests can read.</p>

      {user && isVerified ? (
        <form onSubmit={send} className="card">
          <label htmlFor="chat-body">Your message</label>
          <textarea id="chat-body" maxLength={1000} required value={body} onChange={(e) => setBody(e.target.value)} />
          <p><button type="submit" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button></p>
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
      {messages?.length === 0 && <p className="muted">No messages yet.</p>}
      {messages?.map((m) => (
        <div key={m.id} className="chat-message">
          <div className="chat-meta">
            <strong>{m.profiles?.username ?? 'Member'}</strong> · {new Date(m.created_at).toLocaleString()}
            {user && (
              <> · <button type="button" className="btn-small" onClick={() => report(m.id)}>Report</button></>
            )}
          </div>
          <div>{m.body}</div>
        </div>
      ))}
    </section>
  );
}
