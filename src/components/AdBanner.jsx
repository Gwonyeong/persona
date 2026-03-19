import { useEffect, useRef } from 'react';

const isDev = import.meta.env.DEV;

export default function AdBanner({ slot, format = 'auto', responsive = true }) {
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
          display: 'block',
          width: '100%',
          height: format === 'horizontal' ? 60 : 100,
          background: '#1f2937',
          border: '1px dashed #4b5563',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6b7280',
          fontSize: 12,
        }}
      >
        AD · {slot}
      </div>
    );
  }

  const maxH = format === 'horizontal' ? 60 : 100;

  return (
    <div style={{ maxHeight: maxH, overflow: 'hidden' }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-1541570032678257"
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive}
      />
    </div>
  );
}
