import { useEffect, useRef, useState } from 'react';

export function UpdateBanner() {
  const [show, setShow] = useState(false);
  const initialVersion = useRef<string | null>(null);

  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch('/api/version?t=' + Date.now());
        if (!res.ok) return;
        const { version } = await res.json();
        if (!initialVersion.current) {
          initialVersion.current = version;
        } else if (initialVersion.current !== version) {
          setShow(true);
        }
      } catch {}
    }

    checkVersion();
    // Poll every 2 minutes
    const interval = setInterval(checkVersion, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#10e774',
        color: '#000',
        fontWeight: 700,
        fontSize: 13,
        padding: '10px 20px',
        borderRadius: 999,
        boxShadow: '0 4px 24px rgba(16,231,116,0.4)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      onClick={() => window.location.reload()}
    >
      🔄 New update available — tap to refresh
    </div>
  );
}
