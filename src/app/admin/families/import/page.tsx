import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { AdminTitle, Section } from "@/components/admin/bits";
import { ImportForm } from "@/components/admin/ImportForm";
import { requireAdmin } from "@/lib/auth/session";
import { AGE_GROUPS } from "@/lib/domain";

export const metadata: Metadata = { title: "Import families" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    // Forms and detail read best at phone-to-tablet width, even on a computer.
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <Link href="/admin/families" className="inline-flex min-h-11 items-center text-sm font-bold text-grass-text">
        ← Families
      </Link>
      <AdminTitle>Import families</AdminTitle>

      <Section title="How it works">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[22px]">
          <li>One row per child. Brothers and sisters each get their own row with the same parent email, and become one family.</li>
          <li>
            Needed: child&apos;s first and last name, group ({AGE_GROUPS.join(", ")}) or date of birth, and a parent&apos;s name and email.
            The email is how they sign in.
          </li>
          <li>
            Girls is for girls of any age: write &ldquo;Girls&rdquo; in the group column (&ldquo;Girls U10&rdquo; works too). A date of birth never
            puts a child in Girls.
          </li>
          <li>
            Optional: date of birth (DD/MM/YYYY), shirt number, position, parent&apos;s phone, and a second parent. A child with a date of birth
            but no group goes in the age group for their age on 31 August, and the check lists any child whose age group doesn&apos;t match
            their age.
          </li>
          <li>Importing the same sheet again updates children already in the app rather than adding them twice.</li>
          <li>Nothing is emailed until you send the invites.</li>
        </ul>
        <a href="/families-template.csv" download className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-bold text-grass-text underline">
          <Download aria-hidden size={18} />
          Download the template
        </a>
      </Section>

      <ImportForm />
    </div>
  );
}
