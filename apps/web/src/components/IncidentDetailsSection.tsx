import type { Incident } from '@httpbin-monitor/shared';
import { Badge } from '@/components/ui/badge';
import { parseIncidentDetails } from '@/lib/incidents';
import { relativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';

export function severityClass(severity: Incident['severity']): string {
  switch (severity) {
    case 'low':
      return 'bg-status-info text-status-info-fg';
    case 'medium':
      return 'bg-status-warn text-status-warn-fg';
    case 'high':
      return 'bg-status-error text-status-error-fg';
    default:
      return '';
  }
}

export function IncidentDetailsSection({
  incident,
  showHeading = true,
}: {
  incident: Incident;
  showHeading?: boolean;
}) {
  const details = parseIncidentDetails(incident.rootCauses);

  return (
    <div
      className={cn(
        'space-y-4',
        showHeading && 'rounded-md border bg-muted/30 p-4',
      )}
    >
      {showHeading ? (
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Related incident
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn(severityClass(incident.severity))}>{incident.severity}</Badge>
        <span className="text-xs text-muted-foreground">{relativeTime(incident.createdAt)}</span>
      </div>
      <p className="text-sm font-medium">{incident.summary}</p>

      <details className="rounded-md border bg-card" open>
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Root causes</summary>
        <ul className="list-disc space-y-1 border-t px-5 py-3 text-sm text-muted-foreground">
          {details.rootCauses.length > 0 ? (
            details.rootCauses.map((item) => <li key={item}>{item}</li>)
          ) : (
            <li>None listed</li>
          )}
        </ul>
      </details>

      <details className="rounded-md border bg-card" open>
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Recommendations</summary>
        <ul className="list-disc space-y-1 border-t px-5 py-3 text-sm text-muted-foreground">
          {details.recommendations.length > 0 ? (
            details.recommendations.map((item) => <li key={item}>{item}</li>)
          ) : (
            <li>None listed</li>
          )}
        </ul>
      </details>
    </div>
  );
}
