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
      className:
        'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    };
  }
  if (statusCode >= 200 && statusCode < 300) {
    return {
      label: String(statusCode),
      className:
        'border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    };
  }
  if (statusCode >= 300 && statusCode < 400) {
    return {
      label: String(statusCode),
      className:
        'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    };
  }
  if (statusCode >= 400 && statusCode < 500) {
    return {
      label: String(statusCode),
      className:
        'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    };
  }
  return {
    label: String(statusCode),
    className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
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
