"use client";


// import { useRef, useEffect, useMemo } from 'react';
import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedBackgroundProps {
  blobs?: boolean;
  grid?: boolean;
  particles?: boolean;
  opacity?: number;
  className?: string;
}

const BLOB_CONFIGS = [
  { color: 'hsl(var(--neon-purple))', size: 400, x: '15%', y: '20%', duration: 25, delay: 0, blur: 120, opacity: 0.08 },
  { color: 'hsl(var(--neon-blue))', size: 350, x: '70%', y: '60%', duration: 30, delay: -8, blur: 110, opacity: 0.06 },
];

const PARTICLE_COLORS = [
  'rgba(168, 85, 247,',
  'rgba(59, 130, 246,',
  'rgba(34, 211, 238,',
];

function ParticleCanvas({ opacity }: { opacity: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationId: number;
    let particles: Array<{
      x: number; y: number;
      vx: number; vy: number;
      size: number;
      color: string;
      baseOpacity: number;
      pulsePhase: number;
      pulseSpeed: number;
    }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Reduced from ~40 to 12 particles
      const count = 12;
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        size: Math.random() * 1.5 + 0.5,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        baseOpacity: Math.random() * 0.3 + 0.1,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.4 + Math.random() * 0.6,
      }));
    };

    resize();
    window.addEventListener('resize', resize);

    let lastTime = performance.now();

    const animate = (now: number) => {
      const delta = now - lastTime;
      // Throttle to ~30fps for background particles — saves ~50% CPU
      if (delta < 33) {
        animationId = requestAnimationFrame(animate);
        return;
      }
      lastTime = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        const time = now * 0.001;
        const pulse = Math.sin(time * p.pulseSpeed + p.pulsePhase) * 0.15 + 1;
        const currentOpacity = Math.min(1, p.baseOpacity * pulse * opacity);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + currentOpacity + ')';
        ctx.fill();
      }

      // REMOVED: O(n²) particle connection lines — this was the biggest CPU hog

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [opacity]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
      style={{ opacity: 0.5 * opacity }}
    />
  );
}

export default function AnimatedBackground({
  blobs = true,
  grid = false,
  particles = true,
  opacity = 1,
  className,
}: AnimatedBackgroundProps) {
  return (
    <div className={cn('absolute inset-0 pointer-events-none z-0 overflow-hidden', className)}>
      {/* Gradient blobs — reduced from 5 to 2, with will-change + contain */}
      {blobs && BLOB_CONFIGS.map((blob, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: blob.size,
            height: blob.size,
            left: blob.x,
            top: blob.y,
            background: blob.color,
            filter: `blur(${blob.blur}px)`,
            opacity: blob.opacity * opacity,
            willChange: 'transform',
            contain: 'layout style paint',
          }}
          animate={{
            x: [0, 20, -15, 10, 0],
            y: [0, -15, 10, -8, 0],
            scale: [1, 1.03, 0.97, 1.01, 1],
          }}
          transition={{
            duration: blob.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: blob.delay,
          }}
        />
      ))}

      {grid && (
        <div
          className="absolute inset-0 bg-grid"
          style={{ opacity: 0.4 * opacity }}
        />
      )}

      {particles && <ParticleCanvas opacity={opacity} />}
    </div>
  );
}