import { useEffect, useState } from 'react';

// How long to wait before showing the prompt (ms)
const SHOW_DELAY_MS = 8000;
// How many days before re-showing after dismissal
const DISMISS_DAYS = 7;
const STORAGE_KEY = 'sp_install_dismissed';

function wasDismissedRecently(): boolean {
  try {
    const ts = localStorage.getItem(STORAGE_KEY);
    if (!ts) return false;
    const daysSince = (Date.now() - Number(ts)) / (1000 * 60 * 60 * 24);
    return daysSince < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function dismiss() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Don't show if already running as installed app
    if (isStandalone()) return;
    // Don't show if dismissed recently
    if (wasDismissedRecently()) return;

    const ios = isIOS();
    setIsIOSDevice(ios);

    if (ios) {
      // iOS: show custom instructions after delay
      const t = setTimeout(() => setShow(true), SHOW_DELAY_MS);
      return () => clearTimeout(t);
    }

    // Android/Chrome: capture beforeinstallprompt
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const t = setTimeout(() => setShow(true), SHOW_DELAY_MS);
      // Clean up timer if component unmounts
      return () => clearTimeout(t);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setShow(false);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setShow(false);
    dismiss();
  };

  const handleDismiss = () => {
    setShow(false);
    dismiss();
  };

  if (!show || installed) return null;

  // ── iOS prompt ───────────────────────────────────────────
  if (isIOSDevice) {
    return (
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
        background: '#111a14',
        borderTop: '1px solid rgba(16,231,116,0.2)',
        padding: '16px 20px 28px',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 9999, margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <img src="/icons/apple-touch-icon.png" style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0 }} alt="" />
          <div style={{ flex: 1 }}>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>Add ScorePhantom to Home Screen</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Get the full app experience — faster, no browser bar.
            </p>
          </div>
          <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Step num={1} text={<>Tap the <strong style={{color:'#10e774'}}>Share</strong> button <ShareIcon /> at the bottom of Safari</>} />
          <Step num={2} text={<>Scroll down and tap <strong style={{color:'#10e774'}}>“Add to Home Screen”</strong></>} />
          <Step num={3} text={<>Tap <strong style={{color:'#10e774'}}>“Add”</strong> in the top right corner</>} />
        </div>
      </div>
    );
  }

  // ── Android prompt ─────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: 16, right: 16, zIndex: 9998,
      background: '#111a14',
      border: '1px solid rgba(16,231,116,0.3)',
      borderRadius: 20,
      padding: '14px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <img src="/icons/icon-192.png" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} alt="" />
      <div style={{ flex: 1 }}>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: '0 0 2px' }}>Install ScorePhantom</p>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0 }}>Add to home screen for the best experience</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleDismiss}
          style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 10, cursor: 'pointer' }}
        >
          Later
        </button>
        <button
          onClick={handleInstall}
          style={{ background: '#10e774', border: 'none', color: '#000', fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 10, cursor: 'pointer' }}
        >
          Install
        </button>
      </div>
    </div>
  );
}

function Step({ num, text }: { num: number; text: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 24, height: 24, borderRadius: 999,
        background: 'rgba(16,231,116,0.15)',
        border: '1px solid rgba(16,231,116,0.3)',
        color: '#10e774', fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>{num}</div>
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: 0, lineHeight: 1.4 }}>{text}</p>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10e774" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  );
}
