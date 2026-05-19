import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { MONITORED_ENDPOINT_LABEL, type ResponseRecord } from '@httpbin-monitor/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { IncidentDetailsSection } from '@/components/IncidentDetailsSection';
import { JsonBlock } from '@/components/JsonBlock';
import { StatusBadge } from '@/components/StatusBadge';
import { flattenIncidentPages, useIncidents } from '@/hooks/useIncidents';
import { flattenPages, useResponses } from '@/hooks/useResponses';
import { findIncidentForResponse } from '@/lib/incidents';
import { relativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';

const PING_INTERVAL_SECONDS = Number(import.meta.env.VITE_PING_INTERVAL_SECONDS ?? 10);
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
        data-testid="responses-scroll-container"
      >
        {children}
      </div>
    );
  },
);

function isErrorResponse(row: ResponseRecord): boolean {
  return row.statusCode === 0 || row.statusCode < 200 || row.statusCode >= 300;
}

function responseTimeClass(ms: number): string {
  if (ms > 3000) return 'font-medium text-status-error-fg';
  if (ms > 1000) return 'font-medium text-status-warn-fg';
  return '';
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={index}>
          {Array.from({ length: 5 }).map((__, cellIndex) => (
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
      <TableHead>Timestamp</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Response time</TableHead>
      <TableHead>URL</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
);

export function ResponsesTable() {
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useResponses();
  const { data: incidentsData } = useIncidents();
  const items = flattenPages(data);
  const incidents = flattenIncidentPages(incidentsData);
  const [selected, setSelected] = useState<ResponseRecord | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  const relatedIncident = useMemo(
    () => (selected ? findIncidentForResponse(incidents, selected.id) : undefined),
    [selected, incidents],
  );

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
            {error instanceof Error ? error.message : 'Failed to load responses'}
          </p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Waiting for the first ping... (interval: {PING_INTERVAL_SECONDS} seconds)
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
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{relativeTime(row.timestamp)}</TableCell>
                    <TableCell>
                      <StatusBadge statusCode={row.statusCode} />
                    </TableCell>
                    <TableCell className={cn(responseTimeClass(row.responseTimeMs))}>
                      {row.responseTimeMs}ms
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-muted-foreground">
                      {MONITORED_ENDPOINT_LABEL}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected(row)}
                      >
                        {findIncidentForResponse(incidents, row.id) || isErrorResponse(row)
                          ? 'View details'
                          : 'View payload'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {isFetchingNextPage ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
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
                    <TableCell colSpan={5} className="h-px p-0" />
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
            <SheetTitle>
              {relatedIncident ? 'Response & incident details' : 'Payload details'}
            </SheetTitle>
            <SheetDescription>
              Request and response JSON for this ping
              {relatedIncident ? ', plus linked incident analysis' : ''}.
            </SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="mt-4 space-y-4">
              {relatedIncident ? <IncidentDetailsSection incident={relatedIncident} /> : null}
              <JsonBlock title="Request payload" value={selected.requestPayload} />
              <JsonBlock title="Response body" value={selected.responseBody} />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
