import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

interface SecureImageProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}

const SecureImage: React.FC<SecureImageProps> = ({ src, alt, className, onClick }) => {
  const [proxySrc, setProxySrc] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setError(false);
      setProxySrc('');
      const dataUrl = await api.getProxyImage(src);
      if (!cancelled) {
        if (dataUrl) {
          setProxySrc(dataUrl);
        } else {
          setError(true);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) {
    return <div className={`flex items-center justify-center text-xs text-white/40 ${className || ''}`}>Image unavailable</div>;
  }

  if (!proxySrc) {
    return <div className={`animate-pulse bg-white/5 ${className || ''}`} />;
  }

  return <img src={proxySrc} alt={alt} className={className} onClick={onClick} />;
};

export default SecureImage;
