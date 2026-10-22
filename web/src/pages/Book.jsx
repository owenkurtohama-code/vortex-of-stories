import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';
import BookChat from '../components/BookChat.jsx';

const SHELVES = [
  { key: 'favorite', label: 'Favorite' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
];

export default function Book() {
  const { bookId } = useParams();
  const { user, isVerified } = useSession();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [status, setStatus] = useState('loading');
  const [shelf, setShelf] = useState(null);
  const [following, setFollowing] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: b, error: bookError } = await supabase
        .from('books')
        .select('id, title, synopsis, cover_url, author_id, profiles(username, avatar_url)')
        .eq('id', bookId)
        .maybeSingle();
      if (!active) return;
      // Report the real error, so a failed request is never mistaken for a missing book.
      if (bookError) {
        setStatus(`This story could not be loaded. Error ${bookError.code ?? ''}: ${bookError.message}`);
        return;
      }
      if (!b) { setStatus('missing'); return; }
      setBook(b);
      const { data: index, error } = await supabase.rpc('book_chapter_index', { p_book: bookId });
      if (!active) return;
      if (error) { setStatus(`The chapter list could not be loaded. Error ${error.code ?? ''}: ${error.message}`); return; }
      setChapters(index ?? []);
      setStatus('ready');
    })();
    return () => { active = false; };
  }, [bookId]);

  useEffect(() => {
    if (!user || !book) return;
    (async () => {
      const { data: entry } = await supabase
        .from('library_entries').select('shelf')
        .eq('user_id', user.id).eq('book_id', book.id).maybeSingle();
      setShelf(entry?.shelf ?? null);
      const { data: f } = await supabase
        .from('author_follows').select('author_id')
        .eq('follower_id', user.id).eq('author_id', book.author_id).maybeSingle();
      setFollowing(Boolean(f));
    })();
  }, [user, book]);

  if (status === 'loading') return <p role="status">Loading…</p>;
  if (status === 'missing') return <p className="card">This story is not available.</p>;
  if (status !== 'ready') return <p role="alert" className="error">{status}</p>;

  const fullAccess = Boolean(user) && isVerified;
  const isOwnBook = user && book.author_id === user.id;
  const authorName = book.profiles?.username;

  async function setShelfTo(key) {
    setMessage(null);
    const { error } = await supabase.rpc('set_library_shelf', { p_book: book.id, p_shelf: key });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setShelf(key);
    setMessage({ type: 'ok', text: `Saved to ${key === 'favorite' ? 'favorites' : key}.` });
  }

  async function removeFromLibrary() {
    setMessage(null);
    const { error } = await supabase.rpc('remove_library_entry', { p_book: book.id });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setShelf(null);
  }

  async function toggleFollow() {
    setMessage(null);
    const fn = following ? 'unfollow_author' : 'follow_author';
    const { error } = await supabase.rpc(fn, { p_author: book.author_id });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setFollowing(!following);
  }

  return (
    <article>
      {book.cover_url && <img src={book.cover_url} alt={`Cover of ${book.title}`} className="cover cover-large" />}
      <h1>{book.title}</h1>
      {authorName && (
        <p className="muted">By <Link to={`/author/${authorName}`}>{authorName}</Link></p>
      )}
      <p>{book.synopsis}</p>

      {user && (
        <section className="card" aria-label="Your library">
          <p className="muted" style={{ marginTop: 0 }}>Add this book to your library:</p>
          <div className="tabs">
            {SHELVES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={shelf === s.key ? '' : 'btn-secondary'}
                aria-pressed={shelf === s.key}
                onClick={() => setShelfTo(s.key)}
              >
                {s.label}
              </button>
            ))}
            {shelf && <button type="button" className="btn-small" onClick={removeFromLibrary}>Remove</button>}
          </div>
          {!isOwnBook && authorName && (
            <button type="button" className="btn-secondary" onClick={toggleFollow}>
              {following ? 'Following ' + authorName : 'Follow ' + authorName}
            </button>
          )}
        </section>
      )}

      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}

      <h2>Chapters</h2>
      {chapters.length === 0 && <p className="muted">No published chapters yet.</p>}
      <ol>
        {chapters.map((c) => {
          const readable = fullAccess || c.in_guest_preview;
          return (
            <li key={c.chapter_id} style={{ margin: '.5rem 0' }}>
              {readable ? (
                <Link to={`/read/${c.chapter_id}`}>{c.chapter_title}</Link>
              ) : (
                <span>
                  {c.chapter_title}{' '}
                  <span className="status">{user ? 'Verify your email to read' : 'Sign in to continue reading'}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {!fullAccess && (
        <p className="card">
          Guests can read the first three chapters. <Link to={user ? '/settings' : '/register'}>{user ? 'Verify your email' : 'Create a free account'}</Link> to read the rest.
        </p>
      )}

      <BookChat bookId={book.id} canPost={Boolean(user)} />
    </article>
  );
}
