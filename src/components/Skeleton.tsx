/**
 * Grey shapes of a screen while it loads (each tab's loading.tsx), so a slow signal at the pitch shows the layout
 * straight away instead of a blank page. `aria-busy` with one "Loading" line for screen readers; the shapes are
 * hidden from them.
 */
export function Bar({ w = "100%", h = 14, className = "" }: { w?: string | number; h?: number; className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} style={{ width: w, height: h }} />;
}

export function SkeletonCard({ lines = 3, tile = false }: { lines?: number; tile?: boolean }) {
  return (
    <div aria-hidden className="flex gap-3.5 rounded-app bg-paper p-4 shadow-card">
      {tile ? <span className="skeleton block h-[60px] w-14 shrink-0 rounded-[14px]" /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <Bar w="60%" h={18} />
        {Array.from({ length: lines }, (_, i) => (
          <Bar key={i} w={`${90 - i * 15}%`} />
        ))}
      </div>
    </div>
  );
}

export function ScreenSkeleton({ title = true, cards = [3, 2, 2], tile = false }: { title?: boolean; cards?: number[]; tile?: boolean }) {
  return (
    <div aria-busy="true" className="flex flex-col">
      <p className="sr-only" role="status">
        Loading
      </p>
      {title ? (
        <div className="px-4 pt-[max(env(safe-area-inset-top),20px)]">
          <div className="pt-6 pr-36 pb-2">
            <Bar w="55%" h={30} />
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 px-4 pt-4">
        {cards.map((lines, i) => (
          <SkeletonCard key={i} lines={lines} tile={tile && i === 0} />
        ))}
      </div>
    </div>
  );
}
