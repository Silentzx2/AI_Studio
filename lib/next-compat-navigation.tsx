"use client";
import React, { useState, useEffect } from 'react';

export function useRouter() {
  return {
    push: (href: string) => {
      window.history.pushState({}, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    replace: (href: string) => {
      window.history.replaceState({}, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    prefetch: () => {},
    back: () => window.history.back(),
  };
}

export function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  return pathname;
}

export function useSearchParams() {
  const [searchParams, setSearchParams] = useState(new URLSearchParams(window.location.search));
  useEffect(() => {
    const handlePopState = () => {
      setSearchParams(new URLSearchParams(window.location.search));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  return searchParams;
}
