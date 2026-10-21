import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';
import Avatar from '../components/Avatar.jsx';

const PROVIDER_LABELS = { paypal: 'PayPal', kofi: 'Ko-fi', patreon: 'Patreon' };

export default function AuthorProfile() {
  const { username } = useParams();
  const { user, isVerified } = useSession();
  const [author, setAuthor] = useState(null);
  const [authorId, setAuthorId] = useState(null);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState(null);

  async function load() {
    setStatus('loading');
    const { data, error } = await supabase.rpc('get_author_profile', { p_username: username });
    if (error) { setStatus(friendly(error)); return; }
    if (!data) { setStatus('missing'); return; }
    setAuthor(data);
    const { data: p } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
    setAuthorId(p?.id ?? null);
    setStatus('ready');
  }

  useEffect(() => { load(); }, [username]);

  if (status === 'loading') return <p role="status">Loading author…</p>;
  if (status === 'missing') return <p className="card">This author could not be found.</p>;
  if (status !== 'ready') return <p role="alert" className="error">{status}</p>;

  const isSelf = user && authorId === user.id;
  const canFollow = Boolean(user) && isVerified && !isSelf && Boolean(authorId);

  async function toggleFollow() {
    setMessage(null);
    const fn = author.you_follow ? 'unfollow_author' : 'follow_author';
    const { error } = await supabase.rpc(fn, { p_author: authorId });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    load();
  }

  const PROVIDER_LABEL = PROVIDER_LABELS;

  return (
    <article>
      <div className="author-head">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Avatar url={author.avatar_url} name={author.username} size={96} />
          <div>
            <h1>{author.display_name || author.username}</h1>
            <p className="muted">@{author.username} · {author.followers} {author.followers === 1 ? 'follower' : 'followers'}</p>
          </div>
        </div>
        {canFollow && (
          <button type="button" className={author.you_follow ? 'btn-secondary' : ''} onClick={toggleFollow}>
            {author.you_follow ? 'Following' : 'Follow'}
          </button>
        )}
      </div>

      {message && <p role="status" className="error">{message.text}</p>}

      {author.bio && <section className="card"><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{author.bio}</p></section>}

      {author.support_links?.length > 0 && (
        <section className="card">
          <h2>Support this author</h2>
          <div className="support-links">
            {author.support_links.map((l) => (
              <a key={l.provider} className="btn btn-secondary" href={l.url} target="_blank" rel="noopener noreferrer">
                {PROVIDER_LABEL[l.provider] ?? l.provider}
              </a>
            ))}
          </div>
          <p className="muted">These links open the author's own page on the provider's site.</p>
        </section>
      )}

      <h2>Stories</h2>
      {author.books?.length === 0 && <p className="muted">No approved stories yet.</p>}
      <div className="grid">
        {author.books?.map((b) => (
          <Link key={b.id} to={`/book/${b.id}`} className="card book-card">
            {b.cover_url && <img src={b.cover_url} alt={`Cover of ${b.title}`} className="cover" />}
            <h3>{b.title}</h3>
            <p className="muted">{b.synopsis ? b.synopsis.slice(0, 140) : 'No synopsis yet.'}</p>
          </Link>
        ))}
      </div>
    </article>
  );
}
