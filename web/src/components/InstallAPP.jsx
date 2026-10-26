import { useEffect, useState } from 'react';

// Offers "Install the app" when the browser allows it, and shows iPhone steps where it doesn't.
export default function InstallApp() {
  const [prompt, setPrompt] = useState(window.deferredPrompt ?? null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  useEffect(() => {
    const onReady = () => setPrompt(window.deferredPrompt ?? null);
    const onInstalled = () => { setInstalled(true); setPrompt(null); window.deferredPrompt = null; };
    window.addEventListener('vortex-install-ready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('vortex-install-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isStandalone || installed) return null;

  async function install() {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    window.deferredPrompt = null;
    setPrompt(null);
  }

  if (prompt) {
    return <button type="button" className="btn-small" onClick={install}>Install the app</button>;
  }

  if (isIos) {
    return (
      <span style={{ position: 'relative' }}>
        <button type="button" className="btn-small" onClick={() => setShowIosHelp((v) => !v)}>Install the app</button>
        {showIosHelp && (
          <span role="note" className="card" style={{ position: 'absolute', right: 0, top: '2.2rem', width: 260, zIndex: 5, padding: '.75rem', margin: 0 }}>
            In Safari, tap the Share button, then choose <strong>Add to Home Screen</strong>.
          </span>
        )}
      </span>
    );
  }

  return null;
}
