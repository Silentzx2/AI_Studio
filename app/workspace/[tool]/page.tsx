import { notFound } from 'next/navigation';
import { WorkspaceShell } from '@/features/new-workspace/WorkspaceShell';

export default async function WorkspaceToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  // WorldGen has its own dedicated page — let the specific route handle it
  if (tool === 'worldgen') {
    notFound();
  }
  return <WorkspaceShell />;
}
