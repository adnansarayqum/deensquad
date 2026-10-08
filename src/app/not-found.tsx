import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-start justify-center gap-4 bg-pitch-deep px-6 text-on-pitch">
      <h1 className="font-display text-[56px] leading-[0.9] text-floodlight">Page not found</h1>
      <p className="text-[15px] text-on-pitch-muted">This page doesn&apos;t exist or has moved.</p>
      <Link href="/news" className="btn-chunky btn-grass">
        Back to club news
      </Link>
    </main>
  );
}
