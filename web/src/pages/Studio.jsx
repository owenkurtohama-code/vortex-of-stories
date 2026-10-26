import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';
import { checkImage, uploadImage } from '../lib/media';
import GeneralBookForm from '../components/GeneralBookForm.jsx';

const EMPTY_CHAPTER = { title: '', body: '', premium_only: false };

export default function Studio() {
  const { user, isVerified, profile } = useSession();
  const [books, setBooks] = useState([]);
  const [current, setCurrent] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [newBook, setNewBook] = useState({ title: '', synopsis: '' });
  const [coverFile, setCoverFile] = useState(null);
  const [chapterForm, setChapterForm] = useState(EMPTY_CHAPTER);
  const [editingId, setEditingId] = useState(null);
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
      .select('id, position, title, body, published, premium_only')
      .eq('book_id', bookId)
      .order('position');
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
    setMessage(coverProblem ? { type: 'error', text: coverProblem } : { type: 'ok', text: 'Cover saved.' });
    loadBooks();
  }

  async function submitForReview(id) {
    const { error } = await supabase.from('books').update({ status: 'pending_review' }).eq('id', id);
    setMessage(error
      ? { type: 'error', text: friendly(error) }
      : { type: 'ok', text: 'Submitted. An administrator will review the book before it is public.' });
    loadBooks();
  }

  // Deletes a whole book after the member types its exact title.
  async function deleteBook(b) {
    setMessage(null);
    const typed = window.prompt(
      `This permanently deletes "${b.title}" with all its chapters, comments and reader progress. It cannot be undone.\n\nType the exact title to confirm:`
    );
    if (typed === null) return;
    const { error } = await supabase.rpc('delete_my_book', { p_book: b.id, p_confirm: typed });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    if (current?.id === b.id) { setCurrent(null); setChapters([]); }
    setMessage({ type: 'ok', text: `"${b.title}" has been deleted.` });
    loadBooks();
  }

  function openBook(b) {
    setCurrent(b);
    setEditingId(null);
    setChapterForm(EMPTY_CHAPTER);
    setMessage(null);
    loadChapters(b.id);
  }

  function startEdit(c) {
    setEditingId(c.id);
    setChapterForm({ title: c.title, body: c.body, premium_only: c.premium_only });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setChapterForm(EMPTY_CHAPTER);
  }

  // Saves a new chapter as a draft, or updates an existing one. Published chapters update for readers straight away.
  async function saveChapter(e) {
    e.preventDefault();
    setMessage(null);
    const title = chapterForm.title.trim();

    if (editingId) {
      const { error } = await supabase.from('chapters')
        .update({ title, body: chapterForm.body, premium_only: chapterForm.premium_only })
        .eq('id', editingId);
      if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
      setMessage({ type: 'ok', text: 'Chapter saved.' });
    } else {
      const nextPosition = chapters.length ? Math.max(...chapters.map((c) => c.position)) + 1 : 1;
      const { error } = await supabase.from('chapters').insert({
        book_id: current.id,
        position: nextPosition,
        title,
        body: chapterForm.body,
        published: false,
        premium_only: chapterForm.premium_only,
      });
      if (error) { setMessage({ type: 'error', text: 'The chapter could not be saved. Check the title and length.' }); return; }
      setMessage({ type: 'ok', text: 'Chapter saved as a draft.' });
    }
    cancelEdit();
    loadChapters(current.id);
  }

  async function togglePublish(c) {
    const { error } = await supabase.from('chapters').update({ published: !c.published }).eq('id', c.id);
    if (error) setMessage({ type: 'error', text: friendly(error) });
    loadChapters(current.id);
  }

  async function togglePremium(c) {
    const { error } = await supabase.from('chapters').update({ premium_only: !c.premium_only }).eq('id', c.id);
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

      {profile?.role === 'admin' && <GeneralBookForm onCreated={loadBooks} />}

      <h2>Your books</h2>
      {books.length === 0 && <p className="muted">You have not created any books yet.</p>}
      <ul className="book-list">
        {books.map((b) => (
          <li key={b.id} className="card book-item">
            {b.cover_url && <img src={b.cover_url} alt={`Cover of ${b.title}`} className="cover" />}
            <div className="book-head">
              <strong>{b.title}</strong>
              <span className="status">{b.status.replace('_', ' ')}</span>
            </div>
            {b.status === 'rejected' && b.review_reason && <p className="error">Reason: {b.review_reason}</p>}

            <div className="action-row">
              <button type="button" className="btn" onClick={() => openBook(b)}>Manage chapters</button>
              {(b.status === 'draft' || b.status === 'rejected') && (
                <button type="button" className="btn-secondary" onClick={() => submitForReview(b.id)}>Submit for review</button>
              )}
            </div>

            <div className="action-row">
              <label className="btn-secondary btn-file">
                Change cover
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) changeCover(b.id, f); e.target.value = ''; }} />
              </label>
            </div>

            <div className="action-row action-danger">
              <button type="button" className="btn-danger" onClick={() => deleteBook(b)}>Delete book</button>
            </div>
          </li>
        ))}
      </ul>

      {current && (
        <section className="card">
          <h2>Chapters of “{current.title}”</h2>
          <p className="muted">Chapters can be published only after the book is approved. Changes to a published chapter appear to readers straight away.</p>

          <ol className="chapter-list">
            {chapters.map((c) => (
              <li key={c.id} className="card chapter-item">
                <div className="book-head">
                  <strong>{c.title}</strong>
                  <span className="status">{c.published ? 'published' : 'draft'}</span>
                  <span className="status">{c.premium_only ? 'Premium only' : 'Free'}</span>
                </div>
                <div className="action-row">
                  <button type="button" className="btn-secondary" onClick={() => startEdit(c)}>Edit</button>
                  <button type="button" className="btn-secondary" onClick={() => togglePublish(c)}>
                    {c.published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => togglePremium(c)}>
                    {c.premium_only ? 'Make free' : 'Make Premium only'}
                  </button>
                </div>
              </li>
            ))}
          </ol>

          <form onSubmit={saveChapter}>
            <h3>{editingId ? 'Edit chapter' : 'Add chapter'}</h3>
            <label htmlFor="ctitle">Chapter title</label>
            <input id="ctitle" required maxLength={200} value={chapterForm.title}
              onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })} />
            <label htmlFor="cbody">Chapter text</label>
            <textarea id="cbody" required value={chapterForm.body} style={{ minHeight: '16rem' }}
              onChange={(e) => setChapterForm({ ...chapterForm, body: e.target.value })} />
            <p style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <input id="cprem" type="checkbox" checked={chapterForm.premium_only} style={{ width: 'auto' }}
                onChange={(e) => setChapterForm({ ...chapterForm, premium_only: e.target.checked })} />
              <label htmlFor="cprem" style={{ margin: 0, fontWeight: 400 }}>Premium members only</label>
            </p>
            <p>
              <button type="submit">{editingId ? 'Save changes' : 'Save chapter as draft'}</button>{' '}
              {editingId && <button type="button" className="btn-secondary" onClick={cancelEdit}>Cancel</button>}
            </p>
          </form>
        </section>
      )}

      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}
    </section>
  );
}
