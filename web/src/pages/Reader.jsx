import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';

export default function Reader() {
  const { chapterId } = useParams();
  const { user, isVerified } = useSession();
  const [chapter, setChapter] = useState(null);
  const [index, setIndex] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    (async () => {
      const { data, error } = await supabase.rpc('get_chapter', { p_chapter: chapterId });
      if (!active) return;
      if (error) { setStatus(friendly(error)); return; }
      const row = data?.[0];
      if (!row) { setStatus('locked'); return; }
      const { data: idx } = await supabase.rpc('book_chapter_index', { p_book: row.book_id });
      if (!active) return;
      setChapter(row);
      setIndex(idx ?? []);
      setStatus('ready');
    })();
    return () => { active = false; };
  }, [chapterId]);

  // Remember the reading position for verified members. Failure here must never block reading.
  useEffect(() => {
    if (status === 'ready' && chapter && user && isVerified) {
      supabase.rpc('save_reading_progress', { p_chapter: chapter.chapter_id }).then(() => {});
    }
  }, [status, chapter, user, isVerified]);

  if (status === 'loading') return <p role="status">Loading chapter…</p>;
  if (status === 'locked') {
    return (
      <section className="card">
        <h1>This chapter is not available to you</h1>
        <p>Guests can read the first three chapters of each story. <Link to="/register">Create a free account</Link> or <Link to="/login">sign in</Link> to continue, and verify your email to read every chapter.</p>
      </section>
    );
  }
  if (status !== 'ready') return <p role="alert" className="error">{status}</p>;

  const pos = index.findIndex((c) => c.chapter_id === chapter.chapter_id);
  const prev = pos > 0 ? index[pos - 1] : null;
  const next = pos >= 0 && pos < index.length - 1 ? index[pos + 1] : null;

  return (
    <article className="reader">
      <p className="muted">Chapter {chapter.chapter_position}</p>
      <h1>{chapter.chapter_title}</h1>
      <div className="reader-body">{chapter.chapter_body}</div>
      <nav aria-label="Chapter navigation" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        {prev ? <Link to={`/read/${prev.chapter_id}`}>← Previous chapter</Link> : <span />}
        <Link to={`/book/${chapter.book_id}`}>Contents</Link>
        {next ? <Link to={`/read/${next.chapter_id}`}>Next chapter →</Link> : <span />}
      </nav>
    </article>
  );
}
