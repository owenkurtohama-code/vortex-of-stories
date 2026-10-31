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
  if (!isVerified) return
  
