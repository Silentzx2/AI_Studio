"use client";


import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

interface ParallaxElementProps {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}

export function ParallaxElement({
  children,
  speed = 0.5,
  className,
}: ParallaxElementProps) {
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const yRange = 100 * speed;
  const y = useTransform(scrollYProgress, [0, 1], [yRange, -yRange]);

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        y,
        willChange: 'transform',
      }}
    >
      {children}
    </motion.div>
  );
}