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
    `Your sign-in code is ${code}. It works for 15 minutes.`,
    link ? `\nOr open this link on the device you want to sign in on:\n${link}` : "",
    "",
    "If you didn't ask to sign in, you can ignore this email.",
  ].join("\n");
  const html = layout(
    appUrl,
    `<p style="margin:0">Assalamu alaikum,</p>
<p>Your sign-in code is</p>
<p style="font-size:34px;font-weight:800;letter-spacing:.2em;margin:8px 0 4px">${code}</p>
<p style="color:#56625a;margin-top:0">It works for 15 minutes.</p>
${link ? `<p>Or tap below on the phone you want to sign in on.</p>${button(link, "Sign in")}` : ""}
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
