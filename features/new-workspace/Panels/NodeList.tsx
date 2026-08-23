import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Layers, 
  Plus, 
  RefreshCw, 
  Sparkles, 
  Box, 
  Image as ImageIcon, 
  Activity, 
  Palette, 
  Share2, 
  HelpCircle,
  CheckCircle2,
  ChevronRight,
  Filter
} from 'lucide-react';
import { NodeDef } from '../types';

interface NodeListProps {
  onAddNode: (def: NodeDef, pos?: { x: number; y: number }) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const NodeList: React.FC<NodeListProps> = ({ onAddNode, isOpen, onToggle }) => {
  const [nodeDefs, setNodeDefs] = useState<NodeDef[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>('Node graph editor requires FastAPI backend. Using FastAPI generation endpoints instead.');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const loadDefinitions = async () => {
    setIsLoading(true);
    setLoadError('Node graph editor requires FastAPI backend. Using FastAPI generation endpoints instead.');
    setNodeDefs([]);
    setIsLoading(false);
  };

  useEffect(() => { loadDefinitions(); }, []);

  const categories = [
    { id: 'all', label: 'All Nodes', icon: Layers },
    { id: '3d_generation', label: '3D Generation', icon: Box },
    { id: 'image', label: 'Image & RMBG', icon: ImageIcon },
    { id: 'retopology', label: 'Retopology', icon: Activity },
    { id: 'texturing', label: 'PBR Textures', icon: Palette },
    { id: 'animation', label: 'Animation', icon: Sparkles },
    { id: 'preview', label: 'Preview & Export', icon: Share2 }
  ];

  const filteredNodes = nodeDefs.filter(node => {
    const matchesSearch = 
      (node.displayName || node.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.category.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedCategory === 'all') return true;
    if (selectedCategory === '3d_generation') return node.category.includes('3d') || node.category.includes('generation');
    if (selectedCategory === 'image') return node.category.includes('image') || node.category.includes('mask');
    if (selectedCategory === 'retopology') return node.category.includes('retopo') || node.category.includes('mesh');
    if (selectedCategory === 'texturing') return node.category.includes('texture') || node.category.includes('pbr') || node.category.includes('material');
    if (selectedCategory === 'animation') return node.category.includes('anim') || node.category.includes('motion') || node.category.includes('rig');
    if (selectedCategory === 'preview') return node.category.includes('preview') || node.category.includes('export') || node.category.includes('save');

    return node.category.toLowerCase() === selectedCategory.toLowerCase();
  });

  const getSocketColor = (typeStr: string) => {
    const t = typeStr.toUpperCase();
    if (t.includes('IMAGE') || t.includes('MASK')) return '#60a5fa'; // Blue
    if (t.includes('MESH') || t.includes('3D')) return '#f5c518'; // Yellow
    if (t.includes('TEXTURE') || t.includes('MATERIAL') || t.includes('PBR')) return '#ec4899'; // Pink
    if (t.includes('ANIMATION') || t.includes('MOTION')) return '#a78bfa'; // Purple
    return '#9ca3af';
  };

  if (!isOpen) {
    return (
      <div className="absolute left-4 top-16 z-30">
        <button
          onClick={onToggle}
          title="Open FastAPI Node Library"
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#181a22]/95 border border-[#2e3342] text-xs font-semibold text-[#f3f4f6] hover:text-[#f5c518] hover:border-[#f5c518]/50 backdrop-blur-md shadow-2xl transition-all"
        >
          <Layers className="w-4 h-4 text-[#f5c518]" />
          <span>Nodes Library ({nodeDefs.length})</span>
        </button>
      </div>
    );
  }

  return (
    <div 
      id="ws-node-list-sidebar" 
      className="absolute left-4 top-16 bottom-6 w-80 bg-[#13151b]/95 backdrop-blur-md border border-[#272c3a] rounded-2xl shadow-2xl flex flex-col z-30 select-none overflow-hidden"
    >
      {/* Header */}
      <div className="p-3 border-b border-[#242834] flex items-center justify-between bg-[#181a22]/80">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#f5c518]" />
          <span className="font-bold text-xs text-[#f3f4f6]">Node Definitions</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#232733] text-[#f5c518]">
            {filteredNodes.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={loadDefinitions}
            title="Refresh node definitions from /object_info"
            className={`p-1.5 rounded-lg text-[#8e95a5] hover:text-[#f3f4f6] hover:bg-[#232733] transition-colors ${
              isLoading ? 'animate-spin text-[#f5c518]' : ''
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggle}
            className="px-2 py-1 rounded-lg text-[11px] text-[#8e95a5] hover:text-[#f3f4f6] hover:bg-[#232733] transition-colors"
          >
            Hide
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-[#242834] bg-[#111217]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#6b7280]" />
          <input
            type="text"
            placeholder="Search /object_info nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#181a22] border border-[#2b3040] text-xs text-[#e5e7eb] placeholder-[#6b7280] outline-none focus:border-[#f5c518]"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                selectedCategory === cat.id
                  ? 'bg-[#f5c518] text-[#111216] font-bold shadow-sm'
                  : 'bg-[#181a22] text-[#8e95a5] hover:text-[#cbd5e1] hover:bg-[#232733]'
              }`}
            >
              <cat.icon className="w-3 h-3" />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Nodes Scrollable List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-[#8e95a5] text-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-[#f5c518] mb-2" />
            <span>Fetching /object_info schema...</span>
          </div>
        ) : loadError ? (
          <div className="py-12 text-center text-[#9ca3af] text-xs space-y-2 px-4">
            <div className="text-[#ef4444] font-semibold">Node registry unavailable</div>
            <div>{loadError}</div>
            <div className="text-[#6b7280]">Start FastAPI and ensure /object_info is reachable.</div>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="py-12 text-center text-[#6b7280] text-xs">
            No matching nodes found.
          </div>
        ) : (
          filteredNodes.map((def) => {
            const isExpanded = expandedNodeId === def.id;

            return (
              <div
                key={def.id}
                id={`ws-node-def-${def.id}`}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(def));
                  e.dataTransfer.setData('text/plain', def.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="group p-2.5 rounded-xl bg-[#161821] hover:bg-[#1c1f2b] border border-[#262a38] hover:border-[#3d4458] transition-all cursor-grab active:cursor-grabbing"
              >
                {/* Node Title & Category Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-[#f3f4f6] truncate group-hover:text-[#f5c518] transition-colors">
                        {def.displayName || def.name}
                      </span>
                    </div>
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-[#212532] text-[#8e95a5] mt-1 inline-block">
                      {def.category}
                    </span>
                  </div>

                  <button
                    onClick={() => onAddNode(def)}
                    title="Add Node to Graph Canvas"
                    className="px-2 py-1 rounded-lg bg-[#232836] hover:bg-[#f5c518] text-[#cbd5e1] hover:text-[#111216] text-[10px] font-bold flex items-center gap-1 transition-all shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Short description */}
                <p className="text-[10px] text-[#8e95a5] mt-1.5 line-clamp-2 leading-relaxed">
                  {def.description}
                </p>

                {/* Sockets / Inputs & Outputs summary */}
                <div className="mt-2 pt-2 border-t border-[#232734] flex items-center justify-between text-[9px] font-mono">
                  {/* Inputs */}
                  <div className="flex items-center gap-1 flex-wrap max-w-[50%]">
                    <span className="text-[#6b7280]">In:</span>
                    {def.inputs.slice(0, 3).map((inp, i) => (
                      <span
                        key={i}
                        className="px-1 py-0.5 rounded bg-[#101217] text-[#93c5fd] truncate max-w-[60px]"
                        title={`${inp.name} (${inp.type})`}
                      >
                        {inp.name}
                      </span>
                    ))}
                    {def.inputs.length > 3 && (
                      <span className="text-[#6b7280]">+{def.inputs.length - 3}</span>
                    )}
                  </div>

                  {/* Outputs */}
                  <div className="flex items-center gap-1 flex-wrap max-w-[50%] justify-end">
                    <span className="text-[#6b7280]">Out:</span>
                    {def.outputs.slice(0, 3).map((out, i) => (
                      <span
                        key={i}
                        className="px-1 py-0.5 rounded bg-[#101217] text-[#fcd34d] truncate max-w-[60px]"
                        title={`${out.name} (${out.type})`}
                      >
                        {out.name}
                      </span>
                    ))}
                    {def.outputs.length > 3 && (
                      <span className="text-[#6b7280]">+{def.outputs.length - 3}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
