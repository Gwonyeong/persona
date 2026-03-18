import { useEffect, useRef } from 'react';

export default function AdBanner({ slot, format = 'auto', responsive = true }) {
  const adRef = useRef(false);

  useEffect(() => {
    if (adRef.current) return;
    adRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('AdSense error:', e);
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client="ca-pub-1541570032678257"
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive}
    />
  );
}
