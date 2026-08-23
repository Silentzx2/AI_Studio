import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Upload, 
  Image as ImageIcon, 
  Type,
  Crop, 
  Wand2, 
  Pencil, 
  ChevronDown, 
  ChevronRight, 
  Zap, 
  Globe,
  Sliders,
  RefreshCw,
  FileText,
  Dices,
  Trash2,
  Lock,
  Unlock,
  AlertCircle,
  Info,
  X,
  ArrowRight
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

interface ModelArchitecture {
  id: 'hd' | 'triposr' | 'instantmesh' | 'large3d';
  name: string;
  sub: string;
  badge: string;
  supportsTextTo3D: boolean;
  supportsImageTo3D: boolean;
  description: string;
  lockReason?: string;
}

const AI_MODELS: ModelArchitecture[] = [
  { 
    id: 'hd', 
    name: 'Hunyuan3D 2.0', 
    sub: 'High-Fidelity SOTA', 
    badge: 'Ultra', 
    supportsTextTo3D: true, 
    supportsImageTo3D: true,
    description: 'DiT Multi-View diffusion supporting both text prompts and reference images'
  },
  { 
    id: 'triposr', 
    name: 'TripoSR Fast', 
    sub: 'Instant ~1.5s', 
    badge: 'Fast', 
    supportsTextTo3D: false, 
    supportsImageTo3D: true,
    description: 'Feed-forward single-image reconstruction engine',
    lockReason: 'Requires reference image (Image-to-3D only)'
  },
  { 
    id: 'instantmesh', 
    name: 'InstantMesh', 
    sub: 'Multi-View LRM', 
    badge: 'Mesh', 
    supportsTextTo3D: false, 
    supportsImageTo3D: true,
    description: 'Large Reconstruction Model for high-density neural mesh extraction',
    lockReason: 'Requires reference image (Image-to-3D only)'
  },
  { 
    id: 'large3d', 
    name: 'Large-3D', 
    sub: 'High Polycount', 
    badge: 'Pro', 
    supportsTextTo3D: true, 
    supportsImageTo3D: true,
    description: 'Dense multi-view transformer for complex text prompts and multi-angle images'
  }
];

export const GeneratePanel: React.FC = () => {
  const { 
    isExecuting, 
    executionProgress, 
    executionStep,
    generateTextTo3D,
    generateImageTo3D,
    generationSettings,
    setGenerationSettings
  } = useWorkspace();

  const [generalSettingsOpen, setGeneralSettingsOpen] = useState(true);
  const [subAction, setSubAction] = useState<'upload' | 'crop' | 'wand' | 'edit'>('upload');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  
  // Toggles & Settings
  const [ultraMeshQuality, setUltraMeshQuality] = useState(true);
  const [texture8k, setTexture8k] = useState(false);
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [privacyMenuOpen, setPrivacyMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const samplePrompts = [
    'A fierce goblin warrior with spiked steel shoulder armor and glowing amber eyes',
    'Futuristic cybernetic drone with sleek matte-carbon body and blue neon thrusters',
    'Medieval stone watchtower covered in creeping ivy and wooden roof beams',
    'Stylized low-poly fantasy treasure chest with gold trim and glowing gemstones'
  ];

  const currentMode = generationSettings.mode || 'text-to-3d';
  const activeModelId = generationSettings.aiModel || 'hd';
  const activeModelObj = AI_MODELS.find(m => m.id === activeModelId) || AI_MODELS[0];
  
  // Check if current selected model does NOT support Text-to-3D
  const isCurrentModelTextTo3DLocked = !activeModelObj.supportsTextTo3D;

  // If user is on text-to-3d mode but active model does not support it, auto-resolve to Hunyuan3D 2.0
  useEffect(() => {
    if (currentMode === 'text-to-3d' && isCurrentModelTextTo3DLocked) {
      setGenerationSettings(prev => ({ ...prev, aiModel: 'hd' }));
      setNoticeMessage(`${activeModelObj.name} does not support Text-to-3D. Switched to Hunyuan3D 2.0.`);
    }
  }, [currentMode, isCurrentModelTextTo3DLocked, activeModelObj.name, setGenerationSettings]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setGenerationSettings(prev => ({
          ...prev,
          image: reader.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTextTo3DTabClick = () => {
    if (isCurrentModelTextTo3DLocked) {
      // Auto-unlock by switching architecture to Hunyuan3D 2.0
      setGenerationSettings(prev => ({ 
        ...prev, 
        mode: 'text-to-3d', 
        aiModel: 'hd' 
      }));
      setNoticeMessage('Switched architecture to Hunyuan3D 2.0 to unlock Text-to-3D prompt mode.');
    } else {
      setGenerationSettings(prev => ({ ...prev, mode: 'text-to-3d' }));
    }
  };

  const handleImageTo3DTabClick = () => {
    setGenerationSettings(prev => ({ ...prev, mode: 'image-to-3d' }));
  };

  const handleModelSelect = (model: ModelArchitecture) => {
    if (currentMode === 'text-to-3d' && !model.supportsTextTo3D) {
      // Model doesn't support text-to-3d: offer switch to image-to-3d or alert
      setGenerationSettings(prev => ({
        ...prev,
        aiModel: model.id,
        mode: 'image-to-3d'
      }));
      setNoticeMessage(`${model.name} is an Image-to-3D model. Switched to Image to 3D mode.`);
      return;
    }

    setGenerationSettings(prev => ({ ...prev, aiModel: model.id }));
  };

  const handleGenerate = () => {
    if (currentMode === 'text-to-3d') {
      if (isCurrentModelTextTo3DLocked) {
        setNoticeMessage(`${activeModelObj.name} does not support Text-to-3D. Please switch model or use Image-to-3D.`);
        return;
      }
      generateTextTo3D(generationSettings.prompt);
    } else {
      generateImageTo3D(generationSettings.image ?? undefined);
    }
  };

  return (
    <div id="panel-generate-model" className="flex flex-col h-full bg-[#101115] text-xs select-none">
      {/* Header title */}
      <div className="p-3.5 pb-2 border-b border-[#21242c]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#f5c518]" />
            <h2 className="text-sm font-bold text-[#f3f4f6]">Generate 3D Model</h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1c202a] text-[#f5c518] border border-[#f5c518]/20">
            FastAPI-3D
          </span>
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Notice Message Toast/Banner */}
        {noticeMessage && (
          <div className="p-2.5 rounded-xl bg-[#261f14] border border-[#f5c518]/50 text-[#f5c518] text-[11px] flex items-center justify-between gap-2 animate-in fade-in shadow-md">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Info className="w-3.5 h-3.5 flex-shrink-0 text-[#f5c518]" />
              <span className="leading-tight">{noticeMessage}</span>
            </div>
            <button 
              onClick={() => setNoticeMessage(null)}
              className="text-[#8e95a5] hover:text-[#f3f4f6] p-0.5 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Top Tab Switcher: Text to 3D vs Image to 3D */}
        <div className="space-y-1">
          <div className="flex items-center p-1 rounded-xl bg-[#181a22] border border-[#262a36]">
            {/* Tab 1: Text to 3D (With Lock status when active model doesn't support Text to 3D) */}
            <button
              id="tab-text-to-3d"
              onClick={handleTextTo3DTabClick}
              title={
                isCurrentModelTextTo3DLocked
                  ? `${activeModelObj.name} does not support Text-to-3D. Click to switch to Hunyuan3D 2.0 & unlock.`
                  : 'Generate 3D from Text Prompt'
              }
              className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all relative ${
                currentMode === 'text-to-3d'
                  ? 'bg-[#ffffff] text-[#111216] shadow-md'
                  : isCurrentModelTextTo3DLocked
                  ? 'text-[#848a97] hover:text-[#e5e7eb] hover:bg-[#20232e]'
                  : 'text-[#8e95a5] hover:text-[#e5e7eb]'
              }`}
            >
              {isCurrentModelTextTo3DLocked && currentMode !== 'text-to-3d' ? (
                <Lock className="w-3.5 h-3.5 text-[#ef4444]" />
              ) : (
                <Type className="w-3.5 h-3.5" />
              )}
              <span>Text to 3D</span>

              {isCurrentModelTextTo3DLocked && currentMode !== 'text-to-3d' && (
                <span className="text-[7.5px] font-mono px-1 py-0.2 rounded bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30">
                  Locked
                </span>
              )}
            </button>

            {/* Tab 2: Image to 3D (Always supported by TripoSR, InstantMesh, Hunyuan3D, Large-3D) */}
            <button
              id="tab-image-to-3d"
              onClick={handleImageTo3DTabClick}
              title="Reconstruct 3D mesh from Reference Image"
              className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                currentMode === 'image-to-3d'
                  ? 'bg-[#ffffff] text-[#111216] shadow-md'
                  : 'text-[#8e95a5] hover:text-[#e5e7eb]'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Image to 3D</span>
            </button>
          </div>

          {/* Helper caption if locked */}
          {isCurrentModelTextTo3DLocked && (
            <div className="px-1 flex items-center gap-1 text-[10px] text-[#ef4444]">
              <Lock className="w-2.5 h-2.5 flex-shrink-0" />
              <span>{activeModelObj.name} is Image-to-3D only. Click 'Text to 3D' to switch to Hunyuan3D.</span>
            </div>
          )}
        </div>

        {/* MODE 1: TEXT TO 3D */}
        {currentMode === 'text-to-3d' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* Prompt Input Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-[#cbd5e1] flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[#f5c518]" />
                  <span>Prompt Description</span>
                </label>
                <button
                  onClick={() => {
                    const random = samplePrompts[Math.floor(Math.random() * samplePrompts.length)];
                    setGenerationSettings(prev => ({ ...prev, prompt: random }));
                  }}
                  className="text-[10px] text-[#f5c518] hover:underline flex items-center gap-1"
                  title="Insert random sample prompt"
                >
                  <Dices className="w-3 h-3" />
                  <span>Surprise Me</span>
                </button>
              </div>

              <div className="relative">
                <textarea
                  id="input-text-to-3d-prompt"
                  value={generationSettings.prompt || ''}
                  onChange={(e) => setGenerationSettings(prev => ({ ...prev, prompt: e.target.value }))}
                  placeholder="Describe your 3D asset in detail (e.g., A menacing cybernetic goblin with glowing orange armor, high poly, highly detailed)..."
                  rows={4}
                  className="w-full p-2.5 rounded-xl bg-[#14161d] border border-[#272b38] focus:border-[#f5c518] outline-none text-xs text-[#e5e7eb] placeholder-[#6b7280] leading-relaxed resize-none transition-colors"
                />
                {generationSettings.prompt && (
                  <button
                    onClick={() => setGenerationSettings(prev => ({ ...prev, prompt: '' }))}
                    className="absolute right-2.5 bottom-2.5 text-[#6b7280] hover:text-[#ef4444] p-1"
                    title="Clear prompt"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick Inspiration Tags */}
            <div className="space-y-1">
              <span className="text-[10px] text-[#6b7280]">Quick Add Modifiers:</span>
              <div className="flex flex-wrap gap-1">
                {['Realistic PBR', 'Game Ready Low-Poly', 'Cinematic 8K', 'Stylized Fantasy', 'Subdivision Quad Mesh'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      const cur = generationSettings.prompt ? `${generationSettings.prompt}, ${tag}` : tag;
                      setGenerationSettings(prev => ({ ...prev, prompt: cur }));
                    }}
                    className="px-2 py-1 rounded-lg bg-[#181a22] hover:bg-[#232733] border border-[#272b38] text-[10px] text-[#8e95a5] hover:text-[#e5e7eb] transition-colors"
                  >
                    +{tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MODE 2: IMAGE TO 3D */}
        {currentMode === 'image-to-3d' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* Sub-Action Icon Bar (Upload, Crop, Wand, Edit) */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-[#181a22] border border-[#262a36]">
              <button
                onClick={() => { setSubAction('upload'); fileInputRef.current?.click(); }}
                title="Upload Reference Image"
                className={`p-1.5 rounded-lg transition-colors ${
                  subAction === 'upload' ? 'bg-[#272b38] text-[#f5c518]' : 'text-[#8e95a5] hover:text-[#f3f4f6]'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              <button
                onClick={() => setSubAction('crop')}
                title="Crop & Align Subject"
                className={`p-1.5 rounded-lg transition-colors ${
                  subAction === 'crop' ? 'bg-[#272b38] text-[#f5c518]' : 'text-[#8e95a5] hover:text-[#f3f4f6]'
                }`}
              >
                <Crop className="w-4 h-4" />
              </button>

              <button
                onClick={() => setSubAction('wand')}
                title="AI Image Enhance"
                className={`p-1.5 rounded-lg transition-colors ${
                  subAction === 'wand' ? 'bg-[#272b38] text-[#f5c518]' : 'text-[#8e95a5] hover:text-[#f3f4f6]'
                }`}
              >
                <Wand2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => setSubAction('edit')}
                title="Paint Mask / Edit"
                className={`p-1.5 rounded-lg transition-colors ${
                  subAction === 'edit' ? 'bg-[#272b38] text-[#f5c518]' : 'text-[#8e95a5] hover:text-[#f3f4f6]'
                }`}
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>

            {/* Image Dropzone Area with Checkerboard Background */}
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleFileUpload} 
            />
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="relative w-full aspect-video rounded-2xl border-2 border-dashed border-[#2f3442] hover:border-[#f5c518]/60 cursor-pointer overflow-hidden group transition-all flex flex-col items-center justify-center p-3"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, #151821 25%, transparent 25%), 
                  linear-gradient(-45deg, #151821 25%, transparent 25%), 
                  linear-gradient(45deg, transparent 75%, #151821 75%), 
                  linear-gradient(-45deg, transparent 75%, #151821 75%)
                `,
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                backgroundColor: '#0e1015'
              }}
            >
              {generationSettings.image ? (
                <div className="relative w-full h-full">
                  <img 
                    src={generationSettings.image} 
                    alt="Source reference" 
                    className="w-full h-full object-contain" 
                  />
                  <div className="absolute inset-0 bg-[#0c0d10]/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-semibold text-[#f5c518]">
                    Click to change reference image
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-1.5">
                  <div className="w-9 h-9 mx-auto rounded-full bg-[#1b1e27] border border-[#2b303d] flex items-center justify-center text-[#8e95a5] group-hover:text-[#f5c518] transition-colors">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div className="font-semibold text-xs text-[#cbd5e1]">Upload JPG, PNG, WEBP</div>
                  <div className="text-[10px] text-[#6b7280]">Drag reference image or click to browse</div>
                </div>
              )}
            </div>

            {/* Auto Remove Background Toggle */}
            <div className="p-2.5 rounded-xl bg-[#14161d] border border-[#242834] flex items-center justify-between">
              <div>
                <span className="text-xs text-[#cbd5e1] font-medium block">BiRefNet Alpha Matting</span>
                <span className="text-[10px] text-[#6b7280]">Isolates foreground subject with clean alpha mask</span>
              </div>
              <button
                onClick={() => setGenerationSettings(prev => ({ ...prev, removeBackground: !prev.removeBackground }))}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                  generationSettings.removeBackground !== false ? 'bg-[#f5c518]' : 'bg-[#282c38]'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-[#111216] transition-transform ${
                  generationSettings.removeBackground !== false ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>
        )}


        {/* AI Model Generator Choice (With Lock Indicators for models not supporting Text-to-3D) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-[#cbd5e1] flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-[#f5c518]" />
              <span>Generation Architecture</span>
            </label>
            <span className="text-[10px] text-[#8e95a5]">
              {currentMode === 'text-to-3d' ? 'Prompt Diffusion' : 'Image Reconstruction'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {AI_MODELS.map(m => {
              const isSelected = activeModelId === m.id;
              const isLockedInCurrentMode = currentMode === 'text-to-3d' && !m.supportsTextTo3D;

              return (
                <button
                  key={m.id}
                  onClick={() => handleModelSelect(m)}
                  title={
                    isLockedInCurrentMode
                      ? `${m.name} does not support Text-to-3D. Click to switch to Image-to-3D mode.`
                      : m.description
                  }
                  className={`p-2 rounded-xl text-left border transition-all relative ${
                    isLockedInCurrentMode
                      ? 'bg-[#181316] border-[#3f2127] text-[#8e95a5] hover:border-[#ef4444]/60'
                      : isSelected
                      ? 'bg-[#1e2230] border-[#f5c518] shadow-sm ring-1 ring-[#f5c518]/30'
                      : 'bg-[#14161d] border-[#252936] hover:border-[#3b4356] text-[#8e95a5]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 min-w-0">
                      {isLockedInCurrentMode && (
                        <Lock className="w-3 h-3 text-[#ef4444] flex-shrink-0" />
                      )}
                      <span className={`font-bold text-xs truncate ${
                        isLockedInCurrentMode 
                          ? 'text-[#fca5a5]' 
                          : isSelected 
                          ? 'text-[#f5c518]' 
                          : 'text-[#e5e7eb]'
                      }`}>
                        {m.name}
                      </span>
                    </div>

                    <span className={`text-[8px] font-mono px-1 rounded ${
                      isLockedInCurrentMode
                        ? 'bg-[#ef4444]/20 text-[#ef4444]'
                        : isSelected
                        ? 'bg-[#f5c518]/20 text-[#f5c518]'
                        : 'bg-[#232733] text-[#f3f4f6]'
                    }`}>
                      {isLockedInCurrentMode ? 'Img-Only' : m.badge}
                    </span>
                  </div>

                  <span className="text-[10px] text-[#6b7280] block mt-0.5 truncate">
                    {isLockedInCurrentMode ? 'Requires Image Input' : m.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accordion 1: General Settings */}
        <div className="border border-[#21242d] rounded-xl overflow-hidden bg-[#13151b]">
          <button
            onClick={() => setGeneralSettingsOpen(!generalSettingsOpen)}
            className="w-full px-3 py-2.5 flex items-center justify-between font-bold text-xs text-[#e5e7eb] hover:bg-[#181a22] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#f5c518]" />
              <span>General Mesh Settings</span>
            </div>
            {generalSettingsOpen ? <ChevronDown className="w-3.5 h-3.5 text-[#8e95a5]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#8e95a5]" />}
          </button>

          {generalSettingsOpen && (
            <div className="p-3 pt-1 border-t border-[#1e222b] space-y-2.5">
              {/* Ultra Mesh Quality Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#cbd5e1] font-medium block">Ultra Mesh Quality</span>
                  <span className="text-[10px] text-[#717786]">Dense multi-view voxel reconstruction</span>
                </div>
                <button
                  onClick={() => setUltraMeshQuality(!ultraMeshQuality)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                    ultraMeshQuality ? 'bg-[#f5c518]' : 'bg-[#282c38]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-[#111216] transition-transform ${
                    ultraMeshQuality ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* 8K Texture Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[#cbd5e1] font-medium">8K Texture Baking</span>
                    <span className="px-1 py-0.2 rounded bg-[#ef4444] text-white text-[8px] font-bold">Ultra</span>
                  </div>
                  <span className="text-[10px] text-[#717786]">High-res multi-channel PBR map generation</span>
                </div>
                <button
                  onClick={() => setTexture8k(!texture8k)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                    texture8k ? 'bg-[#f5c518]' : 'bg-[#282c38]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-[#111216] transition-transform ${
                    texture8k ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Quad Topology Checkbox */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#cbd5e1] font-medium block">Quad-Dominant Topology</span>
                  <span className="text-[10px] text-[#717786]">Subdivision-ready edge loop flow</span>
                </div>
                <button
                  onClick={() => setGenerationSettings(prev => ({ ...prev, quadTopology: !prev.quadTopology }))}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                    generationSettings.quadTopology !== false ? 'bg-[#f5c518]' : 'bg-[#282c38]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-[#111216] transition-transform ${
                    generationSettings.quadTopology !== false ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Privacy Setting (Public / Private) */}
              <div className="flex items-center justify-between pt-1 border-t border-[#1e212a]">
                <div className="flex items-center gap-1.5 text-xs text-[#9ca3af]">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Privacy</span>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setPrivacyMenuOpen(!privacyMenuOpen)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#191b22] border border-[#282c38] text-[11px] font-semibold text-[#e5e7eb] hover:border-[#f5c518]/50 transition-colors"
                  >
                    <span className="capitalize">{privacy}</span>
                    <ChevronDown className="w-3 h-3 text-[#8e95a5]" />
                  </button>

                  {privacyMenuOpen && (
                    <div className="absolute right-0 bottom-full mb-1 w-28 py-1 rounded-xl bg-[#1c1e27] border border-[#2f3444] shadow-xl z-50">
                      <button
                        onClick={() => { setPrivacy('public'); setPrivacyMenuOpen(false); }}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-[#e5e7eb] hover:bg-[#252835]"
                      >
                        🌐 Public
                      </button>
                      <button
                        onClick={() => { setPrivacy('private'); setPrivacyMenuOpen(false); }}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-[#e5e7eb] hover:bg-[#252835]"
                      >
                        🔒 Private
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Action Button */}
      <div className="p-3.5 border-t border-[#21242c] bg-[#0d0e12]">
        <button
          id="btn-generate-model-action"
          onClick={handleGenerate}
          disabled={isExecuting}
          className="w-full py-3 rounded-full bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/20 active:scale-98 transition-all disabled:opacity-50"
        >
          {isExecuting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-[#111216]" />
              <span>{executionStep || `Generating 3D Asset (${executionProgress || 35}%)...`}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-[#111216]" />
              <span>Generate {currentMode === 'text-to-3d' ? 'from Text Prompt' : 'from Reference Image'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
