import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, MapPin } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Attachment } from "@/components/plans/Attachment";
import { VideoCard } from "@/components/plans/VideoCard";
import { StepsText } from "@/components/StepsText";
import { Card, Pill } from "@/components/ui";
import { requireParent } from "@/lib/auth/session";
import { loadEvents, upcomingEvents } from "@/lib/community/data";
import { AUDIENCE_LABELS, eventTile, eventWhen } from "@/lib/community/events";
import { asUser } from "@/lib/db";
import { attachmentTitle } from "@/lib/files";
import { staffNameForParents } from "@/lib/greeting";
import { backTarget } from "@/lib/parent/tabs";
import { directionsUrl } from "@/lib/parent/views";
import { loadCommunitySheets } from "@/lib/plans/data";

export const metadata: Metadata = { title: "Community" };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default async function CommunityPage({ searchParams }: PageProps<"/community">) {
  const params = await searchParams;
  const back = backTarget(params.from, { href: "/news", label: "Home" });
  const corner = params.show === "corner";
  const user = await requireParent();
  const now = new Date();
  const [events, sheets] = await asUser(user.id, async (tx) => [upcomingEvents(await loadEvents(tx), now), await loadCommunitySheets(tx)] as const);
  const tab = (on: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-[10px] px-2 text-[15px] font-bold ${on ? "bg-paper text-ink shadow-card" : "text-ink-muted"}`;
  return (
    <>
      <BackHeader back={back.href} backLabel={back.label} title="Community">
        {corner ? "Drills and practice sheets from the coaches, for any child who loves football." : "Classes, football and events for the whole community."}
      </BackHeader>
      <main className="flex flex-col gap-3 px-4 pt-4 pb-4">
        <nav aria-label="Community" className="flex gap-1 rounded-[14px] bg-fill p-1">
          <Link href="/community" aria-current={corner ? undefined : "page"} className={tab(!corner)}>
            What&apos;s on
          </Link>
          <Link href="/community?show=corner" aria-current={corner ? "page" : undefined} className={tab(corner)}>
            Coach&apos;s corner
          </Link>
        </nav>

        {corner ? (
          <>
            {sheets.length === 0 ? <Card className="p-4 text-[15px]">Nothing in Coach&apos;s corner yet.</Card> : null}
            {sheets.map((s) => (
              <Card key={s.id} className="flex flex-col gap-2.5 p-4">
                <h2 className="text-[18px] font-bold break-words">{s.title}</h2>
                {s.body ? <StepsText text={s.body} /> : null}
                {s.file ? <Attachment file={s.file} label={attachmentTitle("sheet", s.file)} from="/community?show=corner" /> : null}
                {s.video ? <VideoCard video={s.video} name={s.title} /> : null}
                <p className="text-[13px] text-ink-muted">{[staffNameForParents(s.from), day.format(new Date(s.createdAt))].filter(Boolean).join(" · ")}</p>
              </Card>
            ))}
          </>
        ) : (
          <>
            {events.length === 0 ? <Card className="p-4 text-[15px]">Nothing coming up yet.</Card> : null}
            {events.map((e) => {
              const tile = eventTile(e.start);
              const directions = e.venue ? directionsUrl(e.venue) : null;
              return (
                <Card key={e.id} className="flex flex-col gap-3 p-4">
                  <div className="flex gap-3">
                    <span aria-hidden className="grid h-14 w-[52px] shrink-0 place-items-center rounded-xl bg-pitch text-on-pitch">
                      <span className="flex flex-col items-center leading-tight">
                        <span className="text-[12px] font-bold">{tile.top}</span>
                        <span className="text-[16px] font-bold">{tile.bottom}</span>
                      </span>
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <h2 className="text-[18px] font-bold break-words">{e.title}</h2>
                      <p className="text-[15px] font-bold">{eventWhen(e.weekly, e.start, e.end)}</p>
                      {e.venue ? <p className="text-[15px] break-words text-ink-muted">{e.venue}</p> : null}
                      <span>
                        <Pill tone="neutral">{AUDIENCE_LABELS[e.audience]}</Pill>
                      </span>
                    </div>
                  </div>
                  {e.details ? <p className="text-[16px] leading-6 whitespace-pre-line">{e.details}</p> : null}
                  {e.howToJoin ? <p className="text-[16px] leading-6 font-bold">{e.howToJoin}</p> : null}
                  {directions || e.linkUrl ? (
                    <div className="flex flex-wrap gap-2">
                      {directions ? (
                        <a
                          href={directions}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Directions to ${e.title}`}
                          className="btn-chunky btn-paper flex min-h-12 flex-1 items-center justify-center gap-2"
                        >
                          <MapPin aria-hidden size={18} />
                          Directions
                        </a>
                      ) : null}
                      {e.linkUrl ? (
                        <a
                          href={e.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`More about ${e.title} (opens outside the app)`}
                          className="btn-chunky btn-paper flex min-h-12 flex-1 items-center justify-center gap-2"
                        >
                          More details
                          <ExternalLink aria-hidden size={18} />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </>
        )}
      </main>
    </>
  );
}
