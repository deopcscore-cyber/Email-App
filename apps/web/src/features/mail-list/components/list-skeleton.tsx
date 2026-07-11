export function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-1 p-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-xl px-3 py-2.5"
          style={{ opacity: 1 - i * 0.09 }}
        >
          <div className="skeleton size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 py-1">
            <div className="skeleton h-2.5 w-1/3 rounded" />
            <div className="skeleton h-2.5 w-3/4 rounded" />
            <div className="skeleton h-2 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
