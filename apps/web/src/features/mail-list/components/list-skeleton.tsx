export function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-1 p-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse gap-3 rounded-xl px-3 py-2.5"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="size-9 shrink-0 rounded-full bg-surface-muted" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-2.5 w-1/3 rounded bg-surface-muted" />
            <div className="h-2.5 w-3/4 rounded bg-surface-muted" />
            <div className="h-2 w-1/2 rounded bg-surface-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
