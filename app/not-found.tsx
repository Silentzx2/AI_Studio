"use client";

import Link from 'next/link';
import { Box, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center overflow-hidden relative">
      
      {/* Animated Background Effects */}
      <div className="absolute inset-0 bg-mesh-gradient pointer-events-none" />
      
      {/* Pulsing Purple Blob */}
      <div 
        className="absolute top-1/2 left-1/2 w-[600px] h-[400px] bg-[hsl(var(--neon-purple)/0.05)] blur-[100px] rounded-full pointer-events-none"
        style={{ animation: 'pulse-glow 6s ease-in-out infinite' }}
      />

      {/* Scanning Line */}
      <div 
        className="absolute left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--neon-purple)/0.4)] to-transparent pointer-events-none z-20"
        style={{ animation: 'scan 6s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}
      />

      {/* Main Content Card with Rotating Border */}
      <div className="relative z-10 p-[1px] rounded-3xl glow-border">
        <div className="relative bg-background/80 backdrop-blur-xl rounded-3xl border border-[hsl(var(--border)/0.5)] p-10 sm:p-16 flex flex-col items-center gap-8 shadow-2xl">
          
          {/* Floating Icon */}
          <div 
            className="flex items-center justify-center w-20 h-20 rounded-2xl bg-[hsl(var(--neon-purple)/0.1)] border border-[hsl(var(--neon-purple)/0.2)] shadow-[0_0_30px_hsl(var(--neon-purple)/0.15)] animate-fade-up delay-100"
            style={{ animation: 'float 4s ease-in-out infinite, fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards', opacity: 0 }}
          >
            <Box className="w-10 h-10 text-[hsl(var(--neon-purple))]/80" />
          </div>

          {/* Text Content */}
          <div className="space-y-4">
            <p className="animate-fade-up delay-200 text-sm font-semibold text-[hsl(var(--neon-purple))] tracking-widest uppercase">
              404 Error
            </p>
            <h1 className="animate-fade-up delay-300 text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
              Page Not Found
            </h1>
            <p className="animate-fade-up delay-400 text-lg text-muted-foreground max-w-md leading-relaxed">
              Looks like this dimension does not exist yet. Try heading back to familiar territory.
            </p>
          </div>

          {/* Buttons */}
          <div className="animate-fade-up delay-500 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <Link href="/" className="w-full sm:w-auto group">
              <Button 
                variant="ghost" 
                className="w-full border border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--surface-2))] hover:border-foreground/20 transition-all duration-300 group-hover:-translate-x-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                Back to Home
              </Button>
            </Link>
            
            <Link href="/workspace" className="w-full sm:w-auto group">
              <Button 
                className="w-full bg-gradient-to-r from-[hsl(var(--neon-purple))] to-[hsl(var(--neon-blue))] text-[hsl(var(--foreground))] border-transparent shadow-[0_0_20px_hsl(var(--neon-purple)/0.3)] hover:shadow-[0_0_40px_hsl(var(--neon-purple)/0.5)] transition-all duration-300 hover:scale-105"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Open Workspace
              </Button>
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}