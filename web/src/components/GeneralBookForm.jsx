import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendly } from '../lib/errors';

// Administrator only. Creates a book that is published at once and credited to any name.
export default function GeneralBookForm({ onCreated }) {
  const [form, setForm] = useState({ title: '', synopsis: '', credit: '', access: 'public' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    const { error } = await supabase.rpc('admin_create_general_book', {
      p_title: form.title.trim(),
      p_synopsis: form.synopsis.trim(),
      p_credit: form.credit.trim(),
      p_access: form.access,
    });
    setBusy(false);
    if (error) {
      setMessage({ type: 'error', text: friendly(error) });
      return;
    }
    setForm({ title: '', synopsis: '', credit: '', access: 'public' });
    setMessage({ type: 'ok', text: 'General book published. Use "Manage chapters" below to add its chapters.' });
    onCreated();
  }

  return (
    <form onSubmit={submit} className="card">
      <h2>Add a general book</h2>
      <p className="muted">General books are published at once and credited to the name you enter, not to your own account.</p>

      <label htmlFor="gb-title">Title</label>
      <input id="gb-title" required maxLength={200} value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })} />

      <label htmlFor="gb-credit">Credited author (shown on the book)</label>
      <input id="gb-credit" required maxLength={120} value={form.credit}
        onChange={(e) => setForm({ ...form, credit: e.target.value })} />

      <label htmlFor="gb-synopsis">Synopsis</label>
      <textarea id="gb-synopsis" maxLength={5000} value={form.synopsis}
        onChange={(e) => setForm({ ...form, synopsis: e.target.value })} />

      <fieldset style={{ border: 0, padding: 0, margin: '.8rem 0' }}>
        <legend style={{ fontWeight: 600, marginBottom: '.3rem' }}>Who can read it</legend>
        <label style={{ fontWeight: 400, display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <input type="radio" name="gb-access" value="public" style={{ width: 'auto' }}
            checked={form.access === 'public'} onChange={() => setForm({ ...form, access: 'public' })} />
          Public: guests read the first three free chapters, members read all
        </label>
        <label style={{ fontWeight: 400, display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <input type="radio" name="gb-access" value="premium" style={{ width: 'auto' }}
            checked={form.access === 'premium'} onChange={() => setForm({ ...form, access: 'premium' })} />
          Premium: every chapter is for Premium members only
        </label>
      </fieldset>

      <p><button type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish general book'}</button></p>
      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}
    </form>
  );
}
