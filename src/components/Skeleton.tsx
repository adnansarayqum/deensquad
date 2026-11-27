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
      {tile ? <span className="skeleton block h-[60px] w-14 shrink-0 rounded-web" /> : null}
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

/**
 * A staff page while it loads: the PageHeader's Bebas title and line, then `Section`-shaped cards (hairline, no
 * shadow, as staff cards are). Used by the busiest staff pages' loading.tsx, so a slow signal at the gate shows the
 * page's shape instead of a blank frame.
 */
export function StaffSkeleton({ sections = [3, 4, 2], subtitle = true }: { sections?: number[]; subtitle?: boolean }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p className="sr-only" role="status">
        Loading
      </p>
      <div aria-hidden className="flex flex-col gap-2">
        <Bar w="45%" h={36} />
        {subtitle ? <Bar w="70%" h={16} /> : null}
      </div>
      {sections.map((lines, i) => (
        <div key={i} aria-hidden className="flex flex-col gap-3 rounded-app border border-line bg-paper p-4">
          <Bar w="40%" h={20} />
          {Array.from({ length: lines }, (_, j) => (
            <Bar key={j} w={`${92 - j * 12}%`} h={16} />
          ))}
        </div>
      ))}
    </div>
  );
}
