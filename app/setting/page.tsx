'use client';

/**
 * /setting redirect to /admin
 */

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function SettingRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const section = searchParams.get('section')?.toLowerCase();
    const tab = searchParams.get('tab')?.toLowerCase();

    let target = '/admin?tab=settings';

    if (tab) {
      target = `/admin?tab=${encodeURIComponent(tab)}`;
    } else if (section) {
      switch (section) {
        case 'models':
          target = '/admin?tab=models';
          break;
        case 'runtime':
          target = '/admin?tab=runtime';
          break;
        case 'logs':
          target = '/admin?tab=logs';
          break;
        case 'queue':
          target = '/admin?tab=queue';
          break;
        case 'jobs':
        case 'history':
          target = '/admin?tab=jobs';
          break;
        case 'health':
        case 'monitoring':
          target = '/admin?tab=health';
          break;
        case 'storage':
          target = '/admin?tab=storage';
          break;
        case 'general':
        case 'workspace':
        case 'generation':
        case 'export':
        case 'shortcuts':
        case 'notifications':
        case 'advanced':
        case 'network':
        case 'api':
          target = `/admin?tab=settings&section=${encodeURIComponent(section)}`;
          break;
        default:
          target = `/admin?tab=settings`;
          break;
      }
    }

    router.replace(target);
  }, [router, searchParams]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0d0e12] text-zinc-400">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
        <p className="text-xs font-medium">Redirecting to Admin Control Center...</p>
      </div>
    </div>
  );
}

export default function SettingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[#0d0e12] text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
        </div>
      }
    >
      <SettingRedirectContent />
    </Suspense>
  );
}
