import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { getCurrentUser } from "@/lib/auth/session";
import { smsConfigured } from "@/lib/chase/senders";
import { clubEmail } from "@/lib/config";
import { backPath } from "@/lib/viewer";
import { analyticsConfig, sentryConfigured } from "@/lib/observability/config";

export const metadata: Metadata = { title: "Privacy notice" };

const UPDATED = "October 2026";

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[19px] font-extrabold">{title}</h2>
      <div className="flex flex-col gap-2 text-[15px] leading-[23px]">{children}</div>
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default async function PrivacyPage({ searchParams }: PageProps<"/privacy">) {
  const email = clubEmail();
  // Listed only when they're switched on, so the notice stays true either way.
  const sentry = sentryConfigured();
  const analytics = analyticsConfig();
  const sms = smsConfigured();
  // Back to the player screen (which links here, with the child that was showing in `from`) when signed in, otherwise
  // to sign in. `from` is only ever a path inside the app (backPath), never another site.
  const back = (await getCurrentUser()) ? backPath((await searchParams).from, "/player") : "/sign-in";
  const contact = email ? (
    <>
      email{" "}
      <a href={`mailto:${email}`} className="font-bold text-grass-text underline">
        {email}
      </a>{" "}
      or speak to any coach
    </>
  ) : (
    "speak to any coach or club admin at training"
  );

  return (
    <AuthShell title="Privacy notice" back={back} intro={`How The Deen Squad Football Academy uses your family's information. Last updated ${UPDATED}.`}>
      <div className="flex flex-col gap-6 rounded-app border-2 border-line bg-paper p-4">
        <Part title="Who we are">
          <p>
            The Deen Squad Football Academy (&ldquo;the club&rdquo;, &ldquo;we&rdquo;) runs football training and matches for children. We decide how
            your information is used, so under UK data protection law we are the &ldquo;controller&rdquo;. To ask anything about your information, {contact}.
          </p>
        </Part>

        <Part title="What we collect">
          <p>About you, the parent or carer:</p>
          <List
            items={[
              "your name, email address and phone number",
              "which children you look after and your relationship to them",
              "whether you have read club news, and the date you signed the club contract",
              "if you ask us to delete your account, the date you asked",
            ]}
          />
          <p>About your child:</p>
          <List
            items={[
              "name, date of birth, group, shirt number and position",
              "whether they are coming to each session, and when they were checked in at the gate",
              "your answer about club photos",
              "a photo of your child, if you add one and have said yes to photos: seen only by the club's coaches and admins (on the register, to learn names), never by other parents; stored small, without its location or camera details; deleted when you remove it or turn photo consent off (nightly backups keep it for up to 30 days)",
              "emergency contacts you give us (please check they are happy for you to share their details)",
              "points, stars, badges and notes from the coaches",
              "kit they have ordered from the club shop",
            ]}
          />
          <p>
            When you use the app we also keep a record of when you signed in and the device&apos;s internet address, to keep accounts secure. If you turn on
            notifications, we store the address your phone gives us to send them.
          </p>
          <p>
            If you add the club&apos;s sessions to your calendar (on the player screen), we keep a scrambled copy of your private calendar link, not the
            link itself. Your calendar app (or a calendar service you choose, such as Google Calendar) then fetches your children&apos;s sessions (with their first names) from the app every few hours. Anyone you give
            the link to can see them too, so keep it to yourself; resetting it stops the old link working.
          </p>
          <p>We do not ask for health information in the app. If your child has a medical need the coaches should know about, please tell a coach directly.</p>
        </Part>

        <Part title="Why we use it">
          <List
            items={[
              <>
                <b>To run the club and your child&apos;s place in it</b> (registration, sessions, the register, the contract, kit orders): this is needed for
                the agreement between your family and the club.
              </>,
              <>
                <b>To keep children safe</b> (knowing who is at training, who to call in an emergency): our legitimate interest, and our safeguarding duties.
              </>,
              <>
                <b>To keep in touch</b> (club news, reminders to read important messages, session plans): our legitimate interest in running the club well.
              </>,
              <>
                <b>Photos</b>: only with your consent, which you can change at any time on your child&apos;s To-do list. Saying yes covers photos shared
                with parents, in the app and on the club&apos;s social media.
              </>,
            ]}
          />
          <p>We never sell your information or use it for advertising.</p>
        </Part>

        <Part title="Who can see it">
          <List
            items={[
              "Club admins can see every family. Coaches see the children in the groups they coach.",
              "Other parents never see your details. They only see how many children in a group are coming to a session, not who.",
            ]}
          />
          <p>We use a few trusted companies to run the app. They handle information only on our instructions:</p>
          <List
            items={[
              <>
                <b>Railway</b> hosts the app and its database.
              </>,
              <>
                <b>Resend</b> sends the app&apos;s emails, such as sign-in codes and reminders.
              </>,
              <>
                <b>Anthropic</b> (Claude) helps coaches tidy up text they write, such as session plans and notes. Coaches are asked not to include
                children&apos;s surnames, and nothing is sent to parents without a coach checking it.
              </>,
              <>
                <b>SumUp</b> takes card payments in the club shop. Your card details go to SumUp, never to the club or the app.
              </>,
              <>
                <b>YouTube</b> (Google): coaches can add a YouTube video to a session plan or practice sheet. The app shows its picture, which comes from
                YouTube; the video itself loads from YouTube only if you tap to play it, in YouTube&apos;s privacy-enhanced mode, under Google&apos;s own
                privacy notice.
              </>,
              <>
                <b>Apple, Google and your browser&apos;s notification service</b> deliver notifications if you turn them on.
              </>,
              ...(sms
                ? [
                    <>
                      <b>Twilio</b> sends text messages to your phone number when you haven&apos;t read an important club message after two days.
                    </>,
                  ]
                : []),
              <>
                <b>WhatsApp</b> (owned by Meta): a coach or club admin may message you on WhatsApp, for example to ask you to read an important club
                message. The app opens WhatsApp with your phone number, and the message then goes through WhatsApp, under its own privacy notice.
              </>,
              ...(sentry
                ? [
                    <>
                      <b>Sentry</b> receives a report when something goes wrong in the app, so we can fix it. A report says which screen it was, what
                      went wrong and the type of phone or browser, with a random number standing for your account. It never includes your name, email
                      address or your child&apos;s details.
                    </>,
                  ]
                : []),
              ...(analytics
                ? [
                    <>
                      <b>{analytics.provider === "plausible" ? "Plausible" : "Umami"}</b> counts how often each screen is opened, so we can see what is
                      useful. The counts are anonymous: no cookies, nothing saved on your phone, and no names or email addresses. If your browser asks
                      sites not to track you, nothing is counted.
                    </>,
                  ]
                : []),
            ]}
          />
          <p>
            Monthly fees are taken through <b>TeamFeePay</b>, which you sign up to separately; TeamFeePay has its own privacy notice. We may also share
            information when the law requires it, for example with safeguarding authorities, or with the Football Association or a league when your child
            plays in a match or tournament.
          </p>
        </Part>

        <Part title="Where it is stored">
          <p>
            The app&apos;s database and some of the companies above are based in the United States. Where your information is handled outside the UK, we rely
            on the protections UK law requires for international transfers, such as the UK&apos;s data bridge with the US or standard contract terms.
          </p>
          <p>
            Every night we make a backup copy of the database, so nothing is lost if something goes wrong. The copies are kept for 30 days in a private
            storage area run by Railway in the EU (Amsterdam), then deleted.
          </p>
        </Part>

        <Part title="How long we keep it">
          <List
            items={[
              "While your child is at the club, we keep their record.",
              "When they leave, we delete their record and your account within 12 months, unless you ask us to do it sooner.",
              "We may keep attendance and safeguarding records for longer where the law or our safeguarding duties require it.",
              "Shop orders and payment records are kept for 6 years for accounting.",
              "Sign-in codes expire after 15 minutes and old sign-in records are deleted after 30 days.",
            ]}
          />
        </Part>

        <Part title="Your rights">
          <p>You can ask us to:</p>
          <List
            items={[
              "see the information we hold about you or your child",
              "correct anything that is wrong (you can change your own name and mobile, your children's names and dates of birth, contacts and photo consent yourself in the app, on the player screen)",
              "delete information we no longer need",
              "stop or limit how we use it, or object to how we use it",
              "give you a copy to take elsewhere",
            ]}
          />
          <p>
            You can do two of these yourself in the app: on the player screen, under <b>Your data</b>, download a copy of what the app holds about you
            and your children, or ask us to delete your account.
          </p>
          <p>To use any of these rights, {contact}. We will reply within one month.</p>
          <p>
            If you are unhappy with how we have used your information, please tell us first so we can put it right. You can also complain to the
            Information Commissioner&apos;s Office (ICO) at{" "}
            <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer" className="font-bold text-grass-text underline">
              ico.org.uk
            </a>{" "}
            or on 0303 123 1113.
          </p>
        </Part>

        <Part title="Changes to this notice">
          <p>If we change how we use your information, we will update this page and tell you in the app.</p>
        </Part>
      </div>
    </AuthShell>
  );
}
