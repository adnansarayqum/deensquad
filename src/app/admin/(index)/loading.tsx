import { StaffSkeleton } from "@/components/Skeleton";

/** The overview while it loads. In a route group so it never wraps the pages under it (a loading boundary above a page that 404s streams a 200). */
export default function Loading() {
  return <StaffSkeleton sections={[2, 4, 3]} />;
}
