import { ScreenSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <ScreenSkeleton cards={[4, 3, 2]} tile />;
}
