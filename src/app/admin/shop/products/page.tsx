import type { Metadata } from "next";
import Link from "next/link";
import { AdminTitle, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { saveProduct } from "@/lib/shop/actions";
import { formatPence, loadProducts, type Product } from "@/lib/shop/data";

export const metadata: Metadata = { title: "Shop items" };

const pounds = (pence: number | null) => (pence === null ? "" : (pence / 100).toFixed(pence % 100 ? 2 : 0));

function ProductFields({ p }: { p?: Product }) {
  const key = p?.id ?? "new";
  return (
    // Forms and detail read best at phone-to-tablet width, even on a computer.
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`name-${key}`} className="field-label">
            Name
          </label>
          <input id={`name-${key}`} name="name" defaultValue={p?.name} maxLength={80} className="field" />
        </div>
        <div>
          <label htmlFor={`price-${key}`} className="field-label">
            Price (£)
          </label>
          <input id={`price-${key}`} name="price" inputMode="decimal" defaultValue={pounds(p?.pricePence ?? null)} placeholder="15" className="field" />
        </div>
        <div>
          <label htmlFor={`sizes-${key}`} className="field-label">
            Sizes <span className="font-normal text-ink-muted">(commas; empty for one size)</span>
          </label>
          <input id={`sizes-${key}`} name="sizes" defaultValue={p?.sizes.join(", ")} placeholder="5-6, 7-8, 9-10, S, M, L" className="field" />
        </div>
        <div>
          <label htmlFor={`initials-${key}`} className="field-label">
            Initials price (£) <span className="font-normal text-ink-muted">(empty: not offered)</span>
          </label>
          <input id={`initials-${key}`} name="initialsPrice" inputMode="decimal" defaultValue={pounds(p?.initialsPence ?? null)} placeholder="5" className="field" />
        </div>
      </div>
      <div>
        <label htmlFor={`description-${key}`} className="field-label">
          Description <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input id={`description-${key}`} name="description" defaultValue={p?.description ?? ""} maxLength={300} className="field" />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div className="flex flex-col gap-2">
          <span className="field-label">Photo</span>
          {p?.imageUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- the club's own stored photo */}
              <img src={p.imageUrl} alt="" className="h-16 w-16 rounded-xl border-2 border-line object-cover" />
              <label className="flex min-h-11 items-center gap-2 text-[15px]">
                <input type="checkbox" name="removePhoto" className="h-5 w-5 accent-[var(--grass)]" />
                Remove photo
              </label>
            </div>
          ) : null}
          <input id={`photo-${key}`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-label={p?.imageUrl ? "Replace the photo" : "Add a photo"} className="field py-3 text-[15px]" />
          <label htmlFor={`image-${key}`} className="text-sm text-ink-muted">
            Or paste a link to a photo (https://). The app keeps its own copy.
          </label>
          <input id={`image-${key}`} name="imageUrl" type="url" className="field" />
        </div>
        <div>
          <label htmlFor={`sort-${key}`} className="field-label">
            Order
          </label>
          <input id={`sort-${key}`} name="sort" inputMode="numeric" defaultValue={p?.sort ?? 0} className="field" />
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="active" defaultChecked={p ? p.active : true} className="h-5 w-5 accent-[var(--grass)]" />
        <span className="text-[15px] font-bold">On sale</span>
      </label>
    </div>
  );
}

export default async function ShopProductsPage() {
  const user = await requireAdmin();
  const products = await asUser(user.id, (tx) => loadProducts(tx, { includeHidden: true }));
  return (
    <>
      <AdminTitle
        action={
          <Link href="/admin/shop" className="btn-chunky btn-paper btn-small">
            Back to orders
          </Link>
        }
      >
        Shop items
      </AdminTitle>

      <Section title="Add an item">
        <StatefulForm action={saveProduct} submitLabel="Add item" savedMessage="Item added." resetOnSave>
          <ProductFields />
        </StatefulForm>
      </Section>

      {products.map((p) => (
        <details key={p.id} className="rounded-app border-2 border-line bg-paper">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2">
            <span className="text-[15px] font-bold">
              {p.name} · {formatPence(p.pricePence)}
            </span>
            {p.active ? <Pill tone="done">On sale</Pill> : <Pill tone="neutral">Hidden</Pill>}
          </summary>
          <div className="border-t-2 border-line p-4">
            <StatefulForm action={saveProduct} submitLabel="Save changes" savedMessage="Saved.">
              <ProductFields p={p} />
            </StatefulForm>
          </div>
        </details>
      ))}
    </>
  );
}
