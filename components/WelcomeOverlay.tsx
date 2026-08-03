"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const FEATURES = [
  {
    emoji: '🎨',
    title: 'Describe',
    description: 'Type a text prompt or upload an image',
  },
  {
    emoji: '⚡',
    title: 'Generate',
    description: 'AI creates your 3D model in seconds',
  },
  {
    emoji: '📦',
    title: 'Export',
    description: 'Download in GLB, OBJ, FBX, STL formats',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, damping: 22, stiffness: 280, mass: 0.8 },
  },
} as const;

const featureCardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.93 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, damping: 24, stiffness: 260, mass: 0.8 },
  },
} as const;

// Floating particle positions
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  size: Math.random() * 3 + 1,
  x: `${Math.random() * 100}%`,
  y: `${Math.random() * 100}%`,
  duration: Math.random() * 8 + 6,
  delay: Math.random() * 4,
}));

export function WelcomeOverlay() {
  const [show, setShow] = useState(false);

  const dismiss = useCallback(() => {
    setShow(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai3d-welcomed', 'true');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const welcomed = localStorage.getItem('ai3d-welcomed');
    if (!welcomed) {
      // Small delay so the workspace renders first
      const timer = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Escape key to dismiss
  useEffect(() => {
    if (!show) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [show, dismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* Background */}
          <div className="absolute inset-0 bg-mesh-gradient-strong" />

          {/* Floating particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {PARTICLES.map((p) => (
              <motion.div
                key={p.id}
                className="absolute rounded-full bg-[hsl(var(--neon-purple)/0.3)]"
                style={{
                  width: p.size,
                  height: p.size,
                  left: p.x,
                  top: p.y,
                }}
                animate={{
                  y: [0, -30, 0],
                  opacity: [0.2, 0.6, 0.2],
                }}
                transition={{
                  duration: p.duration,
                  repeat: Infinity,
                  delay: p.delay,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>

          {/* Glass backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
          />

          {/* Card */}
          <motion.div
            className="relative w-full max-w-lg glass-ultra glow-border shadow-premium-lg rounded-2xl p-8 mx-4 text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Close button */}
            <button
              onClick={dismiss}
              className="absolute top-4 right-4 flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-200"
              aria-label="Close welcome"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Title */}
            <motion.h1
              className="text-3xl sm:text-4xl font-bold text-gradient-shimmer mb-3"
              variants={itemVariants}
            >
              AI 3D Studio
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              className="text-muted-foreground text-sm sm:text-base mb-8"
              variants={itemVariants}
            >
              Welcome to the future of 3D creation
            </motion.p>

            {/* Feature highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {FEATURES.map((feature) => (
                <motion.div
                  key={feature.title}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.03] border border-[hsl(var(--border)/0.3)] hover:bg-white/[0.06] transition-colors duration-200"
                  variants={featureCardVariants}
                >
                  <span className="text-2xl">{feature.emoji}</span>
                  <span className="font-semibold text-sm text-foreground">{feature.title}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{feature.description}</span>
                </motion.div>
              ))}
            </div>

            {/* Get Started Button */}
            <motion.div variants={itemVariants} className="flex flex-col items-center gap-3">
              <motion.button
                onClick={dismiss}
                className="relative inline-flex items-center justify-center h-12 px-8 rounded-xl font-semibold text-sm text-white border-0 cursor-pointer overflow-hidden"
                style={{
                  boxShadow: '0 0 20px hsl(var(--neon-purple)) / 0.3, 0 0 40px hsl(var(--neon-purple)) / 0.1',
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(135deg, hsl(var(--neon-purple)), hsl(var(--neon-blue)), hsl(var(--neon-purple)))',
                    backgroundSize: '200% 100%',
                    animation: 'gradient-pan 4s ease infinite',
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none rounded-xl"
                  style={{
                    padding: '1px',
                    background: 'linear-gradient(135deg, hsl(var(--neon-purple)) / 0.8, hsl(var(--neon-blue)) / 0.4, hsl(var(--neon-purple)) / 0.6)',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                  }}
                />
                {/* Pulse glow */}
                <motion.div
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  animate={{
                    boxShadow: [
                      '0 0 15px hsl(var(--neon-purple)) / 0.2, 0 0 30px hsl(var(--neon-purple)) / 0.05',
                      '0 0 25px hsl(var(--neon-purple)) / 0.35, 0 0 50px hsl(var(--neon-purple)) / 0.1',
                      '0 0 15px hsl(var(--neon-purple)) / 0.2, 0 0 30px hsl(var(--neon-purple)) / 0.05',
                    ],
                  }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span className="relative z-10">Get Started</span>
              </motion.button>

              <p className="text-xs text-muted-foreground/50">
                <kbd className="inline-flex px-1.5 py-0.5 rounded bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] font-mono text-[10px]">⌘K</kbd>
                {' '}for quick actions
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}