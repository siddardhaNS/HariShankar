import type { Metadata } from "next";
import Link from "next/link";
import { H2, PublicPage } from "@/components/PublicPage";
import { CONTACT } from "@/lib/contact";

export const metadata: Metadata = { title: { absolute: "Privacy policy · Hari Shankar Picture Palace" } };

function Contact() {
  return (
    <ul className="list-disc space-y-1 pl-5">
      <li>{CONTACT.name}, {CONTACT.address}</li>
      {CONTACT.email && <li>Email: <a className="text-brand underline" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li>}
      {CONTACT.phone && <li>Phone: {CONTACT.phone}</li>}
    </ul>
  );
}

export default function PrivacyPage() {
  return (
    <PublicPage title="Privacy policy" updated="14 November 2026">
      <p>
        This policy covers the Hari Shankar app and website, run by {CONTACT.name} (&ldquo;the theatre&rdquo;, &ldquo;we&rdquo;),
        where you book movie tickets for the theatre in Palasa. It says what we collect, why, who else handles it, and
        how you can delete it.
      </p>

      <H2>What we collect</H2>
      <ul className="list-disc space-y-2 pl-5">
        <li><b>Mobile number</b>, to log you in with a one-time code and to send your tickets and show reminders.</li>
        <li><b>Name</b>, if you give one, printed on your ticket so staff can help you at the gate.</li>
        <li><b>Gender and age group</b>, only if you choose to answer. They are only ever counted in totals to plan shows, never shown with your name.</li>
        <li><b>Bookings and payments</b>: the show, seats, amounts, offers used and the UPI reference you enter so staff can match your payment. We never see or store your UPI PIN, bank or card details; you pay in your own UPI app.</li>
        <li><b>Ratings</b> you give to movies you watched.</li>
        <li><b>A notification token</b> for your phone, if you allow app notifications, so we can send ticket updates and reminders.</li>
        <li><b>Your choices</b> about offers and reminders.</li>
      </ul>
      <p>
        The camera is used only by theatre staff, in the app&rsquo;s gate scanner, to read ticket QR codes. Pictures are not saved or sent anywhere.
        We do not collect your location, contacts or photos, and the app has no advertising or tracking.
      </p>

      <H2>How we use it</H2>
      <ul className="list-disc space-y-2 pl-5">
        <li>To sell you tickets, check them at the gate, and handle refunds when a show is cancelled.</li>
        <li>To send your ticket, booking updates and show reminders on WhatsApp and in the app. You can turn reminders off in your profile.</li>
        <li>To send offers and new releases, only if you turn that on. You can turn it off at any time.</li>
        <li>To keep the theatre&rsquo;s sales, GST and accounting records, as the law requires.</li>
        <li>To understand, in totals, which shows people book and when, so the theatre can plan.</li>
      </ul>
      <p>We do not sell your data or share it with anyone for their own marketing.</p>

      <H2>Who else handles it</H2>
      <p>Only services that run the app for us, and only for that purpose:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Our hosting and database providers, which store the data on their servers.</li>
        <li>WhatsApp messaging and SMS providers, to deliver your tickets, login codes and messages.</li>
        <li>Expo and Google (Firebase Cloud Messaging), to deliver app notifications to your phone.</li>
        <li>Government authorities, when the law requires it (for example tax records).</li>
      </ul>

      <H2>How long we keep it</H2>
      <p>
        Your account details stay until you delete your account. Booking and payment records are kept for as long as
        tax and accounting law requires, even after you delete your account, but without your name or mobile number.
        One-time login codes expire within minutes.
      </p>

      <H2>Deleting your account</H2>
      <p>
        In the app, open <b>Profile</b> and tap <b>Delete account</b>. Or use the{" "}
        <Link href="/delete-account" className="text-brand underline">Delete your account</Link> page on this website.
        Your mobile number, name, profile answers, notification tokens, rating comments and message history are removed.
        Past bookings stay in the theatre&rsquo;s accounts without anything that identifies you.
      </p>

      <H2>Security</H2>
      <p>
        Data travels over encrypted connections. Login codes are stored only in scrambled (hashed) form, and staff
        see only what their role needs.
      </p>

      <H2>Children</H2>
      <p>The app is not meant for children under 13 to use on their own. A parent or guardian should book for them.</p>

      <H2>Changes</H2>
      <p>If this policy changes, we will update this page and the date at the top.</p>

      <H2>Contact</H2>
      <p>Questions about your data, or a request to see or correct it:</p>
      <Contact />
    </PublicPage>
  );
}
