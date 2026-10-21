import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';

export default function Book() {
  const { bookId } = useParams();
  const { user, isVerified } = useSession();
  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: b } = await supabase.from('books').select('id, title, synopsis').eq('id', bookId).maybeSingle();
      if (!active) return;
      if (!b) { setStatus('missing'); return; }
      setBook(b);
      const { data: index, error } = await supabase.rpc('book_chapter_index', { p_book: bookId });
      if (!active) return;
      if (error) { setStatus(friendly(error)); return; }
      setChapters(index ?? []);
      setStatus('ready');
    })();
    return () => { active = false; };
  }, [bookId]);

  if (status === 'loading') return <p role="status">Loading…</p>;
  if (status === 'missing') return <p className="card">This story is not available.</p>;
  if (status !== 'ready') return <p role="alert" className="error">{status}</p>;

  const fullAccess = Boolean(user) && isVerified;

  return (
    <article>
      <h1>{book.title}</h1>
      <p>{book.synopsis}</p>
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
          Guests can read the first three chapters. <Link to={user ? '/' : '/register'}>{user ? 'Verify your email' : 'Create a free account'}</Link> to read the rest.
        </p>
      )}
    </article>
  );
}
