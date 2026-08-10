"use client";

import { useEffect, useRef } from "react";

/**
 * Soft radial glow that trails the cursor. Purely decorative:
 * pointer-events-none + fixed positioning, follows the mouse with a small
 * lerp so it feels fluid rather than glued. Mount once near the app root.
 */
export default function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip on touch / coarse pointers — there is no cursor to follow.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    // Respect reduced motion preferences.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };

    const loop = () => {
      x += (tx - x) * 0.15;
      y += (ty - y) * 0.15;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-[520px] w-[520px] rounded-full"
      style={{
        background:
          "radial-gradient(circle, hsl(var(--primary) / 0.10) 0%, hsl(var(--neon-blue) / 0.06) 35%, transparent 62%)",
        mixBlendMode: "screen",
        willChange: "transform",
      }}
    />
  );
}
