import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { groupPlural } from "@/lib/domain";
import { staffNameForParents } from "@/lib/greeting";
import { loadSpotlight, weekWords } from "@/lib/spotlight/data";

// The Player of the week card: a 1080x1350 picture (a portrait post) for the child's own parents to keep and share,
// and for staff to check. Row level security decides who gets it: the child's family or staff, else 404. First name
// only, the coach's words, the club's crest; the child's photo when a parent has added one (which needs photo
// consent). `?download=1` saves it.

const PITCH = "#1f3d27";
const STRIPE = "#26482f";
const DEEP = "#0f1d14";
const GOLD = "#f2c14e";
const CREAM = "#fff4e3";
const MUTED = "#c9d8cc";

const dataUrl = (mime: string, bytes: Uint8Array | Buffer) => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

export async function GET(request: Request, { params }: RouteContext<"/api/spotlight/[id]/card">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to see this card.", { status: 401 });
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const found = await asUser(user.id, async (tx) => {
    const spotlight = await loadSpotlight(tx, id);
    if (!spotlight) return null;
    const [photo] = spotlight.photoFileId ? await tx.query<{ mime: string; data: Uint8Array }>(`select mime, data from club_files where id = $1`, [spotlight.photoFileId]) : [];
    return { spotlight, photo: photo ?? null };
  });
  if (!found) return new Response("Not found", { status: 404 });
  const { spotlight, photo } = found;
  const crest = dataUrl("image/png", await readFile(join(process.cwd(), "public", "crest.png")));
  const coach = staffNameForParents(spotlight.coach);
  // Long words from the coach get smaller type, so 200 characters still fit the card.
  const quoteSize = spotlight.comment.length > 140 ? 40 : spotlight.comment.length > 80 ? 46 : 54;
  const nameSize = spotlight.firstName.length > 10 ? 110 : 150;
  const download = new URL(request.url).searchParams.get("download") === "1";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: PITCH, backgroundImage: `repeating-linear-gradient(90deg, ${PITCH} 0, ${PITCH} 90px, ${STRIPE} 90px, ${STRIPE} 180px)`, color: CREAM, padding: 72, fontFamily: "Geist" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- drawn into a picture, not a page */}
          <img src={crest} width={132} height={132} style={{ borderRadius: 28 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, color: MUTED }}>The Deen Squad Football Academy</div>
            <div style={{ fontSize: 34, color: MUTED }}>{`${groupPlural(spotlight.ageGroup)}, ${weekWords(spotlight.week)}`}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 52 }}>
          <div style={{ display: "flex", backgroundColor: GOLD, color: DEEP, fontSize: 44, fontWeight: 700, padding: "14px 40px", borderRadius: 999, letterSpacing: 1 }}>Player of the week</div>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- drawn into a picture, not a page
            <img src={dataUrl(photo.mime, photo.data)} width={300} height={300} style={{ borderRadius: 999, border: `10px solid ${GOLD}`, marginTop: 48, objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 300, height: 300, borderRadius: 999, border: `10px solid ${GOLD}`, backgroundColor: DEEP, color: GOLD, fontSize: 170, fontWeight: 700, marginTop: 48 }}>
              {spotlight.firstName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", fontSize: nameSize, fontWeight: 700, marginTop: 28, lineHeight: 1 }}>{spotlight.firstName}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", backgroundColor: DEEP, borderRadius: 40, padding: "44px 52px" }}>
          <div style={{ display: "flex", fontSize: quoteSize, lineHeight: 1.3 }}>{`“${spotlight.comment}”`}</div>
          {coach ? <div style={{ display: "flex", fontSize: 36, color: GOLD, marginTop: 22, fontWeight: 700 }}>{coach}</div> : null}
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1350,
      headers: {
        // The child's own card: one person's cache only, and not kept (the coach can change the words or take it back).
        "Cache-Control": "private, no-store",
        ...(download ? { "Content-Disposition": `attachment; filename="player-of-the-week-${spotlight.week}.png"` } : {}),
      },
    },
  );
}
