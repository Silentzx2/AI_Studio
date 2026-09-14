'use client';

import React from 'react';
import {
  Sparkles,
  Bone,
  Move,
  Sliders,
  Download,
  ChevronRight,
} from 'lucide-react';
import { useAnimationStore } from '@/stores/useAnimationStore';
import { useWorkspace } from '../store/WorkspaceContext';

export const AnimationBottomDock: React.FC = () => {
  const { setActiveMode, setInspectorTab } = useAnimationStore();
  const { setIsExportModalOpen } = useWorkspace();

  const cards = [
    {
      id: 'motion_ai',
      title: 'AI Motion Generator',
      subtitle: 'Text to 3D Animation (ARDY)',
      icon: Sparkles,
      iconColor: 'text-indigo-400',
      iconBg: 'bg-indigo-500/15 border-indigo-500/30 group-hover:bg-indigo-500/25',
      borderColor: 'hover:border-indigo-500/40',
      action: () => {
        setActiveMode('motion_ai');
        setInspectorTab('animation');
      },
    },
    {
      id: 'rigging',
      title: 'Auto Rig',
      subtitle: 'One-click character rigging',
      icon: Bone,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/15 border-emerald-500/30 group-hover:bg-emerald-500/25',
      borderColor: 'hover:border-emerald-500/40',
      action: () => {
        setActiveMode('rigging');
        setInspectorTab('rigging');
      },
    },
    {
      id: 'pose',
      title: 'Pose Editor',
      subtitle: 'Edit and create poses',
      icon: Move,
      iconColor: 'text-sky-400',
      iconBg: 'bg-sky-500/15 border-sky-500/30 group-hover:bg-sky-500/25',
      borderColor: 'hover:border-sky-500/40',
      action: () => {
        setActiveMode('animate');
        setInspectorTab('animation');
      },
    },
    {
      id: 'blend',
      title: 'Animation Mixer',
      subtitle: 'Blend multiple animations',
      icon: Sliders,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/15 border-amber-500/30 group-hover:bg-amber-500/25',
      borderColor: 'hover:border-amber-500/40',
      action: () => {
        setActiveMode('blend');
        setInspectorTab('animation');
      },
    },
    {
      id: 'export',
      title: 'Bake & Export',
      subtitle: 'Export GLB / FBX animation',
      icon: Download,
      iconColor: 'text-yellow-400',
      iconBg: 'bg-yellow-500/15 border-yellow-500/30 group-hover:bg-yellow-500/25',
      borderColor: 'hover:border-yellow-500/40',
      action: () => {
        setIsExportModalOpen(true);
      },
    },
  ];

  return (
    <div className="px-4 py-2.5 bg-[#0D0E12] border-t border-white/[0.08] grid grid-cols-2 md:grid-cols-5 gap-3 flex-shrink-0 z-10">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            onClick={card.action}
            className={`p-3 rounded-xl bg-[#14161C] hover:bg-[#1A1D24] border border-white/[0.08] ${card.borderColor} transition-all duration-200 flex items-center justify-between text-left group cursor-pointer shadow-sm min-w-0`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${card.iconBg}`}
              >
                <Icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <h5 className="text-xs font-bold text-white group-hover:text-[#F9CF00] transition-colors truncate">
                  {card.title}
                </h5>
                <p className="text-[11px] text-zinc-400 truncate leading-tight">
                  {card.subtitle}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white flex-shrink-0 ml-1.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        );
      })}
    </div>
  );
};
