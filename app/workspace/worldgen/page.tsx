'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function WorkspaceWorldGenPage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace('/workspace/worldgen');
  }, [router]);
  return null;
}