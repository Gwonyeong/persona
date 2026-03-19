import { useEffect, useRef } from 'react';

const isDev = import.meta.env.DEV;

export default function AdBanner({ slot, width = 320, height = 100 }) {
  const adRef = useRef(false);

  useEffect(() => {
    if (isDev || adRef.current) return;
    adRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('AdSense error:', e);
    }
  }, []);

  if (isDev) {
    return (
      <div
        style={{
          width, height, margin: '0 auto',
          background: '#1f2937', border: '1px dashed #4b5563', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#6b7280', fontSize: 12,
        }}
      >
        AD · {slot}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'inline-block', width, height }}
        data-ad-client="ca-pub-1541570032678257"
        data-ad-slot={slot}
      />
    </div>
  );
}
