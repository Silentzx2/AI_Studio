'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminShell } from '@/features/admin/AdminShell';
import { OverviewTab } from '@/features/admin/tabs/OverviewTab';
import { ModelsTab } from '@/features/admin/tabs/ModelsTab';
import { RuntimeTab } from '@/features/admin/tabs/RuntimeTab';
import { LogsTab } from '@/features/admin/tabs/LogsTab';
import { JobsTab } from '@/features/admin/tabs/JobsTab';
import { QueueTab } from '@/features/admin/tabs/QueueTab';
import { HealthTab } from '@/features/admin/tabs/HealthTab';
import { StorageTab } from '@/features/admin/tabs/StorageTab';
import { SettingsTab } from '@/features/admin/tabs/SettingsTab';
import { Loader2 } from 'lucide-react';

const VALID_TABS = new Set([
  'overview',
  'models',
  'runtime',
  'logs',
  'jobs',
  'queue',
  'health',
  'storage',
  'settings',
]);

const SECTION_TO_TAB: Record<string, string> = {
  models: 'models',
  runtime: 'runtime',
  logs: 'logs',
  queue: 'queue',
  jobs: 'jobs',
  history: 'jobs',
  health: 'health',
  monitoring: 'health',
  storage: 'storage',
  general: 'settings',
  workspace: 'settings',
  generation: 'settings',
  export: 'settings',
  backup: 'settings',
  shortcuts: 'settings',
  notifications: 'settings',
  advanced: 'settings',
  network: 'settings',
  api: 'settings',
};

function AdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab')?.toLowerCase();
  const sectionParam = searchParams.get('section')?.toLowerCase();

  // Resolve initial tab from tab query or mapped section query
  const resolveInitialTab = (): string => {
    if (tabParam && VALID_TABS.has(tabParam)) {
      return tabParam;
    }
    if (sectionParam && SECTION_TO_TAB[sectionParam]) {
      return SECTION_TO_TAB[sectionParam];
    }
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<string>(resolveInitialTab);

  // Sync tab state if URL parameters change externally
  useEffect(() => {
    const targetTab = resolveInitialTab();
    if (targetTab !== activeTab) {
      setActiveTab(targetTab);
    }
  }, [tabParam, sectionParam]);

  const handleTabChange = useCallback((newTab: string) => {
    setActiveTab(newTab);
    router.replace(`/admin?tab=${newTab}`, { scroll: false });
  }, [router]);

  const renderTab = () => {
    switch (activeTab) {
      case 'overview': return <OverviewTab />;
      case 'models': return <ModelsTab />;
      case 'runtime': return <RuntimeTab />;
      case 'logs': return <LogsTab />;
      case 'jobs': return <JobsTab />;
      case 'queue': return <QueueTab />;
      case 'health': return <HealthTab />;
      case 'storage': return <StorageTab />;
      case 'settings': return <SettingsTab initialSection={sectionParam} />;
      default: return <OverviewTab />;
    }
  };

  return (
    <AdminShell activeTab={activeTab} onTabChange={handleTabChange}>
      {renderTab()}
    </AdminShell>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[#0d0e12] text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
        </div>
      }
    >
      <AdminPageContent />
    </Suspense>
  );
}
