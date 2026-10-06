import type { Email } from "./send";

// Plain, light emails that render in Gmail, Outlook and Apple Mail. British English, no emoji.

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(appUrl: string | null, inner: string): string {
  const crest = appUrl ? `<img src="${escape(appUrl)}/crest.png" width="48" height="48" alt="" style="border-radius:10px;display:block">` : "";
  return `<!doctype html><html lang="en-GB"><body style="margin:0;background:#fff4e3;font-family:'DM Sans',Arial,sans-serif;color:#13201a">
<div style="max-width:480px;margin:0 auto;padding:24px 16px">
<div style="background:#1f3d27;border-radius:18px;padding:20px;color:#fff4e3">${crest}
<p style="margin:12px 0 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#f2c14e">The Deen Squad Football Academy</p></div>
<div style="background:#fffaf2;border:2px solid #e6dac4;border-radius:18px;padding:20px;margin-top:12px;font-size:16px;line-height:24px">${inner}</div>
<p style="font-size:12px;line-height:18px;color:#56625a;margin:16px 4px">You're getting this because the club has this email address for you. If that's a mistake, reply to the club and they'll remove it.</p>
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${escape(href)}" style="display:inline-block;background:#34802f;color:#ffffff;font-weight:800;text-decoration:none;padding:14px 22px;border-radius:14px">${escape(label)}</a></p>`;

export function signInEmail(opts: { to: string; code: string; link: string | null; appUrl: string | null }): Email {
  const { to, code, link, appUrl } = opts;
  const subject = `${code} is your Deen Squad sign-in code`;
  const text = [
    "Assalamu alaikum,",
    "",
    `Your sign-in code is ${code}. Type it into the app. It works for 15 minutes.`,
    link
      ? `\nInstead of the code, you can open this link on the device you want to sign in on. Use one or the other: once one is used, the other stops working.\n${link}`
      : "",
    "",
    "If you didn't ask to sign in, you can ignore this email.",
  ].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum,</p>
<p>Your sign-in code is</p>
<p style="font-size:34px;font-weight:800;letter-spacing:.2em;margin:8px 0 4px">${code}</p>
<p style="color:#56625a;margin-top:0">Type it into the app. It works for 15 minutes.</p>
${link ? `<p>Instead of the code, you can tap below on the phone you want to sign in on. Use one or the other: once one is used, the other stops working.</p>${button(link, "Sign in")}` : ""}
<p style="color:#56625a;margin-bottom:0">If you didn't ask to sign in, you can ignore this email.</p>`,
  );
  return { to, subject, text, html };
}

/** The ladder's 24-hour reminder: the message itself, plus a link that signs them in where needed. */
export function reminderEmail(opts: { to: string; firstName: string; title: string; body: string; children: string[]; link: string; appUrl: string | null }): Email {
  const { to, firstName, title, body, children, link, appUrl } = opts;
  const names = children.length <= 1 ? (children[0] ?? "your child") : `${children.slice(0, -1).join(", ")} and ${children.at(-1)}`;
  const subject = `Please read: ${title}`;
  const text = [
    `Assalamu alaikum ${firstName},`,
    "",
    `The club posted a message for ${names}'s parents and would like to know you've seen it:`,
    "",
    title,
    body,
    "",
    "Open the app and tap \"I've read this\":",
    link,
  ].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum ${escape(firstName)},</p>
<p>The club posted a message for ${escape(names)}'s parents and would like to know you've seen it.</p>
<div style="border-left:4px solid #c9952f;padding:4px 0 4px 14px;margin:16px 0">
<p style="font-weight:800;margin:0 0 6px">${escape(title)}</p>
<p style="margin:0;white-space:pre-line">${escape(body)}</p></div>
${button(link, "I've read this")}
<p style="color:#56625a;margin-bottom:0">The button opens the app, where one tap lets the club know.</p>`,
  );
  return { to, subject, text, html };
}

export function inviteEmail(opts: { to: string; firstName: string; children: string[]; link: string; appUrl: string | null }): Email {
  const { to, firstName, children, link, appUrl } = opts;
  const names = children.length <= 1 ? (children[0] ?? "your child") : `${children.slice(0, -1).join(", ")} and ${children.at(-1)}`;
  const subject = "Your Deen Squad parent app is ready";
  const text = [
    `Assalamu alaikum ${firstName},`,
    "",
    `The Deen Squad Football Academy now has an app for parents. Read club news, tell the coach if ${names} ${children.length > 1 ? "are" : "is"} coming on Friday, and follow their progress.`,
    "",
    "Open this link to sign in. It works for 7 days:",
    link,
    "",
    "To keep the app on your phone, open it in your browser and choose Add to Home Screen. If it asks you to sign in again, enter this email address and we'll send you a 6-digit code.",
  ].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum ${escape(firstName)},</p>
<p>The Deen Squad Football Academy now has an app for parents. Read club news, tell the coach if ${escape(names)} ${children.length > 1 ? "are" : "is"} coming on Friday, and follow their progress.</p>
${button(link, "Open the app")}
<p style="color:#56625a">This link works for 7 days.</p>
<p style="color:#56625a;margin-bottom:0">To keep the app on your phone, open it in your browser and choose <b>Add to Home Screen</b>. If it asks you to sign in again, enter this email address and we'll send you a 6-digit code.</p>`,
  );
  return { to, subject, text, html };
}

export function newOrderEmail(opts: {
  to: string;
  parentName: string;
  reference: string;
  total: string;
  paid: boolean;
  lines: string[];
  link: string | null;
  appUrl: string | null;
}): Email {
  const { to, parentName, reference, total, paid, lines, link, appUrl } = opts;
  const state = paid ? `Paid ${total} by card.` : `${total} to come by bank transfer, reference ${reference}.`;
  const subject = `New kit order ${reference} from ${parentName}`;
  const text = [`New kit order from ${parentName}.`, "", ...lines.map((l) => `- ${l}`), "", state, ...(link ? ["", `See all orders: ${link}`] : [])].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">New kit order from <b>${escape(parentName)}</b>.</p>
<ul style="padding-left:20px">${lines.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>
<p>${escape(state)}</p>
${link ? button(link, "See orders") : ""}`,
  );
  return { to, subject, text, html };
}

export function newFamilyEmail(opts: { to: string; parentName: string; parentEmail: string; children: string[]; link: string | null; appUrl: string | null }): Email {
  const { to, parentName, parentEmail, children, link, appUrl } = opts;
  const subject = `New family signed up: ${parentName}`;
  const text = [`${parentName} (${parentEmail}) has signed up in the app.`, "", ...children.map((c) => `- ${c}`), ...(link ? ["", `See families: ${link}`] : [])].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0"><b>${escape(parentName)}</b> (${escape(parentEmail)}) has signed up in the app.</p>
<ul style="padding-left:20px">${children.map((c) => `<li>${escape(c)}</li>`).join("")}</ul>
${link ? button(link, "See families") : ""}`,
  );
  return { to, subject, text, html };
}

/** A parent asked the club to delete their account (Player → Your data). Names the parent only: nothing else about the family. */
export function deletionRequestEmail(opts: { to: string; parentName: string; link: string | null; appUrl: string | null }): Email {
  const { to, parentName, link, appUrl } = opts;
  const subject = `Account deletion request: ${parentName}`;
  const lines = [
    `${parentName} has asked the club to delete their account in the parent app.`,
    "",
    "Nothing has been deleted yet. Please check with the family, then remove them on Families (or mark the request done on the overview). If another parent is staying, unlink this parent from each child instead, so the child stays.",
  ];
  const text = [...lines, ...(link ? ["", `Open the overview: ${link}`] : [])].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0"><b>${escape(parentName)}</b> has asked the club to delete their account in the parent app.</p>
<p>Nothing has been deleted yet. Please check with the family, then remove them on Families (or mark the request done on the overview). If another parent is staying, unlink this parent from each child instead, so the child stays.</p>
${link ? button(link, "Open the overview") : ""}`,
  );
  return { to, subject, text, html };
}

export type OrderEmailKind ="placed" | "paid" | "ready" | "cancelled";

/**
 * What the parent hears about their kit order, once at each step: placed (with how to pay), payment received,
 * ready to collect on Friday, and cancelled.
 */
export function orderEmail(
  kind: OrderEmailKind,
  opts: {
    to: string;
    firstName: string;
    reference: string;
    total: string;
    payBy: "card" | "bank";
    /** "1 × Hoodie, size Youth M, initials MH (for Maryam)" */
    lines: string[];
    /** Children the order is for, by first name. */
    children: string[];
    /** The club account, for a bank transfer; null if it isn't set up. */
    bank: { accountName: string; sortCode: string; accountNumber: string } | null;
    /** "Tue 6 Oct", when the payment arrived (paid). */
    paidOn?: string | null;
    /** Whether the cancelled order had been paid. */
    wasPaid?: boolean;
    link: string | null;
    appUrl: string | null;
  },
): Email {
  const { to, firstName, reference, total, payBy, lines, children, bank, paidOn, wasPaid, link, appUrl } = opts;
  const names = children.length === 0 ? "Your" : `${children.length === 1 ? children[0] : `${children.slice(0, -1).join(", ")} and ${children.at(-1)}`}'s`;
  const subject = {
    placed: `Your kit order ${reference}`,
    paid: `Payment received for order ${reference}`,
    ready: "Kit ready to collect on Friday",
    cancelled: `Order ${reference} cancelled`,
  }[kind];
  // Paragraphs of plain text; the HTML version escapes the same words.
  const paragraphs: string[] = {
    placed: [
      `Thank you for your kit order ${reference}. The total is ${total}.`,
      payBy === "bank"
        ? bank
          ? `Please pay ${total} by bank transfer to:\nAccount name: ${bank.accountName}\nSort code: ${bank.sortCode}\nAccount number: ${bank.accountNumber}\nReference: ${reference}\nUse the reference so the club can match your payment to this order.`
          : `Please pay ${total} by bank transfer. The club will send you its bank details. Use the reference ${reference} when you pay.`
        : "You chose to pay by card. If you didn't finish paying, open your order in the app to pay.",
      "We'll email you when it's ready.",
    ],
    paid: [
      `We've received your payment of ${total} for order ${reference}${paidOn ? ` on ${paidOn}` : ""}. Thank you.`,
      "We'll email you when it's ready.",
    ],
    ready: [`${names} kit from order ${reference} is ready. Collect it from a coach at Friday's session.`],
    cancelled: [
      `The club has cancelled your kit order ${reference} (${total}).`,
      wasPaid ? "You've already paid for it, so please speak to the club about your refund." : "You don't need to pay for it.",
    ],
  }[kind];
  const text = [
    `Assalamu alaikum ${firstName},`,
    "",
    paragraphs[0],
    "",
    ...lines.map((l) => `- ${l}`),
    ...paragraphs.slice(1).flatMap((p) => ["", p]),
    ...(link ? ["", `See your order: ${link}`] : []),
  ].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum ${escape(firstName)},</p>
<p>${escape(paragraphs[0])}</p>
<ul style="padding-left:20px">${lines.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>
${paragraphs
  .slice(1)
  .map((p) => `<p style="white-space:pre-line">${escape(p)}</p>`)
  .join("\n")}
${link ? button(link, "See your order") : ""}`,
  );
  return { to, subject, text, html };
}
