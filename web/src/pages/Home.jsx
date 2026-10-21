import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Home() {
  const logo = `${import.meta.env.BASE_URL}vortex-art.jpg`;
  const [books, setBooks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from('books')
      .select('id, title, synopsis, cover_url, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError('Stories could not be loaded. Please try again shortly.');
        else setBooks(data ?? []);
      });
  }, []);

  return (
    <section>
      <img
        src={logo}
        alt="Vortex of Stories: a swirling violet vortex with rolled parchment scrolls and the title"
        className="hero-img"
      />
      <h1>Stories</h1>
      <p className="muted">Read the first three chapters of every story free. Create an account to continue reading.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {!error && books === null && <p role="status">Loading stories…</p>}
      {books?.length === 0 && <p className="card">No stories have been published yet. Check back soon.</p>}
      <div className="grid">
        {books?.map((b) => (
          <Link key={b.id} to={`/book/${b.id}`} className="card book-card">
            {b.cover_url && <img src={b.cover_url} alt={`Cover of ${b.title}`} className="cover" />}
            <h3>{b.title}</h3>
            <p className="muted">{b.synopsis ? b.synopsis.slice(0, 140) : 'No synopsis yet.'}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
