import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';
import { checkImage, uploadImage } from '../lib/media';

const EMPTY = { title: '', synopsis: '', credit: '', access: 'public' };

// Administrator only: publish books for readers, credited to any name. Chapters are added in Author Studio.
export default function GeneralBooks() {
  const { user, profile } = useSession();
  const isAdmin = profile?.role === 'admin';
  const [form, setForm] = useState(EMPTY);
  const [coverFile, setCoverFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [books, setBooks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function load() {
    const { data } = await supabase.from('books')
      .select('id, title, credit_name, access_level, status, cover_url, created_at')
      .eq('is_general', true)
      .order('created_at', { ascending: false });
    setBooks(data ?? []);
  }

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!user) return <p className="card">Please <a href="#/login">sign in</a> to continue.</p>;
  if (!isAdmin) return <p className="card">Only the administrator can publish general books.</p>;

  async function create(e) {
    e.preventDefault();
    setMessage(null);
    if (coverFile) {
      const problem = checkImage(coverFile, 'covers');
      if (problem) { setMessage({ type: 'error', text: problem }); return; }
    }
    setBusy(true);
    const { data: bookId, error } = await supabase.rpc('admin_create_general_book', {
      p_title: form.title.trim(),
      p_synopsis: form.synopsis.trim(),
      p_credit: form.credit.trim(),
      p_access: form.access,
    });
    if (error) {
      setBusy(false);
      setMessage({ type: 'error', text: friendly(error) });
      return;
    }

    let coverNote = '';
    if (coverFile) {
      try {
        const url = await uploadImage('covers', user.id, `cover-${bookId}`, coverFile);
        const { error: updateError } = await supabase.from('books').update({ cover_url: url }).eq('id', bookId);
        if (updateError) coverNote = ' The cover could not be saved. Add it later with Change cover in Author Studio.';
      } catch {
        coverNote = ' The cover could not be uploaded. Add it later with Change cover in Author Studio.';
      }
    }

    setBusy(false);
    setForm(EMPTY);
    setCoverFile(null);
    setFileKey((k) => k + 1);
    setMessage({ type: 'ok', text: `General book published.${coverNote} Add its chapters with Manage chapters in Author Studio.` });
    load();
  }

  async function deleteBook(b) {
    setMessage(null);
    const typed = window.prompt(
      `This permanently deletes "${b.title}" with all its chapters, comments and reader progress. It cannot be undone.\n\nType the exact title to confirm:`
    );
    if (typed === null) return;
    const { error } = await supabase.rpc('delete_my_book', { p_book: b.id, p_confirm: typed });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setMessage({ type: 'ok', text: `"${b.title}" has been deleted.` });
    load();
  }

  return (
    <section>
      <h1>General books</h1>
      <p className="muted">Books published for readers, credited to any name. They appear on Stories straight away.</p>

      <form onSubmit={create} className="card">
        <h2>Publish a new general book</h2>

        <label htmlFor="g-title">Title</label>
        <input id="g-title" required maxLength={200} value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} />

        <label htmlFor="g-credit">Credited author (shown on the book)</label>
        <input id="g-credit" required maxLength={120} value={form.credit}
          onChange={(e) => setForm({ ...form, credit: e.target.value })} />

        <label htmlFor="g-synopsis">Synopsis</label>
        <textarea id="g-synopsis" maxLength={5000} value={form.synopsis}
          onChange={(e) => setForm({ ...form, synopsis: e.target.value })} />

        <label htmlFor="g-cover">Cover image (optional, JPG, PNG or WebP, up to 5 MB)</label>
        <input key={fileKey} id="g-cover" type="file" accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />

        <fieldset style={{ border: 0, padding: 0, margin: '.8rem 0' }}>
          <legend style={{ fontWeight: 600, marginBottom: '.3rem' }}>Who can read it</legend>
          <label style={{ fontWeight: 400, display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input type="radio" name="g-access" value="public" style={{ width: 'auto' }}
              checked={form.access === 'public'} onChange={() => setForm({ ...form, access: 'public' })} />
            Public: guests read the first three free chapters, members read all
          </label>
          <label style={{ fontWeight: 400, display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input type="radio" name="g-access" value="premium" style={{ width: 'auto' }}
              checked={form.access === 'premium'} onChange={() => setForm({ ...form, access: 'premium' })} />
            Premium: every chapter is for Premium members only
          </label>
        </fieldset>

        <p><button type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish general book'}</button></p>
      </form>

      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}

      <h2>Published general books</h2>
      {books.length === 0 && <p className="muted">No general books yet. Publish the first one above.</p>}
      <ul className="book-list">
        {books.map((b) => (
          <li key={b.id} className="card book-item">
            {b.cover_url && <img src={b.cover_url} alt={`Cover of ${b.title}`} className="cover" />}
            <div className="book-head">
              <strong>{b.title}</strong>
              <span className="status">By {b.credit_name}</span>
              <span className="status">{b.access_level === 'premium' ? 'Premium' : 'Public'}</span>
              <span className="status">{b.status.replace('_', ' ')}</span>
            </div>
            <div className="action-row">
              <Link className="btn-secondary btn-small" to="/studio">Manage chapters in Author Studio</Link>
            </div>
            <div className="action-row action-danger">
              <button type="button" className="btn-danger" onClick={() => deleteBook(b)}>Delete book</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
