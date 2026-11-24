import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { groupPlural, hasAwards } from "@/lib/domain";
import { staffNameForParents } from "@/lib/greeting";
import { loadCardStats, loadSpotlight, positionShort, weekWords } from "@/lib/spotlight/data";

// The Player of the week card: a 1080x1350 picture (a portrait post) for the child's own parents to keep and share,
// and for staff to check. A shield in the club's colours (the owner's request, 24 Nov 2026: like a football stats
// card): shirt number and position, the crest and group, the child's photo when a parent has added one (which needs
// photo consent), first name only, their own season in real numbers (never made-up ratings), and the coach's words
// underneath. Row level security decides who gets it: the child's family or staff, else 404. `?download=1` saves it.

const PITCH = "#1f3d27";
const STRIPE = "#26482f";
const DEEP = "#0f1d14";
const GOLD = "#f2c14e";
const CREAM = "#fff4e3";
const PAGE = "#f7f4ee";
const INK = "#14211a";
const MUTED = "#56625a";

const dataUrl = (mime: string, bytes: Uint8Array | Buffer) => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
const font = (pkg: string, file: string) => readFile(join(process.cwd(), "node_modules", "@fontsource", pkg, "files", file));

// The shield, drawn once as a picture: gold edge, pitch stripes, a darker foot for the numbers, a cream inner line.
const OUTER = "M120 140 Q330 122 540 36 Q750 122 960 140 L960 940 Q960 1040 540 1140 Q120 1040 120 940 Z";
const INNER = "M146 164 Q336 148 540 66 Q744 148 934 164 L934 934 Q934 1020 540 1110 Q146 1020 146 934 Z";
const SHIELD = dataUrl(
  "image/svg+xml",
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1150" viewBox="0 0 1080 1150">
<defs><clipPath id="c"><path d="${INNER}"/></clipPath></defs>
<path d="${OUTER}" fill="${GOLD}"/>
<g clip-path="url(#c)">
<rect width="1080" height="1160" fill="${PITCH}"/>
${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${146 + i * 160 + 80}" y="0" width="80" height="1160" fill="${STRIPE}"/>`).join("")}
<rect x="0" y="0" width="400" height="660" fill="${DEEP}" opacity="0.55"/>
<rect x="0" y="660" width="1080" height="500" fill="${DEEP}"/>
</g>
</svg>`,
  ),
);

export async function GET(request: Request, { params }: RouteContext<"/api/spotlight/[id]/card">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to see this card.", { status: 401 });
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const found = await asUser(user.id, async (tx) => {
    const spotlight = await loadSpotlight(tx, id);
    if (!spotlight) return null;
    const [photo] = spotlight.photoFileId ? await tx.query<{ mime: string; data: Uint8Array }>(`select mime, data from club_files where id = $1`, [spotlight.photoFileId]) : [];
    return { spotlight, photo: photo ?? null, stats: await loadCardStats(tx, spotlight.playerId, hasAwards(spotlight.ageGroup)) };
  });
  if (!found) return new Response("Not found", { status: 404 });
  const { spotlight, photo, stats } = found;
  const [crestFile, bebas, sans, sansBold] = await Promise.all([
    readFile(join(process.cwd(), "public", "crest.png")),
    font("bebas-neue", "bebas-neue-latin-400-normal.woff"),
    font("dm-sans", "dm-sans-latin-400-normal.woff"),
    font("dm-sans", "dm-sans-latin-700-normal.woff"),
  ]);
  const crest = dataUrl("image/png", crestFile);
  const coach = staffNameForParents(spotlight.coach);
  const position = positionShort(spotlight.position);
  const name = spotlight.firstName.toUpperCase();
  const nameSize = name.length > 11 ? 90 : name.length > 8 ? 110 : 130;
  // Long words from the coach get smaller type, so 200 characters still fit under the shield.
  const quoteSize = spotlight.comment.length > 140 ? 27 : spotlight.comment.length > 80 ? 31 : 36;
  const columns = [stats.slice(0, Math.ceil(stats.length / 2)), stats.slice(Math.ceil(stats.length / 2))];
  const download = new URL(request.url).searchParams.get("download") === "1";
  const bebasText = { fontFamily: "Bebas", lineHeight: 1 } as const;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: PAGE, fontFamily: "DM Sans", color: CREAM }}>
        <div style={{ display: "flex", position: "relative", width: 1080, height: 1150 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- drawn into a picture, not a page */}
          <img src={SHIELD} width={1080} height={1150} style={{ position: "absolute", left: 0, top: 0 }} />

          {/* Left: shirt number, position, crest, group. */}
          <div style={{ position: "absolute", left: 166, top: 176, width: 220, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", ...bebasText, fontSize: spotlight.shirtNumber === null ? 110 : 170, color: GOLD }}>{spotlight.shirtNumber === null ? spotlight.ageGroup : String(spotlight.shirtNumber)}</div>
            {position ? <div style={{ display: "flex", ...bebasText, fontSize: 64, marginTop: 2 }}>{position}</div> : null}
            <div style={{ display: "flex", width: 150, height: 4, backgroundColor: CREAM, opacity: 0.7, marginTop: 12, marginBottom: 18 }} />
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- drawn into a picture, not a page */}
            <img src={crest} width={130} height={130} style={{ borderRadius: 26 }} />
          </div>

          {/* Right: the child's photo, or their initial. */}
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- drawn into a picture, not a page
            <img src={dataUrl(photo.mime, photo.data)} width={400} height={400} style={{ position: "absolute", left: 462, top: 176, borderRadius: 999, border: `10px solid ${GOLD}`, objectFit: "cover" }} />
          ) : (
            <div style={{ position: "absolute", left: 462, top: 176, width: 400, height: 400, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 999, border: `10px solid ${GOLD}`, backgroundColor: DEEP, color: GOLD, ...bebasText, fontSize: 250 }}>
              {name.slice(0, 1)}
            </div>
          )}

          {/* Name, with the award across it. */}
          <div style={{ position: "absolute", left: 146, top: 596, width: 788, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", backgroundColor: GOLD, color: DEEP, fontSize: 30, fontWeight: 700, padding: "8px 26px", borderRadius: 999 }}>{`${groupPlural(spotlight.ageGroup)} Player of the week · ${weekWords(spotlight.week).replace("week of ", "")}`}</div>
          </div>
          <div style={{ position: "absolute", left: 146, top: 690, width: 788, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", ...bebasText, fontSize: nameSize, letterSpacing: 2 }}>{name}</div>
            <div style={{ display: "flex", width: 560, height: 4, backgroundColor: CREAM, opacity: 0.7, marginTop: 8 }} />
          </div>

          {/* The child's own season, in two columns. */}
          <div style={{ position: "absolute", left: 250, top: 690 + nameSize + 34, width: 580, display: "flex", justifyContent: "center", gap: 56 }}>
            {columns.map((column, c) => (
              <div key={c} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {column.map((stat) => (
                  <div key={stat.label} style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", width: 104, ...bebasText, fontSize: 60, color: GOLD }}>{stat.value}</div>
                    <div style={{ display: "flex", ...bebasText, fontSize: 40, letterSpacing: 1 }}>{stat.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* The coach's words, under the shield. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 80px", marginTop: 14, color: INK }}>
          <div style={{ display: "flex", textAlign: "center", fontSize: quoteSize, lineHeight: 1.3 }}>{`“${spotlight.comment}”`}</div>
          <div style={{ display: "flex", fontSize: 26, color: MUTED, marginTop: 10, fontWeight: 700 }}>{`${coach ? `${coach} · ` : ""}The Deen Squad Football Academy`}</div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1350,
      fonts: [
        { name: "Bebas", data: bebas, weight: 400, style: "normal" },
        { name: "DM Sans", data: sans, weight: 400, style: "normal" },
        { name: "DM Sans", data: sansBold, weight: 700, style: "normal" },
      ],
      headers: {
        // The child's own card: one person's cache only, and not kept (the coach can change the words or take it back).
        "Cache-Control": "private, no-store",
        ...(download ? { "Content-Disposition": `attachment; filename="player-of-the-week-${spotlight.week}.png"` } : {}),
      },
    },
  );
}
