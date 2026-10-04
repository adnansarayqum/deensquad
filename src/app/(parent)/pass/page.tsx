import type { Metadata } from "next";
import QRCode from "qrcode";
import { Sun } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { getFamily } from "@/lib/parent/load";
import { joinNames } from "@/lib/parent/views";
import { passToken } from "@/lib/pass/token";

export const metadata: Metadata = { title: "Gate pass" };

export default async function PassPage() {
  const { family } = await getFamily();
  const names = family.children.map((c) => c.firstName);
  const svg = await QRCode.toString(passToken(family.guardian.id), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#13201a", light: "#ffffff" } });

  return (
    <>
      <BackHeader back="/friday" backLabel="Friday" title="Gate pass">
        Show this at the gate. One scan checks in {names.length > 1 ? `${joinNames(names)}` : (names[0] ?? "your child")}.
      </BackHeader>
      <main className="flex flex-col items-center gap-4 px-4 pt-5 pb-4">
        {family.children.length === 0 ? (
          <p className="rounded-app border-2 border-line bg-paper p-4 text-[15px]">No players are linked to your email yet. Ask the club to add your child.</p>
        ) : (
          <>
            <div
              role="img"
              aria-label={`Gate pass QR code for ${joinNames(names)}`}
              className="w-full max-w-[320px] rounded-app border-2 border-line bg-white p-4 [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <ul className="flex flex-wrap justify-center gap-2" aria-label="Children on this pass">
              {family.children.map((c) => (
                <li key={c.id} className="rounded-pill bg-grass-tint px-3.5 py-1.5 text-sm font-extrabold text-grass-text">
                  {c.firstName} · {c.ageGroup}s
                </li>
              ))}
            </ul>
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Sun aria-hidden size={18} />
              Turn your screen brightness up so it scans first time.
            </p>
            <p className="text-center text-sm leading-5 text-ink-muted">
              It&apos;s the same pass every week, so you can take a screenshot for when there&apos;s no signal.
            </p>
          </>
        )}
      </main>
    </>
  );
}
