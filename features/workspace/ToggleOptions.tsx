'use client';

import { Palette, GitBranch, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { STYLE_PRESETS } from '@/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

function ToggleRow({ icon: Icon, label, description, checked, onCheckedChange }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; description: string; checked: boolean; onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-2 -mx-2 rounded-xl hover:bg-[hsl(var(--surface-2)/0.25)] transition-all duration-200 group">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn(
          'flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-all duration-300',
          'border',
          checked
            ? 'bg-gradient-to-br from-[hsl(var(--neon-purple)/0.15)] to-[hsl(var(--neon-blue)/0.1)] border-[hsl(var(--neon-purple)/0.25)] shadow-[0_0_10px_hsl(var(--neon-purple)/0.15)]'
            : 'bg-gradient-to-br from-[hsl(var(--surface-2)/0.6)] to-[hsl(var(--surface-2)/0.2)] border-[hsl(var(--border)/0.2)] group-hover:border-[hsl(var(--border)/0.35)]'
        )}>
          <Icon className={cn('w-3.5 h-3.5 transition-all duration-200', checked ? 'text-[hsl(var(--neon-purple))] drop-shadow-[0_0_4px_hsl(var(--neon-purple)/0.5)]' : 'text-muted-foreground/60 group-hover:text-muted-foreground')} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn('text-xs font-medium', checked ? 'text-foreground' : 'text-foreground')}>{label}</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors" /></TooltipTrigger>
                <TooltipContent className="max-w-[200px] text-xs">{description}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
      <div className={cn('transition-shadow duration-300', checked ? 'shadow-[0_0_10px_hsl(var(--neon-purple)/0.25)] rounded-full' : '')}>
        <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0 data-[state=checked]:bg-[hsl(var(--neon-purple))] data-[state=checked]:shadow-[0_0_12px_hsl(var(--neon-purple)/0.4)]" />
      </div>
    </div>
  );
}

export function ToggleOptions() {
  const { generateTexture, setGenerateTexture, autoRig, setAutoRig, stylePreset, setStylePreset } = useGenerationStore();

  return (
    <div className="space-y-1">
      <ToggleRow icon={Palette} label="Generate Texture" description="Automatically generate PBR materials including albedo, roughness, metallic, and normal maps." checked={generateTexture} onCheckedChange={setGenerateTexture} />
      <ToggleRow icon={GitBranch} label="Auto Rig" description="Automatically create an animation-ready skeleton with skin weights. Best for characters and creatures." checked={autoRig} onCheckedChange={setAutoRig} />
      <div className="flex items-center justify-between gap-3 p-2 -mx-2 rounded-xl hover:bg-[hsl(var(--surface-2)/0.25)] transition-all duration-200">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-[hsl(var(--surface-2)/0.6)] to-[hsl(var(--surface-2)/0.2)] border border-[hsl(var(--border)/0.2)] shrink-0">
            <span className="text-xs">🎨</span>
          </div>
          <p className="text-xs font-medium text-foreground">Style Preset</p>
        </div>
        <Select value={stylePreset} onValueChange={setStylePreset}>
          <SelectTrigger className="w-[110px] h-7 text-xs input-premium !rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent className="glass-ultra border-[hsl(var(--border)/0.35)] shadow-premium-lg">
            {STYLE_PRESETS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}