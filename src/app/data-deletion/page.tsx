import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Deletion Instructions - WebNegosyo",
  description:
    "How to remove your Facebook, Messenger and WebNegosyo data from the WebNegosyo platform.",
};

const CONTACT_EMAIL = "webnogosyo3@gmail.com";
const DELETION_REQUEST_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Data deletion request")}`;

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Data Deletion Instructions
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          Last updated: November 4, 2026
        </p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <p>
              This page explains how to remove the data WebNegosyo holds about
              you, including data we receive through Facebook Login and
              Messenger. For what we collect and why, see our{" "}
              <Link href="/privacy" className="text-gray-900 underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              1. Merchants: Disconnect Your Facebook Page
            </h2>
            <p className="mb-3">
              If you connected a Facebook Page to your WebNegosyo store, you can
              remove the connection yourself at any time:
            </p>
            <ol className="list-decimal space-y-2 pl-6">
              <li>Sign in to your store&apos;s admin dashboard.</li>
              <li>
                Go to <strong>Admin &rarr; Settings &rarr; Messenger</strong>.
              </li>
              <li>
                Press <strong>Disconnect</strong> next to the Page.
              </li>
            </ol>
            <p className="mt-3">
              This takes effect immediately: we unsubscribe our app from the
              Page, so we stop receiving its messages, and we delete the stored
              Page access token and your Facebook user access token.
            </p>
            <p className="mt-3">
              You can also remove our app from Facebook: open Facebook{" "}
              <strong>Settings &amp; privacy &rarr; Settings &rarr; Business
              Integrations</strong>, find <strong>WebNegosyo</strong>, and choose{" "}
              <strong>Remove</strong>. This revokes the access you gave us on
              Facebook&apos;s side.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              2. Anyone: Request Deletion by Email
            </h2>
            <p>
              Anyone can ask us to delete their data, including customers who
              ordered from a store or messaged a store&apos;s Facebook Page.
              Email{" "}
              <a
                href={DELETION_REQUEST_HREF}
                className="text-gray-900 underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              with the subject <strong>&quot;Data deletion request&quot;</strong>{" "}
              and tell us:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                The Facebook Page or WebNegosyo store you interacted with
              </li>
              <li>
                Details that help us find your records, such as the name or
                phone number used on your orders, or the approximate date you
                ordered or messaged the store
              </li>
            </ul>
            <p className="mt-3">
              We may ask you to confirm the request comes from you. We will
              complete it and confirm by email within 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              3. What Gets Deleted
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Disconnecting a Page:</strong> the Page access token,
                your Facebook user access token, any unfinished connection
                attempts, and our app&apos;s subscription to the Page&apos;s
                messages.
              </li>
              <li>
                <strong>Messenger customers:</strong> the Messenger session
                records that link your Page-scoped ID (PSID) to a store, and the
                PSID stored with your orders, so the store can no longer message
                you through our platform.
              </li>
              <li>
                <strong>Customers&apos; order details:</strong> the name and
                contact details on your orders are deleted or anonymised. Where a
                store must keep a sale for its tax or accounting records, we keep
                only what that record requires.
              </li>
              <li>
                <strong>Merchant accounts:</strong> your account, store settings,
                menu and connected integrations.
              </li>
            </ul>
            <p className="mt-3">
              Messages you exchanged in Messenger live in Facebook and in the
              store&apos;s Page inbox; we cannot delete those, but you can
              delete the conversation in Messenger.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              4. Contact Us
            </h2>
            <p>
              If you have questions about deleting your data, please contact us:
            </p>
            <p className="mt-3">
              <strong>WebNegosyo</strong>
              <br />
              Email: {CONTACT_EMAIL}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
