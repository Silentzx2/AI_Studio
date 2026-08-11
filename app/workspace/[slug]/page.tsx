import { notFound } from 'next/navigation';
import { WorkspaceShell } from '@/features/workspace/WorkspaceShell';

const SLUG_TO_TAB: Record<string, string> = {
  '3d-generation': '3D Generation',
  'rigging': 'Rigging & Animation',
  'remesh': 'Remesh',
  'texture': 'Texture Gen',
  'assets': 'My Assets',
  'models': 'Models',
  'favorites': 'Favorites',
  'community': 'Community',
  'api': 'API Access',
  'settings': 'Settings',
};

export function generateStaticParams() {
  return Object.keys(SLUG_TO_TAB).map((slug) => ({ slug }));
}

export default function WorkspaceTabPage({
  params,
}: {
  params: { slug: string };
}) {
  const tab = SLUG_TO_TAB[params.slug];
  if (!tab) {
    notFound();
  }
  return <WorkspaceShell defaultTab={tab} />;
}
