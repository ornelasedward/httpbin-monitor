import { useAiUsage } from '@/hooks/useAiUsage';

export function AiUsageIndicator() {
  const usage = useAiUsage(true);

  if (usage === null) {
    return <span className="hidden text-xs text-muted-foreground sm:inline">AI usage…</span>;
  }

  if (!usage.configured) {
    return (
      <span
        className="hidden text-xs text-muted-foreground sm:inline"
        title="Set ANTHROPIC_API_KEY on the API"
      >
        AI off
      </span>
    );
  }

  return (
    <span
      className="hidden text-xs text-muted-foreground sm:inline"
      title={usage.resetAt ? `Resets ${new Date(usage.resetAt).toLocaleString()}` : undefined}
    >
      AI {usage.used}/{usage.max}
      <span className="text-muted-foreground/80"> · est. ${usage.estimatedCostUsd.toFixed(4)}</span>
    </span>
  );
}
