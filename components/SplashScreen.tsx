import React, { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  // Эффект легкого наклона за курсором (или гироскопом) для эффекта 3D-камеры
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseX = useSpring(x, { stiffness: 100, damping: 30 });
  const mouseY = useSpring(y, { stiffness: 100, damping: 30 });

  const rotateX = useTransform(mouseY, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], [-15, 15]);

  useEffect(() => {
    const timer = setTimeout(onComplete, 4500); // Чуть больше времени для кинематографичности
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(20px)" }}
      transition={{ duration: 1, ease: "circIn" }}
      className="fixed inset-0 z-[999] bg-[#050507] flex items-center justify-center overflow-hidden"
    >
      {/* 1. ФОН: Динамическое освещение (Vignette & Glow) */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(30,125,125,0.15)_0%,transparent_70%)]" />
        <motion.div 
          animate={{ 
            opacity: [0.3, 0.6, 0.3],
            scale: [1, 1.1, 1] 
          }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" 
        />
      </div>

      {/* 2. 3D СЦЕНА (Орбита камеры) */}
      <motion.div 
        style={{ rotateX, rotateY, perspective: 2000 }}
        className="relative flex flex-col items-center"
      >
        
        {/* 3D МОДЕЛЬ ФУРЫ */}
        <motion.div
          initial={{ z: -800, x: -400, opacity: 0, rotateY: -50 }}
          animate={{ z: 0, x: 0, opacity: 1, rotateY: -30 }}
          transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-80 h-40 mb-20 transform-style-3d"
        >
          {/* Тень (Ambient Occlusion) */}
          <div className="absolute -bottom-10 left-10 w-64 h-6 bg-black/80 blur-[30px] rounded-full transform -rotate-6" />

          {/* Тело контейнера (AGR Green) */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#1E7D7D] to-[#145a5a] rounded-xl border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden">
            {/* Анимированный стальной блеск */}
            <motion.div 
              animate={{ x: [-300, 600] }}
              transition={{ repeat: Infinity, duration: 3, ease: "linear", repeatDelay: 1 }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[35deg]"
            />
            {/* Текстура бортов */}
            <div className="absolute inset-0 opacity-10 flex gap-1 p-2">
              {[...Array(12)].map((_, i) => <div key={i} className="h-full w-1 bg-black rounded-full" />)}
            </div>
          </div>

          {/* Кабина (High-Detail) */}
          <div className="absolute -right-6 bottom-0 w-24 h-28 bg-[#1F212D] rounded-xl border border-white/10 shadow-2xl transform-style-3d translate-z-10">
             {/* Лобовое стекло */}
             <div className="absolute top-2 right-2 left-4 h-12 bg-sky-900/40 rounded-md border border-white/5 backdrop-blur-sm">
                <div className="absolute top-1 left-2 w-full h-[1px] bg-white/20 rotate-[15deg]" />
             </div>
             {/* Неоновая фара */}
             <div className="absolute bottom-6 -right-1 w-2 h-6 bg-orange-500 rounded-full shadow-[0_0_15px_#f97316]" />
          </div>
        </motion.div>

        {/* СТЕКЛЯННЫЙ ЛОГОТИП (Cinema Glass) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 100 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 1, duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
          className="relative px-20 py-12"
        >
          {/* Эффект матового стекла */}
          <div className="absolute inset-0 bg-white/[0.02] backdrop-blur-[40px] rounded-[3rem] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.6)]" />
          
          <div className="relative flex flex-col items-center">
            {/* Текст AGR с эффектом металла */}
            <motion.h1 
              className="text-8xl font-black text-white tracking-[0.3em] relative inline-block select-none"
              style={{ textShadow: "0 0 30px rgba(255,255,255,0.2)" }}
            >
              AGR
              <motion.span 
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -top-4 -right-8 text-xs font-bold text-orange-500 tracking-widest bg-orange-500/10 px-2 py-1 rounded-md border border-orange-500/20"
              >
                PRO
              </motion.span>
            </motion.h1>

            <div className="w-40 h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent my-6" />

            <p className="text-[#BDBFD1] text-xs font-bold uppercase tracking-[0.6em] text-center opacity-80">
              Warehouse Monitoring System
            </p>

            {/* Профессиональный индикатор загрузки */}
            <div className="mt-12 w-64 h-1 bg-white/5 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: "0%" }}
                 animate={{ width: "100%" }}
                 transition={{ duration: 3.5, ease: "easeInOut" }}
                 className="h-full bg-gradient-to-r from-[#1E7D7D] via-[#E89F64] to-[#1E7D7D] shadow-[0_0_15px_#E89F64]"
               />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* КИНЕМАТОГРАФИЧНЫЕ "ЧАСТИЦЫ ВОЗДУХА" */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              x: Math.random() * 100 + "%", 
              y: Math.random() * 100 + "%",
              opacity: 0,
              scale: Math.random() * 0.5
            }}
            animate={{ 
              y: [null, "-30%"],
              x: [null, (Math.random() - 0.5) * 50 + "px"],
              opacity: [0, 0.3, 0] 
            }}
            transition={{ 
              duration: 5 + Math.random() * 5, 
              repeat: Infinity, 
              ease: "linear"
            }}
            className="absolute w-1 h-1 bg-white rounded-full blur-[2px]"
          />
        ))}
      </div>

      {/* "АНАМОРФНЫЙ" ГОРИЗОНТАЛЬНЫЙ БЛИК (Кино-эффект) */}
      <div className="absolute top-1/2 left-0 w-full h-[1px] bg-blue-400/10 shadow-[0_0_100px_2px_rgba(59,130,246,0.2)]" />
    </motion.div>
  );
};

export default SplashScreen;
