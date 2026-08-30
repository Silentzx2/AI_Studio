'use client';

import React, { useState } from 'react';
import { AdminShell } from '@/features/admin/AdminShell';
import { OverviewTab } from '@/features/admin/tabs/OverviewTab';
import { ModelsTab } from '@/features/admin/tabs/ModelsTab';
import { RuntimeTab } from '@/features/admin/tabs/RuntimeTab';
import { LogsTab } from '@/features/admin/tabs/LogsTab';
import { JobsTab } from '@/features/admin/tabs/JobsTab';
import { QueueTab } from '@/features/admin/tabs/QueueTab';
import { HealthTab } from '@/features/admin/tabs/HealthTab';
import { SettingsTab } from '@/features/admin/tabs/SettingsTab';

function AdminPageContent() {
  const [activeTab, setActiveTab] = useState('overview');

  const renderTab = () => {
    switch (activeTab) {
      case 'overview': return <OverviewTab />;
      case 'models': return <ModelsTab />;
      case 'runtime': return <RuntimeTab />;
      case 'logs': return <LogsTab />;
      case 'jobs': return <JobsTab />;
      case 'queue': return <QueueTab />;
      case 'health': return <HealthTab />;
      case 'settings': return <SettingsTab />;
      default: return <OverviewTab />;
    }
  };

  return (
    <AdminShell activeTab={activeTab} onTabChange={setActiveTab}>
      {renderTab()}
    </AdminShell>
  );
}

export default function AdminPage() {
  return <AdminPageContent />;
}
