import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendly } from '../lib/errors';
import Avatar from './Avatar.jsx';

// Discussion for one book. Reads are plain table queries; the server checks every post.
export default function BookChat({ bookId, canPost }) {
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function load() {
    const { data: rows, error } = await supabase
      .from('book_chat_messages')
      .select('id, body, created_at, user_id')
      .eq('book_id', bookId)
      .eq('hidden', false)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setMessage({ type: 'error', text: 'The discussion could not be loaded.' });
      return;
    }
    const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
    const people = {};
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, username, avatar_url').in('id', ids);
      (profiles ?? []).forEach((p) => { people[p.id] = p; });
    }
    setMessages((rows ?? []).map((r) => ({ ...r, person: people[r.user_id] ?? null })));
  }

  useEffect(() => { load(); }, [bookId]);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('post_book_chat', { p_book: bookId, p_body: body.trim() });
    setBusy(false);
    if (error) {
      setMessage({ type: 'error', text: friendly(error) });
      return;
    }
    setBody('');
    load();
  }

  async function report(id) {
    const reason = window.prompt('Why are you reporting this message? (3 to 1000 characters)');
    if (!reason) return;
    const { error } = await supabase.rpc('report_content', {
      p_type: 'book_chat_message', p_target: id, p_reason: reason,
    });
    setMessage(error
      ? { type: 'error', text: friendly(error) }
      : { type: 'ok', text: 'Thank you. The report has been sent to the administrators.' });
  }

  return (
    <section style={{ marginTop: '2rem' }}>
      <h2>Discussion</h2>

      {canPost ? (
        <form onSubmit={send} className="card">
          <label htmlFor="book-chat-body">Your comment about this book</label>
          <textarea id="book-chat-body" maxLength={1000} required value={body}
            onChange={(e) => setBody(e.target.value)} />
          <p><button type="submit" disabled={busy || !body.trim()}>{busy ? 'Posting…' : 'Post'}</button></p>
        </form>
      ) : (
        <p className="card muted">Sign in to join the discussion.</p>
      )}

      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}
      {messages === null && <p role="status">Loading discussion…</p>}
      {messages?.length === 0 && <p className="muted">No comments yet.</p>}
      {messages?.map((m) => (
        <div key={m.id} className="chat-message">
          <div className="chat-meta" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <Avatar url={m.person?.avatar_url} name={m.person?.username} size={28} />
            <strong>{m.person?.username ?? 'Member'}</strong>
            <span>· {new Date(m.created_at).toLocaleString()}</span>
            {canPost && (
              <button type="button" className="btn-small" onClick={() => report(m.id)}>Report</button>
            )}
          </div>
          <div>{m.body}</div>
        </div>
      ))}
    </section>
  );
}
