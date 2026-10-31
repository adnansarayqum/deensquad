import { ScreenSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <ScreenSkeleton cards={[2, 4, 2]} tile />;
}
