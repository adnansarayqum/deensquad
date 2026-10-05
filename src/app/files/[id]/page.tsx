import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { FileViewer } from "@/components/files/FileViewer";
import { ViewerBack } from "@/components/files/ViewerBack";
import { AppHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { fileLabel } from "@/lib/files";
import { backPath } from "@/lib/viewer";

export const metadata: Metadata = { title: "Attachment" };

// An attached session plan or practice sheet, shown inside the app with a way back. Who may open it is
// exactly who may open GET /api/files/[id]: the same row level security query, as the signed-in person.
export default async function FilePage({ params, searchParams }: PageProps<"/files/[id]">) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  if (!UUID.test(id)) notFound();
  const [file] = await asUser(user.id, (tx) =>
    tx.query<{ id: string; name: string; mime: string; size: number }>(`select id, name, mime, size from club_files where id = $1`, [id]),
  );
  if (!file) notFound();

  const back = backPath(from, user.guardian ? "/friday" : "/coach");
  const src = `/api/files/${file.id}`;
  const downloadHref = `${src}?download=1`;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-cream pb-[max(env(safe-area-inset-bottom),24px)] lg:max-w-3xl">
      <AppHeader>
        <div className="flex items-center justify-between gap-2">
          <ViewerBack href={back} />
          <a
            href={downloadHref}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-pill border-2 border-on-pitch-muted px-4 text-[15px] font-bold text-on-pitch"
          >
            <Download aria-hidden size={18} />
            Download
          </a>
        </div>
        <h1 className="text-[20px] leading-[26px] font-extrabold break-words">{file.name}</h1>
        <p className="text-sm text-on-pitch-muted">{fileLabel(file)}</p>
      </AppHeader>
      <main className="flex flex-col gap-3 px-4 pt-4">
        <FileViewer src={src} downloadHref={downloadHref} name={file.name} mime={file.mime} />
      </main>
    </div>
  );
}
