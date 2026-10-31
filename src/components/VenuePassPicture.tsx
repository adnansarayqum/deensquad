import { QR_IMG_CLASS } from "@/lib/qr-picture";
import type { VenuePassView } from "@/lib/venue-pass/card";

// The parent's sports hub entry code as a picture: drawn again from its text (black on white, with a quiet zone), or
// the screenshot itself when the phone couldn't read it. On /pass and in Friday's QR section on a session day.

export function VenuePassPicture({ view }: { view: VenuePassView }) {
  return view.kind === "code" ? (
    <div className="mx-auto w-full max-w-[300px] rounded-app border border-line bg-white p-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- a small PNG data URL drawn on the server */}
      <img src={view.src} alt="Your sports hub entry QR code" className={QR_IMG_CLASS} />
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- the parent's own file, served by /api/files with no-store
    <img
      src={view.src}
      alt="Your sports hub entry code (your screenshot)"
      className="mx-auto block h-auto max-h-[70vh] w-full max-w-[300px] rounded-app border border-line bg-white object-contain"
    />
  );
}
