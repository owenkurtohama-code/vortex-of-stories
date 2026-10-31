import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';
import Avatar from '../components/Avatar.jsx';

function when(iso) {
  return new Date(iso).toLocaleString();
}

function PersonLine({ person, fallback }) {
  if (!person) return <span className="muted">{fallback}</span>;
  return (
    <span style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center' }}>
      <Avatar url={person.avatar_url} name={person.username} size={28} />
      <Link to={`/author/${person.username}`}>{person.display_name || person.username}</Link>
      <span className="muted">@{person.username}</span>
    </span>
  );
}

// Friend requests, friends, private chat, and blocking. Members only.
export default function Friends() {
  const { user, isVerified } = useSession();
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [friends, setFriends] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user || !isVerified) return;
    await supabase.rpc('refresh_friend_requests');

    const { data: reqs } = await supabase.from('friend_requests')
      .select('id, from_user, to_user, status, expires_at, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    const { data: fr } = await supabase.from('friendships')
      .select('user_a, user_b')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    const { data: bl } = await supabase.from('blocks')
      .select('blocked_id, reason, created_at')
      .eq('blocker_id', user.id);

    const ids = new Set();
    (reqs ?? []).forEach((r) => ids.add(r.from_user === user.id ? r.to_user : r.from_user));
    (fr ?? []).forEach((f) => ids.add(f.user_a === user.id ? f.user_b : f.user_a));
    (bl ?? []).forEach((b) => ids.add(b.blocked_id));

    const people = {};
    if (ids.size > 0) {
      const { data: profs } = await supabase
        .from('profiles').select('id, username, display_name, avatar_url')
        .in('id', [...ids]);
      (profs ?? []).forEach((p) => { people[p.id] = p; });
    }

    setIncoming((reqs ?? []).filter((r) => r.to_user === user.id)
      .map((r) => ({ ...r, person: people[r.from_user] })));
    setOutgoing((reqs ?? []).filter((r) => r.from_user === user.id)
      .map((r) => ({ ...r, person: people[r.to_user] })));
    setFriends((fr ?? []).map((f) => {
      const id = f.user_a === user.id ? f.user_b : f.user_a;
      return { id, person: people[id] };
    }));
    setBlocked((bl ?? []).map((b) => ({ ...b, person: people[b.blocked_id] })));
  }, [user, isVerified]);

  useEffect(() => { load(); }, [load]);

  if (!user) return <p className="card">Please <a href="#/login">sign in</a> to see your friends.</p>;
  if (!isVerified) return <p className="card">Verify your email address to use friends.</p>;

  async function sendRequest(e) {
    e.preventDefault();
    setMessage(null);
    const name = username.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.rpc('send_friend_request', { p_username: name });
    setBusy(false);
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setUsername('');
    setMessage({ type: 'ok', text: `Friend request sent to ${name}. It expires in 3 days if it is not answered.` });
    load();
  }

  async function respond(id, accept) {
    setMessage(null);
    const { data, error } = await supabase.rpc('respond_friend_request', { p_request: id, p_accept: accept });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    if (data === 'expired') {
      setMessage({ type: 'error', text: 'That request has expired.' });
    } else {
      setMessage({ type: 'ok', text: accept ? 'You are now friends.' : 'Request declined.' });
    }
    load();
  }

  async function cancel(id) {
    setMessage(null);
    const { error } = await supabase.rpc('cancel_friend_request', { p_request: id });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setMessage({ type: 'ok', text: 'Request cancelled.' });
    load();
  }

  async function removeFriend(id, name) {
    if (!window.confirm(`Remove ${name} from your friends?`)) return;
    setMessage(null);
    const { error } = await supabase.rpc('remove_friend', { p_friend: id });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setMessage({ type: 'ok', text: `${name} has been removed from your friends.` });
    load();
  }

  async function block(id, name) {
    if (!window.confirm(`Block ${name}? They will not be able to send you requests or messages.`)) return;
    const reason = window.prompt(
      `Why are you blocking ${name}? (optional, but we recommend giving a reason. Only you and the administrators can see it.)`
    );
    if (reason === null) return;
    setMessage(null);
    const { error } = await supabase.rpc('block_member', { p_user: id, p_reason: reason.trim() || null });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setMessage({ type: 'ok', text: `${name} has been blocked.` });
    load();
  }

  async function unblock(id, name) {
    setMessage(null);
    const { error } = await supabase.rpc('unblock_member', { p_user: id });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setMessage({ type: 'ok', text: `${name} has been unblocked.` });
    load();
  }

  return (
    <section>
      <h1>Friends</h1>

      <section className="card">
        <h2>Send a friend request</h2>
        <form onSubmit={sendRequest} className="action-row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label htmlFor="friend-username">Username</label>
            <input id="friend-username" value={username} maxLength={20}
              onChange={(e) => setUsername(e.target.value)} />
          </div>
          <button type="submit" disabled={busy || !username.trim()}>Send request</button>
        </form>
      </section>

      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}

      <section className="card">
        <h2>Requests for you</h2>
        {incoming.length === 0 && <p className="muted">No requests waiting.</p>}
        <ul className="book-list">
          {incoming.map((r) => (
            <li key={r.id} className="book-item" style={{ marginBottom: '.8rem' }}>
              <PersonLine person={r.person} fallback="A member" />
              <div className="muted" style={{ fontSize: '.85rem' }}>Expires {when(r.expires_at)}</div>
              <div className="action-row">
                <button type="button" onClick={() => respond(r.id, true)}>Accept</button>
                <button type="button" className="btn-secondary" onClick={() => respond(r.id, false)}>Decline</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Requests you sent</h2>
        {outgoing.length === 0 && <p className="muted">No pending requests.</p>}
        <ul className="book-list">
          {outgoing.map((r) => (
            <li key={r.id} className="book-item" style={{ marginBottom: '.8rem' }}>
              <PersonLine person={r.person} fallback="A member" />
              <div className="muted" style={{ fontSize: '.85rem' }}>Expires {when(r.expires_at)}</div>
              <div className="action-row">
                <button type="button" className="btn-secondary" onClick={() => cancel(r.id)}>Cancel request</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Your friends</h2>
        {friends.length === 0 && <p className="muted">You have no friends yet. Send a request above.</p>}
        <ul className="book-list">
          {friends.map((f) => {
            const name = f.person?.username ?? 'this member';
            return (
              <li key={f.id} className="book-item" style={{ marginBottom: '.8rem' }}>
                <PersonLine person={f.person} fallback="A member" />
                <div className="action-row">
                  <Link className="btn btn-small" to={`/private/${f.id}`}>Chat</Link>
                  <button type="button" className="btn-secondary" onClick={() => removeFriend(f.id, name)}>Remove friend</button>
                  <button type="button" className="btn-danger" onClick={() => block(f.id, name)}>Block</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2>Blocked members</h2>
        {blocked.length === 0 && <p className="muted">You have not blocked anyone.</p>}
        <ul className="book-list">
          {blocked.map((b) => {
            const name = b.person?.username ?? 'this member';
            return (
              <li key={b.blocked_id} className="book-item" style={{ marginBottom: '.8rem' }}>
                <PersonLine person={b.person} fallback="A member" />
                {b.reason && <div className="muted" style={{ fontSize: '.85rem' }}>Your reason: {b.reason}</div>}
                <div className="action-row">
                  <button type="button" className="btn-secondary" onClick={() => unblock(b.blocked_id, name)}>Unblock</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}
