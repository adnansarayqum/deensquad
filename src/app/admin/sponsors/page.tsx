import type { Metadata } from "next";
import { FoldCard, PageHeader } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { SponsorLogo } from "@/components/SponsorLogo";
import { Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { removeSponsor, saveSponsor } from "@/lib/sponsors/actions";
import { loadSponsors, type Sponsor } from "@/lib/sponsors/data";

export const metadata: Metadata = { title: "Sponsors" };

const NOT_SAVED = "That didn't save. The logo may be too big (8 MB at most), or check your signal and try again.";

function SponsorFields({ s }: { s?: Sponsor }) {
  const key = s?.id ?? "new";
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`name-${key}`} className="field-label">
            Name
          </label>
          <input id={`name-${key}`} name="name" defaultValue={s?.name} maxLength={80} className="field" />
        </div>
        <div>
          <label htmlFor={`what-${key}`} className="field-label">
            What they sponsor <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id={`what-${key}`} name="sponsorsWhat" defaultValue={s?.sponsorsWhat ?? ""} maxLength={80} placeholder="U10 tournament kit" className="field" />
          <p className="mt-1 text-sm text-ink-muted">Parents see &ldquo;Sponsors the U10 tournament kit&rdquo;.</p>
        </div>
      </div>
      <div>
        <label htmlFor={`about-${key}`} className="field-label">
          About them <span className="font-normal text-ink-muted">(optional, a line or two)</span>
        </label>
        <textarea id={`about-${key}`} name="about" defaultValue={s?.about ?? ""} maxLength={300} rows={2} className="field" />
      </div>
      <div>
        <label htmlFor={`link-${key}`} className="field-label">
          Website or social page <span className="font-normal text-ink-muted">(optional, starts with https://)</span>
        </label>
        <input id={`link-${key}`} name="link" type="url" defaultValue={s?.linkUrl ?? ""} maxLength={500} placeholder="https://" className="field" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`offer-${key}`} className="field-label">
            Offer for Deen Squad families <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id={`offer-${key}`} name="offer" defaultValue={s?.offer ?? ""} maxLength={200} placeholder="10% off" className="field" />
        </div>
        <div>
          <label htmlFor={`how-${key}`} className="field-label">
            How to claim it <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id={`how-${key}`} name="offerHow" defaultValue={s?.offerHow ?? ""} maxLength={200} placeholder="Show this screen at the till" className="field" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div className="flex flex-col gap-2">
          <span className="field-label">Logo</span>
          {s?.logoFileId ? (
            <div className="flex items-center gap-3">
              <SponsorLogo name={s.name} fileId={s.logoFileId} size={64} />
              <label className="flex min-h-12 items-center gap-2 text-[15px]">
                <input type="checkbox" name="removeLogo" className="h-5 w-5 accent-[var(--grass)]" />
                Remove logo
              </label>
            </div>
          ) : null}
          <input id={`logo-${key}`} name="logo" type="file" accept="image/jpeg,image/png,image/webp" aria-label={s?.logoFileId ? `Replace the logo for ${s.name}` : "Add a logo"} className="field py-3 text-[15px]" />
        </div>
        <div>
          <label htmlFor={`sort-${key}`} className="field-label">
            Order
          </label>
          <input id={`sort-${key}`} name="sort" inputMode="numeric" defaultValue={s?.sort ?? 0} className="field" />
        </div>
      </div>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" name="active" defaultChecked={s ? s.active : true} className="h-5 w-5 accent-[var(--grass)]" />
        <span className="text-[15px] font-bold">Show to parents</span>
      </label>
    </div>
  );
}

export default async function AdminSponsorsPage() {
  const user = await requireAdmin();
  const sponsors = await asUser(user.id, (tx) => loadSponsors(tx, { includeHidden: true }));
  return (
    <>
      <PageHeader title="Sponsors" subtitle="Shown to parents on Home and on the Our sponsors page. Lowest order number first." />

      <FoldCard id="add-sponsor" title="Add a sponsor" open={sponsors.length === 0}>
        <StatefulForm action={saveSponsor} keepOnFailure={NOT_SAVED} submitLabel="Add sponsor" savedMessage="Sponsor added.">
          <SponsorFields />
        </StatefulForm>
      </FoldCard>

      {sponsors.map((s) => (
        <details key={s.id} className="rounded-app border border-line bg-paper">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2">
            <span className="flex min-w-0 items-center gap-3">
              <SponsorLogo name={s.name} fileId={s.logoFileId} size={40} />
              <span className="min-w-0 text-[15px] font-bold break-words">Edit {s.name}</span>
            </span>
            {s.active ? <Pill tone="done">Showing</Pill> : <Pill tone="neutral">Hidden</Pill>}
          </summary>
          <div className="flex flex-col gap-5 border-t border-line p-4">
            <StatefulForm action={saveSponsor} keepOnFailure={NOT_SAVED} submitLabel={`Save ${s.name}`} savedMessage="Saved.">
              <SponsorFields s={s} />
            </StatefulForm>
            <StatefulForm action={removeSponsor} submitLabel={`Remove ${s.name}`} savedMessage="Sponsor removed." className="border-t border-line pt-4">
              <input type="hidden" name="id" value={s.id} />
              <label className="flex min-h-12 items-center gap-3 text-[15px]">
                <input type="checkbox" name="confirm" value="yes" className="h-5 w-5 accent-[var(--grass)]" />
                Yes, remove {s.name} and its logo for good
              </label>
            </StatefulForm>
          </div>
        </details>
      ))}
    </>
  );
}
