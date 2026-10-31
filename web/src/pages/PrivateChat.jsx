import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';
import Avatar from '../components/Avatar.jsx';
import MessageText from '../components/MessageText.jsx';

// A private conversation with one friend. Only the two of you can read it.
export default function PrivateChat() {
  const { friendId } = useParams();
  const { user, isVerified } = useSession();
  const [conversationId, setConversationId] = useState(null);
  const [friend, setFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [people, setPeople] = useState({});
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async (convId) => {
    const { data: rows } = await supabase.from('private_messages')
      .select('id, sender_id, body, created_at, deleted')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(200);
    setMessages(rows ?? []);

    const ids = [...new Set((rows ?? []).map((r) => r.sender_id))];
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles')
        .select('id, username, avatar_url').in('id', ids);
      const map = {};
      (profs ?? []).forEach((p) => { map[p.id] = p; });
      setPeople(map);
    }
    await supabase.rpc('mark_private_read', { p_conversation: convId });
  }, []);

  useEffect(() => {
    if (!user || !isVerified || !friendId) return;
    (async () => {
      const { data: f } = await supabase.from('profiles')
        .select('id, username, display_name, avatar_url').eq('id', friendId).maybeSingle();
      setFriend(f ?? null);
      const { data: convId, error } = await supabase.rpc('open_private_chat', { p_friend: friendId });
      if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
      setConversationId(convId);
      load(convId);
    })();
  }, [user, isVerified, friendId, load]);

  // Refresh every 20 seconds so new messages appear without reloading the page.
  useEffect(() => {
    if (!conversationId) return undefined;
    const timer = setInterval(() => load(conversationId), 20000);
    return () => clearInterval(timer);
  }, [conversationId, load]);

  if (!user) return <p className="card">Please <a href="#/login">sign in</a> to use private chat.</p>;
  if (!isVerified) return <p className="card">Verify your email address to use private chat.</p>;

  async function send(e) {
    e.preventDefault();
    if (!body.trim() || !conversationId) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('send_private_message', {
      p_conversation: conversationId, p_body: body.trim(),
    });
    setBusy(false);
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setBody('');
    load(conversationId);
  }

  async function removeMessage(id) {
    if (!window.confirm('Delete this message? It will disappear for both of you.')) return;
    const { error } = await supabase.rpc('delete_private_message', { p_message: id });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    load(conversationId);
  }

  async function reportMessage(id) {
    const reason = window.prompt('Why are you reporting this message? (3 to 1000 characters)');
    if (!reason) return;
    const share = window.confirm(
      'Also send this conversation to the administrators? They will see a copy of the messages as they are now. Choose Cancel to report only the message.'
    );
    const { error } = await supabase.rpc('report_private_message', {
      p_message: id, p_reason: reason, p_share: share,
    });
    setMessage(error
      ? { type: 'error', text: friendly(error) }
      : { type: 'ok', text: share
          ? 'Thank you. The report and a copy of the conversation have been sent to the administrators.'
          : 'Thank you. The report has been sent to the administrators.' });
  }

  const friendName = friend?.display_name || friend?.username || 'Friend';

  return (
    <section>
      <p><Link to="/friends">← Back to friends</Link></p>
      <div className="author-head">
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          <Avatar url={friend?.avatar_url} name={friend?.username} size={48} />
          <h1 style={{ margin: 0 }}>{friendName}</h1>
        </div>
      </div>
      <p className="muted">Private conversation. Only you and {friendName} can read it.</p>

      <form onSubmit={send} className="card">
        <label htmlFor="private-body">Your message</label>
        <textarea id="private-body" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
        <p><button type="submit" disabled={busy || !body.trim() || !conversationId}>{busy ? 'Sending…' : 'Send'}</button></p>
      </form>

      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}
      {messages.length === 0 && <p className="muted">No messages yet. Say hello.</p>}

      <div className="chat-list">
        {messages.map((m) => {
          const own = m.sender_id === user.id;
          const sender = people[m.sender_id];
          return (
            <div key={m.id} className={`chat-row${own ? ' own' : ''}`}>
              <Avatar url={sender?.avatar_url} name={sender?.username} size={32} />
              <div className="chat-bubble">
                <div className="chat-meta">
                  <strong>{own ? 'You' : (sender?.username ?? 'Friend')}</strong>
                  <span> · {new Date(m.created_at).toLocaleString()}</span>
                </div>
                {m.deleted
                  ? <div className="deleted">This message was deleted.</div>
                  : <div className="chat-text"><MessageText text={m.body} /></div>}
                {!m.deleted && own && (
                  <button type="button" className="btn-small chat-report" onClick={() => removeMessage(m.id)}>Delete</button>
                )}
                {!m.deleted && !own && (
                  <button type="button" className="btn-small chat-report" onClick={() => reportMessage(m.id)}>Report</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
