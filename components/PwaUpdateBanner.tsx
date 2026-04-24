import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';

const UPDATE_REMIND_AFTER_MS = 30 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const TV_AUTO_RELOAD_DELAY_MS = 60 * 1000;

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

interface PwaUpdateBannerProps {
  isBlocked: boolean;
  isTVMode: boolean;
  allowTVAutoReload: boolean;
}

const PwaUpdateBanner: React.FC<PwaUpdateBannerProps> = ({
  isBlocked,
  isTVMode,
  allowTVAutoReload,
}) => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);

  const updateServiceWorkerRef = useRef<UpdateServiceWorker | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const updateCheckInFlightRef = useRef(false);
  const updateStartedRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedRefresh(true),
      onRegisteredSW: (_swUrl, registration) => {
        registrationRef.current = registration ?? null;
      },
      onRegisterError: () => {
        // Keep update UX silent if the browser refuses SW registration.
      },
    });
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkForUpdate = () => {
      const registration = registrationRef.current;
      if (!registration || document.visibilityState !== 'visible' || updateCheckInFlightRef.current) return;

      updateCheckInFlightRef.current = true;
      registration.update()
        .catch(() => undefined)
        .finally(() => {
          updateCheckInFlightRef.current = false;
        });
    };

    const intervalId = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!dismissedUntil) return;

    const delay = Math.max(0, dismissedUntil - Date.now());
    const timerId = setTimeout(() => setDismissedUntil(0), delay);
    return () => clearTimeout(timerId);
  }, [dismissedUntil]);

  const handleUpdate = useCallback(async () => {
    if (updateStartedRef.current) return;
    updateStartedRef.current = true;
    setIsUpdating(true);

    window.setTimeout(() => {
      window.location.reload();
    }, 2000);

    try {
      if (updateServiceWorkerRef.current) {
        await updateServiceWorkerRef.current(true);
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    if (!needRefresh || !isTVMode || !allowTVAutoReload || isBlocked || updateStartedRef.current) return;

    const timerId = window.setTimeout(() => {
      void handleUpdate();
    }, TV_AUTO_RELOAD_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [allowTVAutoReload, handleUpdate, isBlocked, isTVMode, needRefresh]);

  const handleDismiss = () => {
    setDismissedUntil(Date.now() + UPDATE_REMIND_AFTER_MS);
  };

  const isDismissed = dismissedUntil > Date.now();
  const shouldShow = needRefresh && !isTVMode && !isBlocked && !isDismissed;

  if (!shouldShow) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[58] mx-auto w-auto max-w-md rounded-2xl border border-white/10 bg-[#191B25]/95 p-4 shadow-lg md:left-auto md:mx-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1E7D7D]/20 text-cyan-100">
          <RefreshCw className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-white">Приложение обновлено</div>
          <div className="mt-0.5 text-xs font-medium text-white/55">Доступна новая версия интерфейса</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleUpdate}
              disabled={isUpdating}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1E7D7D] px-3 py-2 text-xs font-black text-white transition-colors hover:bg-[#269090] disabled:cursor-wait disabled:opacity-70"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
              Обновить
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isUpdating}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/65 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Позже
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PwaUpdateBanner;
