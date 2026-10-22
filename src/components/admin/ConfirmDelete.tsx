import type { ReactNode } from "react";

/**
 * A delete that asks first, without JavaScript: the link-style button opens a line with the real button,
 * named for what goes ("Yes, remove Rondo drills"). `children` are the form's hidden fields.
 */
export function ConfirmDelete({
  action,
  label,
  confirmLabel,
  name,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** "Remove", "Delete this plan" */
  label: string;
  /** "Yes, remove it" */
  confirmLabel: string;
  /** What it is, for screen readers ("Rondo drills"). */
  name: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-12 cursor-pointer list-none items-center px-1 font-bold text-ink-muted underline [&::-webkit-details-marker]:hidden" aria-label={`${label}: ${name}`}>
        {label}
      </summary>
      <form action={action} className="flex flex-wrap items-center gap-2 pb-2">
        {children}
        <button type="submit" className="btn-chunky btn-paper btn-small" aria-label={`${confirmLabel}: ${name}`}>
          {confirmLabel}
        </button>
      </form>
    </details>
  );
}
