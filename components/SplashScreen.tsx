import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  useEffect(() => {
    // Запускаем процесс завершения через 4 секунды
    const timer = setTimeout(onComplete, 4000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[999] bg-[#0A0A0C] overflow-hidden flex items-center justify-center">
      {/* 1. Глубокий фоновый градиент и "живое" свечение */}
      <div className="absolute inset-0">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.15, 0.1] 
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#1E7D7D] rounded-full blur-[140px]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#191B25]/50 to-[#0A0A0C]" />
      </div>

      {/* 2. Основная 3D Сцена */}
      <div className="relative flex flex-col items-center" style={{ perspective: '1200px' }}>
        
        {/* Изометрическая фура */}
        <motion.div
          initial={{ z: -500, x: -200, opacity: 0, rotateY: -45, rotateX: 15 }}
          animate={{ z: 0, x: 0, opacity: 1, rotateY: -25, rotateX: 10 }}
          transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-72 h-36 mb-16"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Тень под фурой */}
          <div className="absolute -bottom-6 left-10 right-0 h-4 bg-black/60 blur-xl rounded-full transform -rotate-12" />

          {/* Контейнер (AGR Green) */}
          <div className="absolute left-0 bottom-0 w-56 h-28 bg-[#1E7D7D] rounded-lg border border-white/20 shadow-2xl flex items-center justify-center overflow-hidden">
            {/* Световой блик, пробегающий по борту */}
            <motion.div 
              animate={{ x: [-200, 400] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "linear", repeatDelay: 0.5 }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-20"
            />
            <span className="text-white/10 font-black text-3xl tracking-tighter uppercase italic select-none">Logistics</span>
          </div>

          {/* Кабина (#3A3C4E) */}
          <div className="absolute -right-4 bottom-0 w-20 h-24 bg-[#3A3C4E] rounded-xl border border-white/10 shadow-lg" style={{ transform: 'translateZ(20px)' }}>
            <div className="absolute top-3 right-2 w-10 h-10 bg-[#191B25]/80 rounded-lg border border-white/5" /> {/* Окно */}
            <div className="absolute bottom-4 -right-2 w-4 h-8 bg-gradient-to-b from-orange-500 to-transparent blur-[2px] opacity-50" /> {/* Фара */}
          </div>
        </motion.div>

        {/* 3. Стеклянная панель (Glassmorphism) */}
        <motion.div
          initial={{ y: 50, opacity: 0, rotateX: -20 }}
          animate={{ y: 0, opacity: 1, rotateX: 0 }}
          transition={{ delay: 0.8, duration: 1, ease: "backOut" }}
          className="relative group"
        >
          {/* Размытый фон за стеклом */}
          <div className="absolute inset-0 bg-white/5 rounded-[2.5rem] blur-2xl" />
          
          <div className="relative px-16 py-10 bg-white/[0.03] backdrop-blur-2xl rounded-[2.5rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center">
            
            {/* Логотип AGR */}
            <motion.div className="relative">
              <h1 className="text-7xl font-black text-white tracking-[0.25em] drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                AGR
              </h1>
              {/* Анимированное подчеркивание */}
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ delay: 1.5, duration: 1 }}
                className="h-[2px] bg-gradient-to-r from-transparent via-[#E89F64] to-transparent mt-2"
              />
            </motion.div>

            <p className="mt-6 text-[#BDBFD1] text-[11px] font-bold uppercase tracking-[0.5em] opacity-70">
              Warehouse Monitoring System
            </p>

            {/* Индикатор загрузки (3 точки) */}
            <div className="mt-10 flex gap-3">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    scale: [1, 1.4, 1],
                    opacity: [0.3, 1, 0.3],
                    backgroundColor: i === 1 ? '#E89F64' : '#1E7D7D'
                  }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                  className="w-2.5 h-2.5 rounded-full shadow-[0_0_12px_currentColor]"
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* 4. Фоновые частицы (пылинки) */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              x: Math.random() * 100 + "%", 
              y: Math.random() * 100 + "%",
              opacity: 0 
            }}
            animate={{ 
              y: [null, "-20%"],
              opacity: [0, 0.4, 0] 
            }}
            transition={{ 
              duration: 3 + Math.random() * 4, 
              repeat: Infinity, 
              ease: "linear",
              delay: Math.random() * 5 
            }}
            className="absolute w-1 h-1 bg-white rounded-full blur-[1px]"
          />
        ))}
      </div>
    </div>
  );
};

export default SplashScreen;
