"use client";
/**
 * Unified Settings Page - PRODUCTION IMPLEMENTATION
 * Merges Admin + Settings into one professional interface
 * All sections properly implemented with error handling
 */

import React, { Suspense, useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronRight,
  Settings2,
  FileText,
  Cpu,
  Database,
  AlertCircle,
  Sun,
  Bell,
  Keyboard,
  Network,
  Shield,
  Code,
  HardDrive,
  BarChart3,
  Package,
  Zap,
  Users,
  Clock,
  RotateCcw,
  Save,
  Menu,
  X,
  Search,
  Pin,
  PinOff,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Import existing admin/settings components (reuse)
import {
  HealthTab,
  JobsTab,
  QueueTab,
  ModelsTab,
  RuntimeTab,
  LogsTab,
  SettingsTab,
  StorageTab,
  ConnectionsTab,
  OverviewTab,
  TerminalTab,
} from '@/features/admin/tabs';

// Import new settings sections
import {
  GeneralSection,
  WorkspaceSection,
  AppearanceSection,
  GenerationSection,
  ExportBackupSection,
  NotificationsSection,
  ShortcutsSection,
  NetworkSection,
  AdvancedSection,
} from '@/features/settings/sections';

interface SettingsSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  group: 'system' | 'management' | 'monitoring' | 'preferences' | 'advanced';
  description?: string;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  // SYSTEM
  {
    id: 'general',
    label: 'General',
    icon: <Settings2 className="w-4 h-4" />,
    group: 'system',
    description: 'Application information and updates',
  },
  {
    id: 'workspace',
    label: 'Workspace',
    icon: <HardDrive className="w-4 h-4" />,
    group: 'system',
    description: 'Workspace configuration and storage',
  },
  {
    id: 'generation',
    label: 'Generation',
    icon: <Cpu className="w-4 h-4" />,
    group: 'system',
    description: 'Default generation settings',
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: <Database className="w-4 h-4" />,
    group: 'system',
    description: 'Storage management and cleanup',
  },


  // MANAGEMENT
  {
    id: 'models',
    label: 'AI Models',
    icon: <Package className="w-4 h-4" />,
    group: 'management',
    description: 'Installed models and settings',
  },
  {
    id: 'queue',
    label: 'Queue',
    icon: <Clock className="w-4 h-4" />,
    group: 'management',
    description: 'Active jobs and queue management',
  },
  {
    id: 'history',
    label: 'History',
    icon: <Clock className="w-4 h-4" />,
    group: 'management',
    description: 'Generation history and logs',
  },

  // MONITORING
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: <AlertCircle className="w-4 h-4" />,
    group: 'monitoring',
    description: 'System health and resources',
  },
  {
    id: 'database',
    label: 'Database',
    icon: <Database className="w-4 h-4" />,
    group: 'monitoring',
    description: 'Database status and connections',
  },
  {
    id: 'runtime',
    label: 'Runtime',
    icon: <Cpu className="w-4 h-4" />,
    group: 'monitoring',
    description: 'GPU and Python runtime info',
  },
  {
    id: 'logs',
    label: 'Logs',
    icon: <FileText className="w-4 h-4" />,
    group: 'monitoring',
    description: 'System and application logs',
  },

  // PREFERENCES
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Sun className="w-4 h-4" />,
    group: 'preferences',
    description: 'Theme and visual preferences',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell className="w-4 h-4" />,
    group: 'preferences',
    description: 'Notification settings and alerts',
  },
  {
    id: 'shortcuts',
    label: 'Keyboard Shortcuts',
    icon: <Keyboard className="w-4 h-4" />,
    group: 'preferences',
    description: 'Customize keyboard shortcuts',
  },

  // ADVANCED
  {
    id: 'network',
    label: 'Network',
    icon: <Network className="w-4 h-4" />,
    group: 'advanced',
    description: 'Network and API settings',
  },
  {
    id: 'security',
    label: 'Security',
    icon: <Shield className="w-4 h-4" />,
    group: 'advanced',
    description: 'Security and authentication',
  },
  {
    id: 'developer',
    label: 'Developer',
    icon: <Code className="w-4 h-4" />,
    group: 'advanced',
    description: 'Developer tools and debugging',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: <RotateCcw className="w-4 h-4" />,
    group: 'advanced',
    description: 'Advanced configuration options',
  },
  {
    id: 'export',
    label: 'Export & Backup',
    icon: <Save className="w-4 h-4" />,
    group: 'advanced',
    description: 'Export settings and backups',
  },
];

const GROUP_LABELS: Record<string, string> = {
  system: 'System',
  management: 'Management',
  monitoring: 'Monitoring & Health',
  preferences: 'User Preferences',
  advanced: 'Advanced',
};

// Loading component for suspense
function SectionLoading() {
  return (
    <div className="p-6 flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent mb-4" />
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    </div>
  );
}

// Error boundary component
function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="p-6">
      <div className="flex items-start gap-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
        <AlertCircle className="w-6 h-6 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="font-semibold">Error Loading Settings</h3>
          <p className="text-sm mt-1">{error.message}</p>
          <p className="text-xs mt-2 opacity-75">Please try refreshing the page or contact support if this persists.</p>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SectionLoading />}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSection = searchParams.get('section') || 'general';
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedSections, setPinnedSections] = useState<string[]>([]);

const highlightText = (text: string, query: string) => {
  if (!query) return <span>{text}</span>;

  const escaped = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));

  return (
    <span>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={index}
            className="bg-yellow-500/30 text-yellow-900 dark:text-yellow-100 rounded px-0.5 font-semibold"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  );
};

useEffect(() => {
  const saved = localStorage.getItem("ai3d:settings:sidebarOpen");
  if (saved !== null) {
    setSidebarOpen(saved === "true");
  }

  const savedPinned = localStorage.getItem("ai3d:settings:pinnedSections");
  if (savedPinned) {
    try {
      setPinnedSections(JSON.parse(savedPinned));
    } catch (e) {}
  }
}, []);

  const handleSidebarToggle = () => {
    const nextState = !sidebarOpen;
    setSidebarOpen(nextState);
    localStorage.setItem('ai3d:settings:sidebarOpen', String(nextState));
  };

  const togglePin = (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    setPinnedSections(prev => {
      const next = prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId];
      localStorage.setItem('ai3d:settings:pinnedSections', JSON.stringify(next));
      return next;
    });
  };

  const getKeysForSection = (sectionId: string): string[] => {
    switch (sectionId) {
      case 'appearance':
        return ['appearance_settings'];
      case 'generation':
        return ['generationSettings', 'gen_advanced_settings'];
      case 'notifications':
        return ['notificationSettings'];
      case 'network':
        return ['networkSettings'];
      case 'advanced':
        return ['advancedSettings'];
      case 'workspace':
        return [
          'SETTINGS_RAY_TRACING',
          'SETTINGS_ANTI_ALIASING',
          'SETTINGS_AUTOSAVE_INTERVAL'
        ];
      default:
        return [];
    }
  };

  const handleResetSection = () => {
    const keys = getKeysForSection(activeSection);
    if (keys.length === 0) return;
    
    if (typeof window !== 'undefined') {
      keys.forEach(key => localStorage.removeItem(key));
      toast.success(`${currentSection?.label || 'Section'} settings have been reset.`);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const groupedSections = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return SETTINGS_SECTIONS.reduce(
      (acc, section) => {
        if (query && !section.label.toLowerCase().includes(query) && !section.description?.toLowerCase().includes(query)) {
          return acc;
        }
        if (!acc[section.group]) acc[section.group] = [];
        acc[section.group].push(section);
        return acc;
      },
      {} as Record<string, SettingsSection[]>
    );
  }, [searchQuery]);

  const handleSectionClick = (sectionId: string) => {
    setError(null);
    router.push(`/settings?section=${sectionId}`);
  };

  const renderContent = () => {
    if (error) {
      return <ErrorFallback error={error} />;
    }
    try {
      switch (activeSection) {
        // System sections
        case 'general':
          return (
            <Suspense fallback={<SectionLoading />}>
              <GeneralSection />
            </Suspense>
          );
        case 'workspace':
          return (
            <Suspense fallback={<SectionLoading />}>
              <WorkspaceSection />
            </Suspense>
          );
        case 'appearance':
          return (
            <Suspense fallback={<SectionLoading />}>
              <AppearanceSection />
            </Suspense>
          );
        case 'generation':
          return (
            <Suspense fallback={<SectionLoading />}>
              <GenerationSection />
            </Suspense>
          );
        case 'storage':
          return (
            <Suspense fallback={<SectionLoading />}>
              <StorageTab />
            </Suspense>
          );
        case 'database':
          return (
            <Suspense fallback={<SectionLoading />}>
              <ConnectionsTab />
            </Suspense>
          );
        // Management sections
        case 'models':
          return (
            <Suspense fallback={<SectionLoading />}>
              <ModelsTab />
            </Suspense>
          );
        case 'queue':
          return (
            <Suspense fallback={<SectionLoading />}>
              <QueueTab />
            </Suspense>
          );
        case 'history':
          return (
            <Suspense fallback={<SectionLoading />}>
              <JobsTab />
            </Suspense>
          );
        // Monitoring sections
        case 'monitoring':
          return (
            <Suspense fallback={<SectionLoading />}>
              <HealthTab />
            </Suspense>
          );
        case 'runtime':
          return (
            <Suspense fallback={<SectionLoading />}>
              <RuntimeTab />
            </Suspense>
          );
        case 'logs':
          return (
            <Suspense fallback={<SectionLoading />}>
              <LogsTab />
            </Suspense>
          );
        
        // Advanced & Developer sections
        case 'security':
          return (
            <Suspense fallback={<SectionLoading />}>
              <SettingsTab />
            </Suspense>
          );
        case 'developer':
          return (
            <Suspense fallback={<SectionLoading />}>
              <TerminalTab />
            </Suspense>
          );
        case 'export':
          return (
            <Suspense fallback={<SectionLoading />}>
              <ExportBackupSection />
            </Suspense>
          );

        case 'notifications':
          return (
            <Suspense fallback={<SectionLoading />}>
              <NotificationsSection />
            </Suspense>
          );
        case 'shortcuts':
          return (
            <Suspense fallback={<SectionLoading />}>
              <ShortcutsSection />
            </Suspense>
          );
        case 'network':
          return (
            <Suspense fallback={<SectionLoading />}>
              <NetworkSection />
            </Suspense>
          );
        case 'advanced':
          return (
            <Suspense fallback={<SectionLoading />}>
              <AdvancedSection />
            </Suspense>
          );
        default:
          return (
            <div className="p-6">
              <h2 className="text-xl font-semibold">Section not found</h2>
              <p className="text-muted-foreground mt-2">The requested settings section could not be found.</p>
            </div>
          );
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      return <ErrorFallback error={error} />;
    }
  };

  const currentSection = SETTINGS_SECTIONS.find((s) => s.id === activeSection);

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile menu button */}
      <div className="fixed top-0 left-0 z-50 lg:hidden p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSidebarToggle}
        >
          {sidebarOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </Button>
      </div>

      {/* Sidebar */}
      <div
        className={`
          fixed lg:relative z-40 h-full
          ${sidebarOpen ? 'w-80' : 'w-20'} 
          border-r border-border bg-card transition-all duration-300 flex flex-col
        `}
      >
        <div className="p-6 space-y-6 pt-16 lg:pt-6 flex-1 overflow-y-auto">
          {sidebarOpen && (
            <div className="relative sticky top-0 bg-card z-10 pb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          )}

          {pinnedSections.length > 0 && (
            <div>
              {sidebarOpen && (
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
                  Quick Actions
                </h3>
              )}
              <div className="space-y-1">
                {pinnedSections.map((pinnedId) => {
                  const section = SETTINGS_SECTIONS.find(s => s.id === pinnedId);
                  if (!section) return null;
                  return (
                    <div key={`pinned-${section.id}`} className="relative group">
                      <button
                        onClick={() => handleSectionClick(section.id)}
                        className={`
                          w-full flex items-start gap-3 px-3 py-2.5 rounded-md text-sm font-medium 
                          transition-all duration-200 border-l-[4px] pr-8
                          ${
                            activeSection === section.id
                               ? 'bg-primary text-primary-foreground shadow-md border-l-black'
                              : 'text-foreground hover:bg-accent hover:text-accent-foreground border-l-transparent'
                          }
                        `}
                        title={section.label}
                      >
                        <span className="flex-shrink-0 mt-0.5">{section.icon}</span>
                        {sidebarOpen && (
                          <div className="flex-1 text-left min-w-0">
                            <div className="font-semibold truncate">
                              {highlightText(section.label, searchQuery)}
                            </div>
                            {section.description && (
                              <div className={`text-[11px] truncate mt-0.5 ${activeSection === section.id ? 'text-black/75' : 'text-muted-foreground'}`}>
                                {highlightText(section.description, searchQuery)}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                      {sidebarOpen && (
                        <button 
                          onClick={(e) => togglePin(e, section.id)}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity ${activeSection === section.id ? 'text-black/70 hover:text-black' : 'text-muted-foreground'}`}
                          title="Unpin section"
                        >
                          <PinOff className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.entries(groupedSections).map(([groupId, sections]) => (
            <div key={groupId}>
              {sidebarOpen && (
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
                  {GROUP_LABELS[groupId as keyof typeof GROUP_LABELS]}
                </h3>
              )}
              <div className="space-y-1">
                {sections.map((section) => {
                  const isPinned = pinnedSections.includes(section.id);
                  return (
                    <div key={section.id} className="relative group">
                      <button
                        onClick={() => handleSectionClick(section.id)}
                        className={`
                          w-full flex items-start gap-3 px-3 py-2.5 rounded-md text-sm font-medium 
                          transition-all duration-200 border-l-[4px] pr-8
                          ${
                            activeSection === section.id
                               ? 'bg-primary text-primary-foreground shadow-md border-l-black'
                              : 'text-foreground hover:bg-accent hover:text-accent-foreground border-l-transparent'
                          }
                        `}
                        title={section.label}
                      >
                        <span className="flex-shrink-0 mt-0.5">{section.icon}</span>
                        {sidebarOpen && (
                          <div className="flex-1 text-left min-w-0">
                            <div className="font-semibold truncate">
                              {highlightText(section.label, searchQuery)}
                            </div>
                            {section.description && (
                              <div className={`text-[11px] truncate mt-0.5 ${activeSection === section.id ? 'text-black/75' : 'text-muted-foreground'}`}>
                                {highlightText(section.description, searchQuery)}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                      {sidebarOpen && (
                        <button 
                          onClick={(e) => togglePin(e, section.id)}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-opacity ${isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${activeSection === section.id ? 'text-black/70 hover:text-black' : 'text-muted-foreground'}`}
                          title={isPinned ? "Unpin section" : "Pin section"}
                        >
                          {isPinned ? <Pin className="w-3.5 h-3.5 fill-current" /> : <Pin className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Overlay for mobile when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto flex flex-col">
        {/* Content header */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
          <div className="p-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{currentSection?.label || 'Settings'}</h1>
              {currentSection?.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {currentSection.description}
                </p>
              )}
            </div>
            
            {getKeysForSection(activeSection).length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                    <RotateCcw className="w-4 h-4" />
                    Reset Section
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset {currentSection?.label} Settings?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will reset all configuration values within the "{currentSection?.label}" section back to their defaults. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleResetSection}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Reset Settings
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
