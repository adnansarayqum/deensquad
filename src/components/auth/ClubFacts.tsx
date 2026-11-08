import { MapPin, ShieldCheck, Users } from "lucide-react";
import { clubFactLines, type ClubFacts as Facts } from "@/lib/club-facts";

const ICONS = { pitch: MapPin, children: Users, dbs: ShieldCheck };

/** A few true lines about the club for families who haven't joined yet. Nothing at all when none apply. */
export function ClubFacts({ facts }: { facts: Facts }) {
  const lines = clubFactLines(facts);
  if (lines.length === 0) return null;
  return (
    <ul aria-label="About the club" className="flex flex-col gap-2.5 rounded-app bg-paper p-4 shadow-card">
      {lines.map(({ icon, text }) => {
        const Icon = ICONS[icon];
        return (
          <li key={icon} className="flex items-center gap-3 text-[15px] font-bold">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-grass-tint text-grass-text">
              <Icon aria-hidden size={20} />
            </span>
            {text}
          </li>
        );
      })}
    </ul>
  );
}
