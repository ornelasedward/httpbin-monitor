import { useMemo, useState } from 'react';
import type { Incident, ResponseRecord } from '@httpbin-monitor/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { flattenPages, useResponses } from '@/hooks/useResponses';
import { flattenIncidentPages, useIncidents } from '@/hooks/useIncidents';
import { parseIncidentDetails } from '@/lib/incidents';
import { relativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';

function severityClass(severity: Incident['severity']): string {
  switch (severity) {
    case 'low':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
    case 'medium':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
    case 'high':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
    default:
      return '';
  }
}

function PayloadSheet({
  record,
  open,
  onOpenChange,
}: {
  record: ResponseRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Related response</SheetTitle>
        </SheetHeader>
        {record ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">Request payload</p>
              <pre className="max-h-48 overflow-auto rounded-md border p-3 text-xs">
                {JSON.stringify(record.requestPayload, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Response body</p>
              <pre className="max-h-64 overflow-auto rounded-md border p-3 text-xs">
                {JSON.stringify(record.responseBody, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Response not found in the loaded dashboard data.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function Incidents() {
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useIncidents();
  const { data: responsesData } = useResponses();
  const incidents = flattenIncidentPages(data);
  const responses = flattenPages(responsesData);
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);

  const selectedResponse = useMemo(
    () => responses.find((row) => row.id === selectedResponseId) ?? null,
    [responses, selectedResponseId],
  );

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading incidents…</p>;
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6 text-sm text-red-800">
          {error instanceof Error ? error.message : 'Failed to load incidents'}
        </CardContent>
      </Card>
    );
  }

  if (incidents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Incidents</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No incidents yet. Slow responses above 2× the rolling average will appear here
          automatically.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>

      {incidents.map((incident) => {
        const details = parseIncidentDetails(incident.rootCauses);
        return (
          <Card key={incident.id}>
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={cn(severityClass(incident.severity))}>{incident.severity}</Badge>
                <span className="text-xs text-muted-foreground">
                  {relativeTime(incident.createdAt)}
                </span>
              </div>
              <CardTitle className="text-lg">{incident.summary}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Root causes</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {details.rootCauses.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Recommendations</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {details.recommendations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelectedResponseId(incident.responseId)}
              >
                View related response
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}

      <PayloadSheet
        record={selectedResponse}
        open={selectedResponseId !== null}
        onOpenChange={(open) => !open && setSelectedResponseId(null)}
      />
    </div>
  );
}
