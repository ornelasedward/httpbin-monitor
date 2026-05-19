import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusBadgeProps = {
  statusCode: number;
  className?: string;
};

function statusConfig(statusCode: number): { label: string; className: string } {
  if (statusCode === 0) {
    return {
      label: 'Network error',
      className: 'border-transparent bg-status-neutral text-status-neutral-fg',
    };
  }
  if (statusCode >= 200 && statusCode < 300) {
    return {
      label: String(statusCode),
      className: 'border-transparent bg-status-success text-status-success-fg',
    };
  }
  if (statusCode >= 300 && statusCode < 400) {
    return {
      label: String(statusCode),
      className: 'border-transparent bg-status-info text-status-info-fg',
    };
  }
  if (statusCode >= 400 && statusCode < 500) {
    return {
      label: String(statusCode),
      className: 'border-transparent bg-status-warn text-status-warn-fg',
    };
  }
  return {
    label: String(statusCode),
    className: 'border-transparent bg-status-error text-status-error-fg',
  };
}

export function StatusBadge({ statusCode, className }: StatusBadgeProps) {
  const config = statusConfig(statusCode);

  return (
    <Badge className={cn(config.className, className)} data-status-code={statusCode}>
      {config.label}
    </Badge>
  );
}
