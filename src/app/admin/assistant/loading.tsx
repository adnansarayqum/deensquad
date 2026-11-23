import { Bar } from "@/components/Skeleton";

/**
 * Shown the moment "Ask the assistant" is tapped, so the Overview doesn't sit on screen for a couple of seconds and
 * get tapped again (admin review, 23 Nov 2026). Only here: a loading.tsx above a page that calls notFound() would
 * stream a 200.
 */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4 lg:max-w-3xl">
      <p className="sr-only" role="status">
        Loading
      </p>
      <Bar w="40%" h={34} />
      <div aria-hidden className="flex flex-col gap-3 rounded-app border border-line bg-paper p-4">
        <Bar w="70%" />
        <Bar w="50%" />
        <Bar w="100%" h={48} />
      </div>
    </div>
  );
}
