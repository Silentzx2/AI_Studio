"use client";


import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronDown, ChevronUp, Shuffle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { PROMPT_SUGGESTIONS } from '@/constants';

export function PromptInput() {
  const { prompt, setPrompt, negativePrompt, setNegativePrompt } = useGenerationStore();
  const [showNegative, setShowNegative] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const randomPrompt = () => {
    const random = PROMPT_SUGGESTIONS[Math.floor(Math.random() * PROMPT_SUGGESTIONS.length)];
    setPrompt(random.text);
  };

  return (
    <div className="space-y-2">
      <div className="relative group">
        {/* Animated gradient border wrapper */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-[hsl(var(--neon-purple)/0)] via-[hsl(var(--neon-blue)/0)] to-[hsl(var(--neon-purple)/0)] group-focus-within:from-[hsl(var(--neon-purple)/0.4)] group-focus-within:via-[hsl(var(--neon-blue)/0.3)] group-focus-within:to-[hsl(var(--neon-purple)/0.4)] transition-all duration-500 opacity-0 group-focus-within:opacity-100 -z-10" />
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your 3D model in detail..."
          className="min-h-[80px] resize-none input-premium text-xs placeholder:text-muted-foreground/25 pr-10 relative z-10"
          maxLength={600}
        />
        <div className="absolute bottom-2.5 right-3 z-20">
          <span className="text-[9px] font-mono transition-opacity duration-500 bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, hsl(var(--neon-purple)/0.6), hsl(var(--neon-blue)/0.6))', opacity: 0.6 }}>({prompt.length}<span style={{ opacity: 0.5 }}>/600</span>)</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button onClick={() => setShowSuggestions(!showSuggestions)} className={showSuggestions ? 'chip chip-active' : 'chip'}>
          <Sparkles className="w-2.5 h-2.5" />
          Ideas
          {showSuggestions ? <ChevronUp className="w-2.5 h-2.5 ml-0.5" /> : <ChevronDown className="w-2.5 h-2.5 ml-0.5" />}
        </button>
        <button onClick={randomPrompt} className="chip">
          <Shuffle className="w-2.5 h-2.5" />
          Random
        </button>
      </div>

      <AnimatePresence>
        {showSuggestions && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap gap-1.5 py-1">
              {PROMPT_SUGGESTIONS.length === 0 && (
                <span className="text-[10px] text-muted-foreground/30 px-2 py-1">Loading suggestions...</span>
              )}
              {PROMPT_SUGGESTIONS.map((s: { text: string; icon?: string }, i: number) => (
                <motion.button
                  key={s.text}
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                  onClick={() => { setPrompt(s.text); setShowSuggestions(false); }}
                  className="chip hover:shadow-[0_0_10px_hsl(var(--neon-purple)/0.08)] hover:border-[hsl(var(--neon-purple)/0.2)] group/chip"
                >
                  <span>{s.icon}</span>
                  <span className="truncate max-w-[140px]">{s.text}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}