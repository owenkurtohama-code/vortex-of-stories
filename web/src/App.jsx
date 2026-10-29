import { HashRouter, Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import { useSession } from './lib/session.jsx';
import VortexBackground from './components/VortexBackground.jsx';
import InstallApp from './components/InstallApp.jsx';
import Home from './pages/Home.jsx';
import Book from './pages/Book.jsx';
import Reader from './pages/Reader.jsx';
import { Login, Register, ResetPassword } from './pages/Auth.jsx';
import Premium from './pages/Premium.jsx';
import Chat from './pages/Chat.jsx';
import Studio from './pages/Studio.jsx';
import Admin from './pages/Admin.jsx';
import Library from './pages/Library.jsx';
import AuthorProfile from './pages/AuthorProfile.jsx';
import Settings from './pages/Settings.jsx';
import GeneralBooks from './pages/GeneralBooks.jsx';

function Header() {
  const { user, profile, premium, signOut } = useSession();
  return (
    <header className="site-header">
      <Link to="/" className="brand">Vortex of Stories</Link>
      <nav aria-label="Main">
        <NavLink to="/">Stories</NavLink>
        <NavLink to="/chat">Community</NavLink>
        {user && <NavLink to="/library">Library</NavLink>}
        <NavLink to="/premium">Premium</NavLink>
        {user && <NavLink to="/studio">Author Studio</NavLink>}
        {profile?.role === 'admin' && <NavLink to="/general">General books</NavLink>}
        {profile?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      <div className="account">
        <InstallApp />
        {user ? (
          <>
            <NavLink to="/settings">{profile?.username ?? 'Account'}</NavLink>
            {premium && <span className="status">Premium</span>}
            <button type="button" className="btn-small" onClick={signOut}>Sign out</button>
          </>
        ) : (
          <>
            <NavLink to="/login">Sign in</NavLink>
            <NavLink to="/register">Register</NavLink>
          </>
        )}
      </div>
    </header>
  );
}

export default function App() {
  const { recovering, loading } = useSession();

  if (loading) {
    return (
      <>
        <VortexBackground />
        <main className="container"><p role="status">Loading…</p></main>
      </>
    );
  }

  if (recovering) {
    return (
      <>
        <VortexBackground />
        <main className="container"><ResetPassword /></main>
      </>
    );
  }

  return (
    <HashRouter>
      <VortexBackground />
      <a className="skip-link" href="#main">Skip to content</a>
      <Header />
      <main id="main" className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/book/:bookId" element={<Book />} />
          <Route path="/read/:chapterId" element={<Reader />} />
          <Route path="/author/:username" element={<AuthorProfile />} />
          <Route path="/library" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/premium" element={<Premium />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/general" element={<GeneralBooks />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
