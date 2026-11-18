import { useEffect } from 'react';

export function useEscape(onEscape?: () => void) {
  useEffect(() => {
    if (!onEscape) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onEscape]);
}
