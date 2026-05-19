import { useEffect, useState } from 'react';
import { fetchAiUsage, type AiUsage } from '@/lib/api';

const REFETCH_MS = 30_000;

export function useAiUsage(enabled = true) {
  const [usage, setUsage] = useState<AiUsage | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const load = () => {
      void fetchAiUsage()
        .then(setUsage)
        .catch(() => setUsage(null));
    };

    load();
    const interval = setInterval(load, REFETCH_MS);
    return () => clearInterval(interval);
  }, [enabled]);

  return usage;
}
