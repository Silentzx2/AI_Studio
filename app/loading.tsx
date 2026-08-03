import { Box } from 'lucide-react';

export default function Loading() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      
      {/* --- CINEMATIC BACKGROUNDS --- */}
      {/* Deep Purple Radial */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--neon-purple)/0.1),transparent_70%)]" />
      
      {/* Anamorphic Lens Flare (Horizontal Streaks) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-px bg-gradient-to-r from-transparent via-[hsl(var(--neon-cyan)/0.6)] to-transparent blur-sm" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent blur-md" />
      
      {/* Grid Floor */}
      <div className="absolute inset-0 opacity-20 bg-[linear-gradient(hsl(var(--neon-purple)/0.3)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--neon-purple)/0.3)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />

      {/* Ambient Blurs */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-[hsl(var(--neon-purple)/0.15)] blur-[140px] animate-pulse" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-[hsl(var(--neon-cyan)/0.1)] blur-[140px] animate-pulse" style={{ animationDelay: '1s' }} />

      {/* --- MAIN LOADING HUD --- */}
      <div className="relative flex flex-col items-center z-10">
        
        {/* HUD Container with Corner Brackets */}
        <div className="relative p-10 md:p-16">
          {/* Top Left Bracket */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[hsl(var(--neon-purple)/0.5)]" />
          {/* Top Right Bracket */}
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[hsl(var(--neon-purple)/0.5)]" />
          {/* Bottom Left Bracket */}
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[hsl(var(--neon-cyan)/0.5)]" />
          {/* Bottom Right Bracket */}
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[hsl(var(--neon-cyan)/0.5)]" />

          {/* --- HOLOGRAPHIC RING SYSTEM --- */}
          <div className="relative flex items-center justify-center w-44 h-44 md:w-52 md:h-52">
            
            {/* Outer Tech Ring (Dashed) */}
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-[hsl(var(--neon-purple)/0.3)] animate-spin" style={{ animationDuration: '15s' }} />
            
            {/* Middle Targeting Ring (Dotted) */}
            <div className="absolute inset-4 rounded-full border-2 border-dotted border-[hsl(var(--neon-cyan)/0.4)] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '10s' }} />

            {/* Inner Data Ring (Solid with gap illusion) */}
            <div className="absolute inset-8 rounded-full border border-[hsl(var(--neon-pink)/0.5)] shadow-[0_0_15px_hsl(var(--neon-pink)/0.2)] animate-spin" style={{ animationDuration: '3s' }} />

            {/* Core Icon Container */}
            <div className="relative z-10 flex items-center justify-center w-20 h-20 rounded-xl bg-black/40 backdrop-blur-xl border border-white/10 overflow-hidden shadow-[0_0_50px_hsl(var(--neon-purple)/0.4)]">
              {/* Scanning line passing over the icon */}
              <div className="absolute left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--neon-cyan))] to-transparent" style={{ animation: 'box-scan 2s linear infinite' }} />
              
              {/* The Box Icon with Hologram effect */}
              <Box 
                className="w-10 h-10 text-[hsl(var(--neon-purple))]" 
                style={{ animation: 'holo-shimmer 4s ease-in-out infinite' }} 
              />
            </div>
          </div>
        </div>

        {/* --- CYBERPUNK TYPOGRAPHY --- */}
        <h1 
          className="text-3xl md:text-4xl font-bold tracking-tighter text-gradient cyber-glitch"
          data-text="AI 3D Studio"
        >
          AI 3D Studio
        </h1>
        
        <div className="mt-3 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-cyan))] animate-pulse" />
          <p className="text-xs md:text-sm text-muted-foreground tracking-[0.3em] uppercase font-mono">
            Initializing Neural Engine...
          </p>
        </div>

        {/* --- DATA STREAM PROGRESS BAR --- */}
        <div className="mt-10 w-72 md:w-80 h-1.5 overflow-hidden rounded-full bg-white/5 border border-white/5 relative">
          {/* The sliding gradient light */}
          <div 
            className="absolute top-0 left-0 h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-[hsl(var(--neon-purple))] to-transparent"
            style={{ animation: 'data-stream 1.5s ease-in-out infinite' }}
          />
          {/* Glowing head */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_10px_hsl(var(--neon-purple)),0_0_20px_hsl(var(--neon-purple))]"
            style={{ animation: 'data-stream 1.5s ease-in-out infinite' }}
          />
        </div>

        {/* --- SYSTEM STATUS --- */}
        <div className="mt-6 flex items-center gap-6 text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
            Sys.Online
          </span>
          <span className="text-white/20">|</span>
          <span>Loading Assets... 47%</span>
        </div>
      </div>
    </div>
  );
}