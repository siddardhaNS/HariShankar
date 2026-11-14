import type { Metadata } from "next";
import { H2, PublicPage } from "@/components/PublicPage";
import { DeleteAccountForm } from "./DeleteAccountForm";

export const metadata: Metadata = { title: { absolute: "Delete your account · Hari Shankar Picture Palace" } };

export default function DeleteAccountPage() {
  return (
    <PublicPage title="Delete your account">
      <p>
        You can delete your Hari Shankar app account here, or in the app under <b>Profile → Delete account</b>.
      </p>
      <H2>What is deleted</H2>
      <p>
        Your mobile number, name, gender and age group answers, offer and reminder choices, notification tokens,
        rating comments and the messages we sent you. This can&rsquo;t be undone.
      </p>
      <H2>What is kept</H2>
      <p>
        Past bookings and payments stay in the theatre&rsquo;s sales and GST records, as the law requires, but without
        your name or number. If you have a ticket for a show that hasn&rsquo;t happened yet, a payment still being
        checked, or a refund still to come, please wait until that is finished.
      </p>
      <H2>Delete now</H2>
      <DeleteAccountForm />
    </PublicPage>
  );
}
