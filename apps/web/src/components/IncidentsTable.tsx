import { forwardRef, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Incident } from '@httpbin-monitor/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IncidentDetailsSection, severityClass } from '@/components/IncidentDetailsSection';
import { JsonBlock } from '@/components/JsonBlock';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { flattenIncidentPages, useIncidents } from '@/hooks/useIncidents';
import { useResponse } from '@/hooks/useResponse';
import { relativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';

const SCROLL_LOAD_THRESHOLD_PX = 120;

function useScrollLoadMore(
  scrollRef: RefObject<HTMLDivElement | null>,
  sentinelRef: RefObject<HTMLTableRowElement | null>,
  options: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
  },
) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = options;

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root, rootMargin: `${SCROLL_LOAD_THRESHOLD_PX}px` },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRef, sentinelRef, hasNextPage, isFetchingNextPage, fetchNextPage]);
}

const ScrollableTableShell = forwardRef<HTMLDivElement, { children: ReactNode }>(
  function ScrollableTableShell({ children }, ref) {
    return (
      <div
        ref={ref}
        className="max-h-[min(60vh,40rem)] overflow-y-auto overscroll-contain"
        data-testid="incidents-scroll-container"
      >
        {children}
      </div>
    );
  },
);

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={index}>
          {Array.from({ length: 4 }).map((__, cellIndex) => (
            <TableCell key={cellIndex}>
              <div className="h-4 animate-pulse rounded bg-muted" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

const tableHeader = (
  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
    <TableRow>
      <TableHead>Time</TableHead>
      <TableHead>Severity</TableHead>
      <TableHead>Summary</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
);

export function IncidentsTable() {
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useIncidents();
  const incidents = flattenIncidentPages(data);
  const [selected, setSelected] = useState<Incident | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  const {
    data: relatedResponse,
    isLoading: responseLoading,
    isError: responseError,
  } = useResponse(selected?.responseId);

  useScrollLoadMore(scrollRef, sentinelRef, {
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    fetchNextPage,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-0">
          <ScrollableTableShell ref={scrollRef}>
            <Table>
              {tableHeader}
              <TableBody>
                <SkeletonRows />
              </TableBody>
            </Table>
          </ScrollableTableShell>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-status-error/40 bg-status-error/30">
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-status-error-fg">
            {error instanceof Error ? error.message : 'Failed to load incidents'}
          </p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (incidents.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No incidents yet. Slow responses above 2× the rolling average will appear here
          automatically.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <ScrollableTableShell ref={scrollRef}>
            <Table>
              {tableHeader}
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell className="whitespace-nowrap">
                      {relativeTime(incident.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(severityClass(incident.severity))}>
                        {incident.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate" title={incident.summary}>
                      {incident.summary}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected(incident)}
                      >
                        View details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {isFetchingNextPage ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-3 text-center text-sm text-muted-foreground"
                    >
                      Loading more…
                    </TableCell>
                  </TableRow>
                ) : null}
                {hasNextPage ? (
                  <TableRow
                    ref={sentinelRef}
                    aria-hidden
                    className="h-0 border-0 hover:bg-transparent"
                  >
                    <TableCell colSpan={4} className="h-px p-0" />
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </ScrollableTableShell>
        </CardContent>
      </Card>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Incident details</SheetTitle>
            <SheetDescription>
              AI-generated summary, root causes, and the related httpbin response.
            </SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="mt-4 space-y-4">
              <IncidentDetailsSection incident={selected} showHeading={false} />

              {responseLoading ? (
                <p className="text-sm text-muted-foreground">Loading response…</p>
              ) : responseError ? (
                <p className="text-sm text-status-error-fg">Failed to load related response.</p>
              ) : relatedResponse ? (
                <>
                  <JsonBlock title="Request payload" value={relatedResponse.requestPayload} />
                  <JsonBlock title="Response body" value={relatedResponse.responseBody} />
                </>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
