import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session.jsx';
import { friendly } from '../lib/errors';
import { checkImage, uploadImage } from '../lib/media';
import Avatar from '../components/Avatar.jsx';

const PROVIDERS = [
  { key: 'paypal', label: 'PayPal', example: 'https://paypal.me/yourname' },
  { key: 'kofi', label: 'Ko-fi', example: 'https://ko-fi.com/yourname' },
  { key: 'patreon', label: 'Patreon', example: 'https://www.patreon.com/yourname' },
];

export default function Settings() {
  const { user, profile, premium, refreshAccount, signOut } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ display_name: '', bio: '' });
  const [links, setLinks] = useState([]);
  const [newLink, setNewLink] = useState({ provider: 'kofi', url: '' });
  const [confirmText, setConfirmText] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (profile) setForm({ display_name: profile.display_name ?? '', bio: profile.bio ?? '' });
  }, [profile]);

  async function loadLinks() {
    if (!user) return;
    const { data } = await supabase.from('author_support_links').select('provider, url').eq('author_id', user.id);
    setLinks(data ?? []);
  }

  useEffect(() => { loadLinks(); }, [user]);

  if (!user) return <p className="card">Please <a href="#/login">sign in</a> to manage your account.</p>;

  async function saveAvatar(e) {
    e.preventDefault();
    setMessage(null);
    const problem = checkImage(avatarFile, 'avatars');
    if (problem) { setMessage({ type: 'error', text: problem }); return; }
    try {
      const url = await uploadImage('avatars', user.id, 'avatar', avatarFile);
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      if (error) throw error;
      setAvatarFile(null);
      setMessage({ type: 'ok', text: 'Profile picture saved.' });
      refreshAccount();
    } catch {
      setMessage({ type: 'error', text: 'The picture could not be saved. Please try again.' });
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setMessage(null);
    const { error } = await supabase.from('profiles').update({
      display_name: form.display_name.trim() || null,
      bio: form.bio.trim() || null,
    }).eq('id', user.id);
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setMessage({ type: 'ok', text: 'Profile saved.' });
    refreshAccount();
  }

  async function saveLink(e) {
    e.preventDefault();
    setMessage(null);
    const { error } = await supabase.rpc('set_support_link', {
      p_provider: newLink.provider, p_url: newLink.url.trim(),
    });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    setNewLink({ ...newLink, url: '' });
    setMessage({ type: 'ok', text: 'Support link saved.' });
    loadLinks();
  }

  async function removeLink(provider) {
    setMessage(null);
    const { error } = await supabase.rpc('remove_support_link', { p_provider: provider });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    loadLinks();
  }

  async function exportData() {
    setMessage(null);
    const { data, error } = await supabase.rpc('export_my_data');
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vortex-of-stories-my-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    setMessage(null);
    if (confirmText !== 'DELETE') {
      setMessage({ type: 'error', text: 'Type DELETE in capital letters to confirm.' });
      return;
    }
    if (!window.confirm('This permanently deletes your account. Continue?')) return;
    const { error } = await supabase.rpc('delete_my_account', { p_confirm: confirmText });
    if (error) { setMessage({ type: 'error', text: friendly(error) }); return; }
    await signOut();
    navigate('/');
  }

  return (
    <section>
      <h1>Account settings</h1>
      {message && <p role="status" className={message.type === 'error' ? 'error' : 'ok'}>{message.text}</p>}

      <section className="card">
        <h2>Profile</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <Avatar url={profile?.avatar_url} name={profile?.username} size={80} />
          <div>
            <p className="muted" style={{ margin: 0 }}>Username: <strong>{profile?.username}</strong> (cannot be changed)</p>
          </div>
        </div>

        <form onSubmit={saveAvatar} style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="avatar">Profile picture (JPG, PNG or WebP, up to 2 MB)</label>
          <input id="avatar" type="file" accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} />
          <p><button type="submit" disabled={!avatarFile}>Upload picture</button></p>
        </form>

        <form onSubmit={saveProfile}>
          <label htmlFor="dn">Display name</label>
          <input id="dn" maxLength={60} value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <label htmlFor="bio">Bio</label>
          <textarea id="bio" maxLength={1000} value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          <p><button type="submit">Save profile</button></p>
        </form>
      </section>

      <section className="card">
        <h2>Support links</h2>
        <p className="muted">Available to authors with at least one approved story. Links must be HTTPS addresses on the provider's own domain.</p>
        {links.length === 0 && <p className="muted">No support links yet.</p>}
        <ul>
          {links.map((l) => (
            <li key={l.provider}>
              {PROVIDERS.find((p) => p.key === l.provider)?.label}: <a href={l.url} target="_blank" rel="noopener noreferrer">{l.url}</a>{' '}
              <button type="button" className="btn-small" onClick={() => removeLink(l.provider)}>Remove</button>
            </li>
          ))}
        </ul>
        <form onSubmit={saveLink}>
          <label htmlFor="provider">Provider</label>
          <select id="provider" value={newLink.provider}
            onChange={(e) => setNewLink({ ...newLink, provider: e.target.value })}>
            {PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <label htmlFor="link-url">Address</label>
          <input id="link-url" type="url" required maxLength={300} value={newLink.url}
            placeholder={PROVIDERS.find((p) => p.key === newLink.provider)?.example}
            onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} />
          <p><button type="submit">Save support link</button></p>
        </form>
      </section>

      <section className="card">
        <h2>Premium</h2>
        <p>{premium ? 'You currently have Premium.' : 'You do not currently have Premium.'}</p>
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted">Download a copy of your account information, library, reading history, messages, and any stories you have written.</p>
        <button type="button" onClick={exportData}>Download my data (JSON)</button>
      </section>

      <section className="card">
        <h2>Delete account</h2>
        <p className="muted">
          Deletion removes your profile, library, reading history, follows, and messages. It is not possible if your account has stories, purchases, or coin history. Contact the administrators in that case.
        </p>
        <label htmlFor="confirm-delete">Type DELETE to confirm</label>
        <input id="confirm-delete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        <p><button type="button" className="btn-secondary" onClick={deleteAccount}>Delete my account</button></p>
      </section>
    </section>
  );
}
