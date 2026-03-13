import React, { useState, useEffect } from 'react';

interface SplashScreenProps {
  isLoaded: boolean;
}

export default function SplashScreen({ isLoaded }: SplashScreenProps) {
  const [shouldRender, setShouldRender] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      // Allow time for the opacity transition to finish before unmounting
      const timer = setTimeout(() => setShouldRender(false), 700);
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  if (!shouldRender) return null;

  return (
    <div 
      className={`fixed inset-0 z-[999] bg-[#0F0F12] flex flex-col items-center justify-center transition-opacity duration-700 ease-in-out ${
        isLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center justify-center w-full px-4">
        
        {/* Logo or Fallback Text */}
        {!imageError ? (
          <img 
            src="/agr-logo-white.svg" 
            alt="AGR" 
            className="h-16 animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] mb-10" 
            onError={() => setImageError(true)}
          />
        ) : (
          <h1 className="text-3xl font-black tracking-[0.2em] text-white/10 uppercase select-none animate-pulse text-center w-full mb-10">
            AGR WAREHOUSE
          </h1>
        )}

        {/* Modern Spinner / Progress indicator */}
        <div className="relative flex items-center justify-center w-12 h-12">
          <svg className="w-full h-full animate-spin text-accent-blue/20" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
            <path className="opacity-75 text-accent-blue" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <div className="absolute w-2 h-2 rounded-full bg-accent-blue animate-ping" />
        </div>

        {/* Loading Text */}
        <p className="mt-6 text-white/50 text-[11px] font-bold tracking-[0.3em] uppercase animate-pulse text-center">
          Синхронизация с базой данных...
        </p>

      </div>
    </div>
  );
}
