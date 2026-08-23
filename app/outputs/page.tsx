'use client';

import React from 'react';
import { WorkspaceProvider } from '@/features/new-workspace/store/WorkspaceContext';
import { WorkspaceShell } from '@/features/new-workspace/WorkspaceShell';

export default function OutputsPage() {
  return (
    <WorkspaceProvider>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
