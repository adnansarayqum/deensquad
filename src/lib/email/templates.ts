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
  const subject = `New family to approve: ${parentName}`;
  const approve = "They won't see any club news, sessions or photos until you approve the children in the app.";
  const text = [`${parentName} (${parentEmail}) has signed up in the app.`, "", ...children.map((c) => `- ${c}`), "", approve, ...(link ? ["", `Approve them: ${link}`] : [])].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0"><b>${escape(parentName)}</b> (${escape(parentEmail)}) has signed up in the app.</p>
<ul style="padding-left:20px">${children.map((c) => `<li>${escape(c)}</li>`).join("")}</ul>
<p>${escape(approve)}</p>
${link ? button(link, "Approve them") : ""}`,
  );
  return { to, subject, text, html };
}

/** A parent added a child from the Player screen. The club checks the group and links any other parent. */
export function newChildEmail(opts: { to: string; parentName: string; childName: string; group: string; link: string | null; appUrl: string | null }): Email {
  const { to, parentName, childName, group, link, appUrl } = opts;
  const subject = `New child to approve: ${childName} (${group}), added by ${parentName}`;
  const ask = `Please check the group is right and approve ${childName}. Until then the family doesn't see the ${group} news, sessions or photos.`;
  const lines = [`${parentName} has added ${childName} (${group}) to their account in the app.`, "", ask];
  const text = [...lines, ...(link ? ["", `Approve: ${link}`] : [])].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0"><b>${escape(parentName)}</b> has added <b>${escape(childName)}</b> (${escape(group)}) to their account in the app.</p>
<p>${escape(ask)}</p>
${link ? button(link, "Approve") : ""}`,
  );
  return { to, subject, text, html };
}

const listNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** A parent added the other parent from Player → Your family: a week-long sign-in link, naming who added them. */
export function coParentInviteEmail(opts: { to: string; firstName: string; addedBy: string; children: string[]; link: string; appUrl: string | null }): Email {
  const { to, firstName, addedBy, children, link, appUrl } = opts;
  const names = listNames(children);
  const subject = `${addedBy} added you to the Deen Squad app`;
  const intro = `${addedBy} has added you as a parent of ${names} in the Deen Squad Football Academy app. You'll see club news, can tell the coach if ${names} ${children.length > 1 ? "are" : "is"} coming on Friday, and follow their progress.`;
  const text = [
    `Assalamu alaikum ${firstName},`,
    "",
    intro,
    "",
    "Open this link to sign in. It works for 7 days:",
    link,
    "",
    "To keep the app on your phone, open it in your browser and choose Add to Home Screen. If it asks you to sign in again, enter this email address and we'll send you a 6-digit code.",
    "",
    "Not expecting this? Reply to this email and the club will take you off.",
  ].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum ${escape(firstName)},</p>
<p>${escape(intro)}</p>
${button(link, "Open the app")}
<p style="color:#56625a">This link works for 7 days.</p>
<p style="color:#56625a">To keep the app on your phone, open it in your browser and choose <b>Add to Home Screen</b>. If it asks you to sign in again, enter this email address and we'll send you a 6-digit code.</p>
<p style="color:#56625a;margin-bottom:0">Not expecting this? Reply to this email and the club will take you off.</p>`,
  );
  return { to, subject, text, html };
}

/** Tells the club's admins a parent added another parent to their children. */
export function coParentAddedEmail(opts: {
  to: string;
  addedBy: string;
  parentName: string;
  email: string;
  children: string[];
  invited: boolean;
  link: string | null;
  appUrl: string | null;
}): Email {
  const { to, addedBy, parentName, email, children, invited, link, appUrl } = opts;
  const names = listNames(children);
  const subject = `Parent added by ${addedBy}: ${parentName} for ${names}`;
  const line = `${addedBy} has added ${parentName} (${email}) as a parent of ${names} in the app${invited ? ", and they've been sent a sign-in link" : ". Their sign-in link didn't send: use Send invite on Families"}.`;
  const text = [line, "", "If that doesn't look right, take them off the child on Families.", ...(link ? ["", `See families: ${link}`] : [])].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">${escape(line)}</p>
<p>If that doesn't look right, take them off the child on Families.</p>
${link ? button(link, "See families") : ""}`,
  );
  return { to, subject, text, html };
}

/** A coach published a child's monthly progress report (only sent while progress is switched on for parents). */
export function progressReportEmail(opts: { to: string; firstName: string; childName: string; month: string; link: string | null; appUrl: string | null }): Email {
  const { to, firstName, childName, month, link, appUrl } = opts;
  const subject = `${childName}'s progress report for ${month} is ready`;
  const text = [
    `Assalamu alaikum ${firstName},`,
    "",
    `${childName}'s coach has written their progress report for ${month}. Read it in the app, on ${childName}'s player screen.`,
    ...(link ? ["", link] : []),
  ].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum ${escape(firstName)},</p>
<p>${escape(childName)}'s coach has written their progress report for ${escape(month)}. Read it in the app, on ${escape(childName)}'s player screen.</p>
${link ? button(link, "Read the report") : ""}`,
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

/**
 * A new message in a conversation, for someone without app notifications. Says who wrote and which child, never the
 * message itself: the app is where the club's messages are kept.
 */
export function messageEmail(opts: { to: string; firstName: string; author: string; child: string; toStaff: boolean; link: string; appUrl: string | null }): Email {
  const { to, firstName, author, child, toStaff, link, appUrl } = opts;
  const subject = `New message from ${author} about ${child}`;
  const line = toStaff ? `${author} has sent a message about ${child} in the club app.` : `${author} from the club has sent you a message about ${child}.`;
  const text = [`Assalamu alaikum ${firstName},`, "", line, "", "Open the app to read it and reply:", link].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum ${escape(firstName)},</p>
<p>${escape(line)}</p>
${button(link, "Read the message")}
<p style="color:#56625a;margin-bottom:0">For privacy, messages are kept in the app rather than in email.</p>`,
  );
  return { to, subject, text, html };
}

/** The weekly reminder, for a parent without app notifications: the question as the subject, one big "Answer now". */
export function attendanceReminderEmail(opts: { to: string; firstName: string; question: string; detail: string; link: string; appUrl: string | null }): Email {
  const { to, firstName, question, detail, link, appUrl } = opts;
  const text = [`Assalamu alaikum ${firstName},`, "", question, detail, "", "Answer now:", link].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum ${escape(firstName)},</p>
<p style="font-size:18px;font-weight:700">${escape(question)}</p>
<p>${escape(detail)}</p>
${button(link, "Answer now")}
<p style="color:#56625a;margin-bottom:0">It helps the coaches plan the session.</p>`,
  );
  return { to, subject: question, text, html };
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

/**
 * The owner's monthly summary (src/lib/admin/summary.ts): short lines in sections, each linking to the admin page
 * where it can be acted on. Counts only, no names.
 */
export function monthlySummaryEmail(opts: {
  to: string;
  month: string;
  sections: { title: string; lines: { text: string; path: string }[] }[];
  appUrl: string | null;
}): Email {
  const { to, month, sections, appUrl } = opts;
  const subject = `Deen Squad: ${month} summary`;
  const link = (path: string) => (appUrl ? `${appUrl}${path}` : null);
  const text = [
    `Assalamu alaikum. Here's how ${month} went in the parent app.`,
    ...sections.flatMap((s) => ["", s.title, ...s.lines.map((l) => `- ${l.text}${link(l.path) ? ` ${link(l.path)}` : ""}`)]),
    "",
    "Figures under “Right now” are as they stand today. This email goes to the club's admins on the 1st of each month.",
  ].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum. Here's how <b>${escape(month)}</b> went in the parent app.</p>
${sections
  .map(
    (s) => `<h2 style="font-size:17px;margin:20px 0 6px">${escape(s.title)}</h2>
<ul style="margin:0;padding-left:20px">${s.lines
      .map((l) => {
        const href = link(l.path);
        return `<li style="margin:4px 0">${href ? `<a href="${escape(href)}" style="color:#1f6b2a">${escape(l.text)}</a>` : escape(l.text)}</li>`;
      })
      .join("")}</ul>`,
  )
  .join("\n")}
<p style="font-size:14px;color:#56625a;margin-top:20px">Figures under “Right now” are as they stand today. This email goes to the club's admins on the 1st of each month.</p>`,
  );
  return { to, subject, text, html };
}

/**
 * An accident or incident was logged (src/lib/incidents): to each admin. Who and what kind only, never the details
 * (emails can be read on a shared screen); the record and the message to the parents are in the app.
 */
export function incidentAdminEmail(opts: { to: string; childName: string; group: string; kind: string; by: string; link: string | null; appUrl: string | null }): Email {
  const { to, childName, group, kind, by, link, appUrl } = opts;
  const subject = `${kind} logged for ${childName} (${group})`;
  const lines = [`${by} logged ${kind.toLowerCase() === "something else" ? "an incident" : `"${kind}"`} for ${childName} (${group}).`, "", "The parents have been sent it in the app. The details are on the child's page."];
  const text = [...lines, ...(link ? ["", `Open it: ${link}`] : [])].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">${escape(lines[0])}</p>
<p>The parents have been sent it in the app. The details are on the child's page.</p>
${link ? button(link, "Open the child's page") : ""}`,
  );
  return { to, subject, text, html };
}

/** A family booked a paid trial on /trial: what, when, where, the fee and what to do at the gate. */
export function trialBookedEmail(opts: {
  to: string;
  parentFirstName: string;
  childFirstName: string;
  session: string;
  when: string;
  venue: string | null;
  fee: string;
  appUrl: string | null;
}): Email {
  const { to, parentFirstName, childFirstName, session, when, venue, fee, appUrl } = opts;
  const subject = `${childFirstName}'s trial: ${session}, ${when}`;
  const lines = [
    `Assalamu alaikum ${parentFirstName},`,
    "",
    `${childFirstName}'s trial session with Deen Squad Football Academy is booked: ${session}, ${when}${venue ? `, at ${venue}` : ""}.`,
    "",
    `The trial costs ${fee}, paid by card or cash at the gate on the day. Tell the coach at the gate you're here for ${childFirstName}'s trial.`,
    "",
    "If you can't make it, reply to this email and let the club know.",
  ];
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum ${escape(parentFirstName)},</p>
<p><b>${escape(childFirstName)}'s trial session</b> with Deen Squad Football Academy is booked: ${escape(session)}, ${escape(when)}${venue ? `, at ${escape(venue)}` : ""}.</p>
<p>The trial costs ${escape(fee)}, paid by card or cash at the gate on the day. Tell the coach at the gate you're here for ${escape(childFirstName)}'s trial.</p>
<p>If you can't make it, reply to this email and let the club know.</p>`,
  );
  return { to, subject, text: lines.join("\n"), html };
}

/** To each admin: a trial was booked (who, which group and session; the contact details are on Admin → Trials). */
export function trialAdminEmail(opts: { to: string; childFirstName: string; group: string; session: string; when: string; link: string | null; appUrl: string | null }): Email {
  const { to, childFirstName, group, session, when, link, appUrl } = opts;
  const subject = `Trial booked: ${childFirstName} (${group}), ${when}`;
  const line = `A family has booked a trial for ${childFirstName} (${group}) at ${session}, ${when}. They'll pay the session fee at the gate.`;
  const html = layout(appUrl, `<p style="margin:0">${escape(line)}</p>${link ? button(link, "See trials") : ""}`);
  return { to, subject, text: [line, ...(link ? ["", `See trials: ${link}`] : [])].join("\n"), html };
}

/** After a trial the child came to: thanks, and the link to join the club. */
export function trialFollowUpEmail(opts: { to: string; parentFirstName: string; childFirstName: string; joinUrl: string; appUrl: string | null }): Email {
  const { to, parentFirstName, childFirstName, joinUrl, appUrl } = opts;
  const subject = `Thanks for bringing ${childFirstName} to Deen Squad`;
  const lines = [
    `Assalamu alaikum ${parentFirstName},`,
    "",
    `Thank you for bringing ${childFirstName} to try Deen Squad Football Academy. We hope ${childFirstName} enjoyed it.`,
    "",
    `If you'd like ${childFirstName} to join, sign up in the club's app. It's where you'll get club news, tell the coach who's coming each week and follow ${childFirstName}'s progress.`,
    "",
    `Join the club: ${joinUrl}`,
  ];
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum ${escape(parentFirstName)},</p>
<p>Thank you for bringing ${escape(childFirstName)} to try Deen Squad Football Academy. We hope ${escape(childFirstName)} enjoyed it.</p>
<p>If you'd like ${escape(childFirstName)} to join, sign up in the club's app. It's where you'll get club news, tell the coach who's coming each week and follow ${escape(childFirstName)}'s progress.</p>
${button(joinUrl, "Join the club")}`,
  );
  return { to, subject, text: lines.join("\n"), html };
}

/** A test of a news post, to the member of staff writing it: how it reads before any parent gets it. */
export function newsTestEmail(opts: { to: string; title: string; body: string; appUrl: string | null }): Email {
  const { to, title, body, appUrl } = opts;
  const subject = `Test: ${title}`;
  const text = ["This is a test, sent only to you. No parent has been sent this.", "", title, body].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0;font-weight:800">This is a test, sent only to you. No parent has been sent this.</p>
<div style="border-left:4px solid #c9952f;padding:4px 0 4px 14px;margin:16px 0">
<p style="font-weight:800;margin:0 0 6px">${escape(title)}</p>
<p style="margin:0;white-space:pre-line">${escape(body)}</p></div>
<p style="color:#56625a;margin-bottom:0">Post it from News when it's ready.</p>`,
  );
  return { to, subject, text, html };
}

/** A member of staff's check (DBS, first aid, …) runs out soon or has run out: to them and to each admin. */
export function staffCheckEmail(opts: { to: string; forThem: boolean; staffName: string; check: string; when: string; expired: boolean; link: string | null; appUrl: string | null }): Email {
  const { to, forThem, staffName, check, when, expired, link, appUrl } = opts;
  const whose = forThem ? "Your" : `${staffName}'s`;
  const subject = `${whose} ${check} ${expired ? "has run out" : `runs out ${when}`}`;
  const first = expired ? `${whose} ${check} ran out on ${when}.` : `${whose} ${check} runs out on ${when}.`;
  const next = forThem ? "Please book a renewal and send the club the new details." : "Ask them to renew it, then update the date on the Staff page.";
  const text = [first, "", next, ...(link ? ["", `Open it: ${link}`] : [])].join("\n");
  const html = layout(appUrl, `<p style="margin:0">${escape(first)}</p>\n<p>${escape(next)}</p>\n${link ? button(link, "Open staff checks") : ""}`);
  return { to, subject, text, html };
}

/** A parent's wellbeing check-in needs a look (not great, or with a note). Never the mood or the note itself. */
export function wellbeingAlertEmail(opts: { to: string; childFirstName: string; group: string; link: string | null; appUrl: string | null }): Email {
  const { to, childFirstName, group, link, appUrl } = opts;
  const subject = `Wellbeing check-in to look at: ${childFirstName} (${group})`;
  const line = `A parent has shared how ${childFirstName} (${group}) is feeling and it may need a follow-up. Open the app to read it; only the club's admins can see it.`;
  const text = [line, ...(link ? ["", `Open it: ${link}`] : [])].join("\n");
  const html = layout(appUrl, `<p style="margin:0">${escape(line)}</p>\n${link ? button(link, "Open wellbeing check-ins") : ""}`);
  return { to, subject, text, html };
}

/**
 * How to turn on app notifications (sent by an admin to parents on the app with them off). Steps for iPhone and
 * Android, as the app's own help says; the link opens Home, where the "Turn on notifications" button is.
 */
export function notificationHelpEmail(opts: { to: string; firstName: string; link: string; appUrl: string | null }): Email {
  const { to, firstName, link, appUrl } = opts;
  const subject = "Turn on Deen Squad notifications so you don't miss club news";
  const iphone = [
    "Open Safari and go to the app (the button below).",
    "Tap Share, then Add to Home Screen, then Add.",
    "Open Deen Squad from your Home Screen (not Safari) and tap Turn on notifications, then Allow.",
  ];
  const android = ["Open the app (the button below) in Chrome.", "Tap Turn on notifications near the top of Home, then Allow."];
  const text = [
    `Assalamu alaikum ${firstName},`,
    "",
    "Notifications are off for you in the Deen Squad app, so you can miss cancelled sessions, kit news and messages from the coaches. It takes a minute to turn them on.",
    "",
    "iPhone:",
    ...iphone.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Android:",
    ...android.map((s, i) => `${i + 1}. ${s}`),
    "",
    `Open the app: ${link}`,
    "",
    "If your phone says notifications are blocked, the app shows where to switch them back on.",
  ].join("\n");
  const list = (steps: string[]) => `<ol style="margin:8px 0 0;padding-left:22px">${steps.map((s) => `<li>${escape(s)}</li>`).join("")}</ol>`;
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum ${escape(firstName)},</p>
<p>Notifications are off for you in the Deen Squad app, so you can miss cancelled sessions, kit news and messages from the coaches. It takes a minute to turn them on.</p>
<p style="margin:16px 0 0"><b>iPhone</b></p>${list(iphone)}
<p style="margin:16px 0 0"><b>Android</b></p>${list(android)}
${button(link, "Open the app")}
<p style="color:#56625a;margin-bottom:0">If your phone says notifications are blocked, the app shows where to switch them back on.</p>`,
  );
  return { to, subject, text, html };
}

/** To a child's parents when the child reaches the reward points (the owner gives the reward). */
export function pointsRewardParentEmail(opts: { to: string; firstName: string; childFirstName: string; points: number; link: string; appUrl: string | null }): Email {
  const { to, firstName, childFirstName, points, link, appUrl } = opts;
  const subject = `Masha'Allah, ${childFirstName} has reached ${points} points`;
  const lines = [
    `Assalamu alaikum ${firstName},`,
    `${childFirstName} has reached ${points} points from the coaches. Masha'Allah, fantastic news. The club will give ${childFirstName} a reward to say well done.`,
  ];
  const text = [...lines.flatMap((l) => [l, ""]), `See ${childFirstName}'s points: ${link}`].join("\n");
  const html = layout(appUrl, `${lines.map((l) => `<p style="margin:0 0 12px">${escape(l)}</p>`).join("\n")}\n${button(link, `See ${childFirstName}'s points`)}`);
  return { to, subject, text, html };
}

/** To a child's parents (without app notifications) once the coaches have given stars, points or badges. */
export function awardParentEmail(opts: { to: string; firstName: string; childFirstName: string; awards: string; reason: string | null; link: string; appUrl: string | null }): Email {
  const { to, firstName, childFirstName, awards, reason, link, appUrl } = opts;
  const subject = `Masha'Allah, ${childFirstName} got ${awards}`;
  const lines = [
    `Assalamu alaikum ${firstName},`,
    `The coaches gave ${childFirstName} ${awards}.${reason ? ` They said: "${reason}"` : ""}`,
  ];
  const text = [...lines.flatMap((l) => [l, ""]), `See ${childFirstName}'s progress: ${link}`].join("\n");
  const html = layout(appUrl, `${lines.map((l) => `<p style="margin:0 0 12px">${escape(l)}</p>`).join("\n")}\n${button(link, `See ${childFirstName}'s progress`)}`);
  return { to, subject, text, html };
}

/** To each admin when a child reaches the reward points, so the reward can be given. */
export function pointsRewardAdminEmail(opts: { to: string; child: string; group: string; points: number; link: string; appUrl: string | null }): Email {
  const { to, child, group, points, link, appUrl } = opts;
  const subject = `${child} (${group}) has reached ${points} points`;
  const line = `${child} (${group}) has reached ${points} points. Their parents have been told the club will give a reward. Tick it off on Rewards once it's given.`;
  const text = [line, "", `Open Rewards: ${link}`].join("\n");
  const html = layout(appUrl, `<p style="margin:0">${escape(line)}</p>\n${button(link, "Open Rewards")}`);
  return { to, subject, text, html };
}

/** To a child's parents once an admin has approved the child: the group's news and sessions are now in the app. */
export function childApprovedEmail(opts: { to: string; firstName: string; childFirstName: string; group: string; link: string; appUrl: string | null }): Email {
  const { to, firstName, childFirstName, group, link, appUrl } = opts;
  const subject = `${childFirstName} is all set in the Deen Squad app`;
  const lines = [`Assalamu alaikum ${firstName},`, `The club has checked ${childFirstName}'s details. You can now see the ${group} news and sessions in the app.`];
  const text = [...lines.flatMap((l) => [l, ""]), `Open the app: ${link}`].join("\n");
  const html = layout(appUrl, `${lines.map((l) => `<p style="margin:0 0 12px">${escape(l)}</p>`).join("\n")}\n${button(link, "Open the app")}`);
  return { to, subject, text, html };
}

/** To each admin when a parent asked to add someone whose email the club already has (they weren't linked). */
export function coParentRequestEmail(opts: { to: string; addedBy: string; parentName: string; email: string; children: string[]; link: string; appUrl: string | null }): Email {
  const { to, addedBy, parentName, email, children, link, appUrl } = opts;
  const list = children.length === 1 ? children[0] : `${children.slice(0, -1).join(", ")} and ${children.at(-1)}`;
  const subject = `Check a parent link: ${addedBy} asked to add ${parentName}`;
  const lines = [
    `${addedBy} asked to add ${parentName} (${email}) as a parent or carer of ${list}.`,
    "That email already belongs to a parent in the app, so they haven't been linked. If it's right, add them on the child's page with that email. If not, there's nothing to do.",
  ];
  const text = [...lines.flatMap((l) => [l, ""]), `Open the child's page: ${link}`].join("\n");
  const html = layout(appUrl, `${lines.map((l) => `<p style="margin:0 0 12px">${escape(l)}</p>`).join("\n")}\n${button(link, "Open the child's page")}`);
  return { to, subject, text, html };
}
