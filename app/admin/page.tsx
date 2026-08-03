"use client";
/**
 * DEPRECATED: Admin Page
 * Redirects to new unified Settings page
 * Kept for backward compatibility
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(true);

  useEffect(() => {
    // Small delay to ensure router is ready, then redirect
    const timer = setTimeout(() => {
      router.push('/settings?section=monitoring');
    }, 100);
    return () => clearTimeout(timer);
  }, [router]);

  if (!isRedirecting) return null;

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent mb-4" />
        <h1 className="text-2xl font-bold">Redirecting...</h1>
        <p className="text-muted-foreground">Admin page has been merged into Settings</p>
      </div>
    </div>
  );
}
