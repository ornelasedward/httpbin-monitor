import { Button } from '@/components/ui/button';

export function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2);

  return (
    <details className="rounded-md border" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{title}</summary>
      <div className="border-t p-3">
        <div className="mb-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Copy ${title.toLowerCase()}`}
            onClick={() => void navigator.clipboard.writeText(text)}
          >
            Copy
          </Button>
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{text}</pre>
      </div>
    </details>
  );
}
