'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

export function useSSE<T>(url: string, fallbackPollMs = 30000) {
  const [data, setData] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);
  const retryRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const connect = useCallback(() => {
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try { setData(JSON.parse(e.data)); } catch {}
    };
    es.onerror = () => {
      setConnected(false);
      es.close();
      // Fallback to polling
      retryRef.current = setTimeout(connect, 5000);
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connect]);

  // Fallback polling when SSE disconnected
  useEffect(() => {
    if (connected) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(url.replace('/stream', ''));
        const json = await res.json();
        setData(json.data ?? json);
      } catch {}
    }, fallbackPollMs);
    return () => clearInterval(poll);
  }, [connected, url, fallbackPollMs]);

  return { data, connected };
}
