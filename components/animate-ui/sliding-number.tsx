'use client';

import * as React from 'react';
import { motion, useSpring, useTransform, useReducedMotion } from 'framer-motion';

export interface SlidingNumberProps {
  number?: number;
  value?: number;
  fromNumber?: number;
  decimalPlaces?: number;
  padStart?: boolean;
  minDigits?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  delay?: number;
}

function DigitRoller({ digit, height = 24 }: { digit: number; height?: number }) {
  const prefersReducedMotion = useReducedMotion();
  const spring = useSpring(digit, { stiffness: 220, damping: 24, mass: 0.5 });

  React.useEffect(() => {
    spring.set(digit);
  }, [digit, spring]);

  const y = useTransform(spring, (latest) => -latest * height);

  if (prefersReducedMotion) {
    return <span className="inline-block">{digit}</span>;
  }

  return (
    <span
      className="inline-block overflow-hidden relative"
      style={{ height: `${height}px`, width: '0.62em', verticalAlign: 'baseline' }}
    >
      <motion.span
        style={{ y, position: 'absolute', top: 0, left: 0, right: 0 }}
        className="flex flex-col items-center leading-none"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span
            key={n}
            className="flex items-center justify-center font-mono"
            style={{ height: `${height}px` }}
          >
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export const SlidingNumber: React.FC<SlidingNumberProps> = ({
  number,
  value,
  fromNumber,
  decimalPlaces = 0,
  padStart = false,
  minDigits = 1,
  prefix = '',
  suffix = '',
  className = '',
}) => {
  const targetVal = number ?? value ?? 0;
  const [currentVal, setCurrentVal] = React.useState<number>(() => fromNumber ?? targetVal);

  React.useEffect(() => {
    setCurrentVal(targetVal);
  }, [targetVal]);

  const formattedStr = React.useMemo(() => {
    if (isNaN(currentVal)) return '0';
    let valStr = decimalPlaces > 0 ? currentVal.toFixed(decimalPlaces) : Math.round(currentVal).toString();
    const [intPart, decPart] = valStr.split('.');
    let paddedInt = intPart;
    if (padStart && paddedInt.length < minDigits) {
      paddedInt = paddedInt.padStart(minDigits, '0');
    }
    return decPart !== undefined ? `${paddedInt}.${decPart}` : paddedInt;
  }, [currentVal, decimalPlaces, padStart, minDigits]);

  return (
    <span
      className={`inline-flex items-center font-mono tabular-nums select-none ${className}`}
      aria-label={`${prefix}${formattedStr}${suffix}`}
    >
      {prefix && <span>{prefix}</span>}
      {formattedStr.split('').map((char, index) => {
        if (char >= '0' && char <= '9') {
          return <DigitRoller key={index} digit={parseInt(char, 10)} />;
        }
        return (
          <span key={index} className="inline-block">
            {char}
          </span>
        );
      })}
      {suffix && <span>{suffix}</span>}
    </span>
  );
};
