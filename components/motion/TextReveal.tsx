"use client";

import { motion, useInView, cubicBezier } from 'framer-motion';
import { useRef } from 'react';

interface TextRevealProps {
  text: string;
  className?: string;
  delay?: number;
  mode?: 'chars' | 'words';
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
}

const containerVariants = {
  hidden: {},
  visible: (delay: number) => ({
    transition: {
      staggerChildren: 0.03,
      delayChildren: delay,
    },
  }),
};

const itemVariants = {
  hidden: {
    opacity: 0,
    y: 12,
    filter: 'blur(4px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.4,
    },
  },
};

type TextTag = NonNullable<TextRevealProps['as']>;

const motionTags: Record<TextTag, any> = {
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  p: motion.p,
  span: motion.span,
};

export function TextReveal({
  text,
  className,
  delay = 0,
  mode = 'words',
  as: Tag = 'p',
}: TextRevealProps) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  const pieces = mode === 'chars' ? text.split('') : text.split(' ');

  const MotionTag = motionTags[Tag];

  return (
    <MotionTag
      ref={ref}
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      custom={delay}
      style={{ willChange: 'transform, opacity' }}
      aria-label={text}
    >
      {pieces.map((piece, index) => (
        <motion.span
          key={`${piece}-${index}`}
          variants={itemVariants}
          className="inline-block"
          style={{ willChange: 'transform, opacity' }}
        >
          {piece}
          {mode === 'words' && index < pieces.length - 1 ? '\u00A0' : ''}
        </motion.span>
      ))}
    </MotionTag>
  );
}