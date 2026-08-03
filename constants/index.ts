export const APP_NAME = 'AI 3D Studio';
export const APP_TAGLINE = 'Transform ideas into stunning 3D models with AI';
export const APP_DESCRIPTION = 'Generate production-ready 3D assets from text prompts or reference images in minutes.';

export const QUALITY_PRESETS = [
  { id: 'low-poly' as const, label: 'Low Poly', description: 'Fast generation, optimized for games', polygons: '< 5K tris', time: '~30s', credits: 10 },
  { id: 'standard' as const, label: 'Standard', description: 'Balanced quality and speed', polygons: '~20K tris', time: '~1 min', credits: 20 },
  { id: 'high-poly' as const, label: 'High Poly', description: 'Maximum detail for renders', polygons: '~100K tris', time: '~3 min', credits: 50 },
];

export const EXPORT_FORMATS = [
  { id: 'glb' as const, label: 'GLB', description: 'Web & Real-time', icon: '⬡' },
  { id: 'fbx' as const, label: 'FBX', description: 'Animation & Games', icon: '⬡' },
  { id: 'obj' as const, label: 'OBJ', description: 'Universal Format', icon: '⬡' },
  { id: 'stl' as const, label: 'STL', description: '3D Printing', icon: '⬡' },
];

export const PROMPT_SUGGESTIONS = [
  { text: 'A medieval stone castle tower with moss-covered walls and a wooden drawbridge', category: 'Architecture', icon: '🏰' },
  { text: 'A futuristic sci-fi spaceship with glowing engines and sleek metallic hull', category: 'Sci-Fi', icon: '🚀' },
  { text: 'A cute cartoon robot with big expressive eyes and articulated arms', category: 'Character', icon: '🤖' },
  { text: 'A fantasy dragon with detailed scales, folded wings, and curved horns', category: 'Creature', icon: '🐉' },
  { text: 'A low-poly pine tree with stylized geometry and snow-capped branches', category: 'Nature', icon: '🌲' },
  { text: 'An ornate golden chalice with gemstone inlays and intricate engravings', category: 'Prop', icon: '🏆' },
  { text: 'A steampunk mechanical owl with brass gears and copper plating', category: 'Steampunk', icon: '🦉' },
  { text: 'A voxel-style warrior character with blocky armor and a sword', category: 'Voxel', icon: '⚔️' },
];

export const GENERATION_STAGES = [
  { id: 'queued', label: 'Queued', icon: 'Clock' },
  { id: 'generating', label: 'Generating', icon: 'Cpu' },
  { id: 'texturing', label: 'Texturing', icon: 'Palette' },
  { id: 'rigging', label: 'Rigging', icon: 'GitBranch' },
  { id: 'completed', label: 'Completed', icon: 'CheckCircle' },
];

export const SUPPORTED_IMAGE_FORMATS = ['.png', '.jpg', '.jpeg', '.webp'];
export const MAX_IMAGE_SIZE_MB = 20;
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

export const STYLE_PRESETS = ['Realistic', 'Cartoon', 'Anime', 'Sci-Fi', 'Fantasy', 'Low Poly', 'Voxel', 'Steampunk'];

export const NAVIGATION_ITEMS = [
  { label: 'Features', href: '/#features' },
  { label: 'Image Gen', href: '/generate' },
  { label: 'Gallery', href: '/#gallery' },
  { label: 'Docs', href: '#' }, // TODO: create /docs page
];

export const ADMIN_NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: 'LayoutDashboard' },
  { id: 'models', label: 'Models', icon: 'Boxes' },
  { id: 'downloads', label: 'Downloads', icon: 'Download' },
  { id: 'runtime', label: 'Runtime', icon: 'Activity' },
  { id: 'logs', label: 'Logs', icon: 'ScrollText' },
  { id: 'jobs', label: 'Jobs', icon: 'Briefcase' },
  { id: 'queue', label: 'Queue', icon: 'ListOrdered' },
  { id: 'health', label: 'Health', icon: 'HeartPulse' },
  { id: 'docker', label: 'Docker', icon: 'Container' },
  { id: 'terminal', label: 'Terminal', icon: 'Terminal' },
  { id: 'settings', label: 'Settings', icon: 'Settings' },
];

export const IMAGE_GEN_MODELS = [
  { id: 'sdxl-base', label: 'SDXL Base', description: 'Best quality, ~16GB VRAM' },
  { id: 'sdxl-turbo', label: 'SDXL Turbo', description: 'Fast generation, ~14GB VRAM' },
  { id: 'sdxl-lightning', label: 'SDXL Lightning', description: 'Fastest, ~14GB VRAM' },
];

export const IMAGE_GEN_SAMPLERS = [
  { id: 'euler', label: 'Euler' },
  { id: 'dpmpp_2m', label: 'DPM++ 2M' },
  { id: 'heun', label: 'Heun' },
  { id: 'euler_ancestral', label: 'Euler Ancestral' },
];

export const IMAGE_GEN_DIMENSIONS = [
  { width: 512, height: 512, label: '512×512' },
  { width: 768, height: 768, label: '768×768' },
  { width: 1024, height: 768, label: '1024×768 (recommended)' },
  { width: 1024, height: 1024, label: '1024×1024' },
];
