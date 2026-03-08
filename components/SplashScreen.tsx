import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // Stage 1: Truck drives in (0 - 1.5s)
    const t1 = setTimeout(() => setStage(1), 100);
    
    // Stage 2: Logo and text appear (1.5s - 3s)
    const t2 = setTimeout(() => setStage(2), 1500);
    
    // Stage 3: Fade out to main app (3s - 4s)
    const t3 = setTimeout(() => {
      setStage(3);
      setTimeout(onComplete, 500); // 500ms for fade out
    }, 3500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div 
      className={`fixed inset-0 z-[100] bg-[#191B25] flex flex-col items-center justify-center transition-opacity duration-500 ease-in-out ${
        stage === 3 ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="relative w-full max-w-[600px] h-[300px] flex flex-col items-center justify-center">
        
        {/* Truck Animation */}
        <div 
          className="absolute top-1/2 -translate-y-[80px] flex items-end transition-transform duration-[1400ms] ease-out drop-shadow-2xl"
          style={{
            transform: stage >= 1 ? 'translate(-50%, -80px)' : 'translate(-150vw, -80px)',
            left: '50%'
          }}
        >
          {/* Truck Cabin (#3A3C4E) */}
          <div className="w-16 h-20 bg-[#3A3C4E] rounded-tr-xl rounded-tl-sm relative z-10 border-r border-[#191B25]">
            <div className="absolute top-2 right-1 w-6 h-8 bg-[#191B25]/50 rounded-tr-md" /> {/* Window */}
            <div className="absolute -bottom-2 right-2 w-6 h-6 bg-[#0F0F12] rounded-full border-2 border-[#5C5E74]" /> {/* Front Wheel */}
          </div>
          
          {/* Truck Container (#1E7D7D) */}
          <div className="w-48 h-24 bg-[#1E7D7D] rounded-l-sm relative">
            <div className="absolute top-2 bottom-2 left-2 right-2 border-2 border-[#053838]/30 rounded-sm" />
            <div className="absolute -bottom-2 left-4 w-6 h-6 bg-[#0F0F12] rounded-full border-2 border-[#5C5E74]" /> {/* Back Wheel 1 */}
            <div className="absolute -bottom-2 left-12 w-6 h-6 bg-[#0F0F12] rounded-full border-2 border-[#5C5E74]" /> {/* Back Wheel 2 */}
            
            {/* Logo appearing from the container */}
            <div 
              className={`absolute inset-0 flex items-center justify-center transition-all duration-1000 ease-in-out ${
                stage >= 2 ? 'opacity-100 scale-100 translate-y-[-60px]' : 'opacity-0 scale-50 translate-y-0'
              }`}
            >
              <div className="text-white font-black text-4xl tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                AGR
              </div>
            </div>
          </div>
        </div>

        {/* Text Fade In */}
        <div 
          className={`absolute top-1/2 translate-y-[60px] flex flex-col items-center transition-all duration-1000 ease-in-out delay-300 ${
            stage >= 2 ? 'opacity-100 translate-y-[60px]' : 'opacity-0 translate-y-[80px]'
          }`}
        >
          <div className="text-[#BDBFD1] text-lg font-bold tracking-[0.2em] uppercase text-center">
            Warehouse Monitoring System
          </div>
          {/* Subtle loading indicator */}
          <div className="mt-8 flex gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#E89F64] animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-[#E89F64] animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-[#E89F64] animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>

      </div>
    </div>
  );
};

export default SplashScreen;
