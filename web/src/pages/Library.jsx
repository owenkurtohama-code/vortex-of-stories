import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';

const SHELVES = [
  { key: 'reading', label: 'Currently reading' },
  { key: 'favorite', label: 'Favorites' },
  { key: 'finished', label: 'Finished' },
];

export default function Library() {
  const { user } = useSession();
  const [entries, setEntries] = useState(null);
  const [progress, setProgress] = useState([]);
  const [message, setMessage] = useState(null);

  async function load() {
    if (!user) return;
    const [lib, prog] = await Promise.all([
      supabase.from('library_entries')
        .select('book_id, shelf, books(id, title, status)')
        .eq('user_id', user.id)
        .order('added_at', { ascending: false }),
      supabase.from('reading_progress')
        .select('book_id, chapter_id, updated_at, books(id, title, status)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false }),
    ]);
    if (lib.error || prog.error) {
      setMessage({ type: 'error', text: 'Your library could not be loaded.' });
      return;
    }
    setEntries(lib.data ?? []);
    setProgress(prog.data ?? []);
  }

  useEffect(() => { load(); }, [user]);

  if (!user) return <p className="card">Please <a href="#/login">sign in</a> to see your library.</p>;

  async function changeShelf(bookId, shelf) {
    setMessage(null);
    const { error } = await supabase.rpc('set_library_shelf', { p_book: bookId, p_shelf: shelf });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    load();
  }

  async function remove(bookId) {
    setMessage(null);
    const { error } = await supabase.rpc('remove_library_entry', { p_book: bookId });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    load();
  }

  if (entries === null) return <p role="status">Loading your library…</p>;

  return (
    <section>
      <h1>Your library</h1>
      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}

      {progress.length > 0 && (
        <section className="card">
          <h2>Continue reading</h2>
          <ul>
            {progress.map((p) => (
              <li key={p.book_id}>
                {p.books?.status === 'approved' ? (
                  <>
                    <Link to={`/read/${p.chapter_id}`}>{p.books.title}</Link>{' '}
                    <span className="muted">· last read {new Date(p.updated_at).toLocaleDateString()}</span>
                  </>
                ) : (
                  <span className="muted">A story you were reading is no longer available.</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries.length === 0 && (
        <p className="card muted">Your library is empty. Open a story and choose a shelf to add it here.</p>
      )}

      {SHELVES.map((shelf) => {
        const items = entries.filter((e) => e.shelf === shelf.key);
        if (items.length === 0) return null;
        return (
          <section key={shelf.key} className="card">
            <h2>{shelf.label}</h2>
            <ul>
              {items.map((e) => (
                <li key={e.book_id} style={{ margin: '.6rem 0' }}>
                  {e.books?.status === 'approved' ? (
                    <Link to={`/book/${e.book_id}`}>{e.books.title}</Link>
                  ) : (
                    <span className="muted">This story is no longer available.</span>
                  )}{' '}
                  <label htmlFor={`shelf-${e.book_id}`} style={{ display: 'inline', fontWeight: 400 }}>
                    <span className="muted">Shelf: </span>
                  </label>
                  <select
                    id={`shelf-${e.book_id}`}
                    value={e.shelf}
                    onChange={(ev) => changeShelf(e.book_id, ev.target.value)}
                    style={{ width: 'auto', display: 'inline-block' }}
                  >
                    {SHELVES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>{' '}
                  <button type="button" className="btn-small" onClick={() => remove(e.book_id)}>Remove</button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
