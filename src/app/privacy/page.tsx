import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { clubEmail } from "@/lib/config";

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

export default function PrivacyPage() {
  const email = clubEmail();
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
    <AuthShell title="Privacy notice" intro={`How The Deen Squad Football Academy uses your family's information. Last updated ${UPDATED}.`}>
      <div className="flex flex-col gap-6 rounded-app border-2 border-line bg-paper p-4">
        <Part title="Who we are">
          <p>
            The Deen Squad Football Academy (&ldquo;the club&rdquo;, &ldquo;we&rdquo;) runs football training and matches for children. We decide how
            your information is used, so under UK data protection law we are the &ldquo;controller&rdquo;. To ask anything about your information, {contact}.
          </p>
        </Part>

        <Part title="What we collect">
          <p>About you, the parent or carer:</p>
          <List items={["your name, email address and phone number", "which children you look after and your relationship to them", "whether you have read club news, and the date you signed the club contract"]} />
          <p>About your child:</p>
          <List
            items={[
              "name, date of birth, age group, shirt number and position",
              "whether they are coming to each session, and when they were checked in at the gate",
              "your answer about club photos",
              "emergency contacts you give us (please check they are happy for you to share their details)",
              "points, stars, badges and notes from the coaches",
              "kit they have ordered from the club shop",
            ]}
          />
          <p>
            When you use the app we also keep a record of when you signed in and the device&apos;s internet address, to keep accounts secure. If you turn on
            notifications, we store the address your phone gives us to send them.
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
                <b>Photos</b>: only with your consent, which you can change at any time on your child&apos;s To-do list.
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
                <b>Apple, Google and your browser&apos;s notification service</b> deliver notifications if you turn them on.
              </>,
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
              "correct anything that is wrong (you can change contacts and photo consent yourself in the app)",
              "delete information we no longer need",
              "stop or limit how we use it, or object to how we use it",
              "give you a copy to take elsewhere",
            ]}
          />
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
