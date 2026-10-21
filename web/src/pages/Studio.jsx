import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';
import { checkImage, uploadImage } from '../lib/media';

export default function Studio() {
  const { user, isVerified } = useSession();
  const [books, setBooks] = useState([]);
  const [current, setCurrent] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [newBook, setNewBook] = useState({ title: '', synopsis: '' });
  const [coverFile, setCoverFile] = useState(null);
  const [newChapter, setNewChapter] = useState({ title: '', body: '' });
  const [message, setMessage] = useState(null);

  async function loadBooks() {
    if (!user) return;
    const { data } = await supabase.from('books')
      .select('id, title, synopsis, status, review_reason, cover_url')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });
    setBooks(data ?? []);
  }

  async function loadChapters(bookId) {
    const { data } = await supabase.from('chapters')
      .select('id, position, title, published').eq('book_id', bookId).order('position');
    setChapters(data ?? []);
  }

  useEffect(() => { loadBooks(); }, [user]);

  if (!user) return <p className="card">Please <a href="#/login">sign in</a> to use the Author Studio.</p>;
  if (!isVerified) return <p className="card">Verify your email address to use the Author Studio.</p>;

  // Uploads the cover and records its address on the book. Returns an error message, or null.
  async function attachCover(bookId, file) {
    try {
      const url = await uploadImage('covers', user.id, `cover-${bookId}`, file);
      const { error } = await supabase.from('books').update({ cover_url: url }).eq('id', bookId);
      return error ? friendly(error) : null;
    } catch {
      return 'The cover could not be uploaded.';
    }
  }

  async function createBook(e) {
    e.preventDefault();
    setMessage(null);
    if (coverFile) {
      const problem = checkImage(coverFile, 'covers');
      if (problem) { setMessage({ type: 'error', text: problem }); return; }
    }
    const { data, error } = await supabase.from('books').insert({
      author_id: user.id, title: newBook.title.trim(), synopsis: newBook.synopsis.trim(),
    }).select('id').single();
    if (error) { setMessage({ type: 'error', text: 'The book could not be created. Check the title length.' }); return; }

    if (coverFile) {
      const coverProblem = await attachCover(data.id, coverFile);
      if (coverProblem) {
        setMessage({ type: 'error', text: `The book was created, but ${coverProblem.charAt(0).toLowerCase()}${coverProblem.slice(1)} Use "Change cover" to try again.` });
      }
    }
    setNewBook({ title: '', synopsis: '' });
    setCoverFile(null);
    loadBooks();
  }

  async function changeCover(bookId, file) {
    setMessage(null);
    const problem = checkImage(file, 'covers');
    if (problem) { setMessage({ type: 'error', text: problem }); return; }
    const coverProblem = await attachCover(bookId, file);
    setMessage(coverProblem
      ? { type: 'error', text: coverProblem }
      : { type: 'ok', text: 'Cover saved.' });
    loadBooks();
  }

  async function submitForReview(id) {
    const { error } = await supabase.from('books').update({ status: 'pending_review' }).eq('id', id);
    setMessage(error
      ? { type: 'error', text: friendly(error) }
      : { type: 'ok', text: 'Submitted. An administrator will review the book before it is public.' });
    loadBooks();
  }

  async function addChapter(e) {
    e.preventDefault();
    setMessage(null);
    const nextPosition = chapters.length ? Math.max(...chapters.map((c) => c.position)) + 1 : 1;
    const { error } = await supabase.from('chapters').insert({
      book_id: current.id, position: nextPosition, title: newChapter.title.trim(), body: newChapter.body, published: false,
    });
    if (error) { setMessage({ type: 'error', text: 'The chapter could not be saved. Check the title and length.' }); return; }
    setNewChapter({ title: '', body: '' });
    loadChapters(current.id);
  }

  async function togglePublish(chapter) {
    const { error } = await supabase.from('chapters').update({ published: !chapter.published }).eq('id', chapter.id);
    if (error) setMessage({ type: 'error', text: friendly(error) });
    loadChapters(current.id);
  }

  return (
    <section>
      <h1>Author Studio</h1>

      <form onSubmit={createBook} className="card">
        <h2>New book</h2>
        <label htmlFor="btitle">Title</label>
        <input id="btitle" required maxLength={200} value={newBook.title}
          onChange={(e) => setNewBook({ ...newBook, title: e.target.value })} />
        <label htmlFor="bsyn">Synopsis</label>
        <textarea id="bsyn" maxLength={5000} value={newBook.synopsis}
          onChange={(e) => setNewBook({ ...newBook, synopsis: e.target.value })} />
        <label htmlFor="bcover">Cover image (optional, JPG, PNG or WebP, up to 5 MB)</label>
        <input id="bcover" type="file" accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
        <p><button type="submit">Create book (saved as draft)</button></p>
      </form>

      <h2>Your books</h2>
      {books.length === 0 && <p className="muted">You have not created any books yet.</p>}
      <ul>
        {books.map((b) => (
          <li key={b.id} className="card" style={{ listStyle: 'none' }}>
            {b.cover_url && <img src={b.cover_url} alt={`Cover of ${b.title}`} className="cover" />}
            <strong>{b.title}</strong> <span className="status">{b.status.replace('_', ' ')}</span>
            {b.status === 'rejected' && b.review_reason && <p className="error">Reason: {b.review_reason}</p>}
            <p>
              {(b.status === 'draft' || b.status === 'rejected') && (
                <button type="button" className="btn-small" onClick={() => submitForReview(b.id)}>Submit for review</button>
              )}{' '}
              <button type="button" className="btn-small" onClick={() => { setCurrent(b); loadChapters(b.id); }}>Manage chapters</button>{' '}
              <label className="btn-small" style={{ display: 'inline-block', cursor: 'pointer', padding: '.3rem .7rem' }}>
                Change cover
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) changeCover(b.id, f); e.target.value = ''; }} />
              </label>
            </p>
          </li>
        ))}
      </ul>

      {current && (
        <section className="card">
          <h2>Chapters of “{current.title}”</h2>
          <p className="muted">Chapters can be published only after the book is approved by an administrator.</p>
          <ol>
            {chapters.map((c) => (
              <li key={c.id}>
                {c.title} <span className="status">{c.published ? 'published' : 'draft'}</span>{' '}
                <button type="button" className="btn-small" onClick={() => togglePublish(c)}>
                  {c.published ? 'Unpublish' : 'Publish'}
                </button>
              </li>
            ))}
          </ol>
          <form onSubmit={addChapter}>
            <h3>Add chapter</h3>
            <label htmlFor="ctitle">Chapter title</label>
            <input id="ctitle" required maxLength={200} value={newChapter.title}
              onChange={(e) => setNewChapter({ ...newChapter, title: e.target.value })} />
            <label htmlFor="cbody">Chapter text</label>
            <textarea id="cbody" required value={newChapter.body} style={{ minHeight: '16rem' }}
              onChange={(e) => setNewChapter({ ...newChapter, body: e.target.value })} />
            <p><button type="submit">Save chapter as draft</button></p>
          </form>
        </section>
      )}

      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}
    </section>
  );
}
