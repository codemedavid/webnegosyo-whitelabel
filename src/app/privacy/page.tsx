import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - WebNegosyo",
  description: "Privacy Policy for the WebNegosyo smart menu platform.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Privacy Policy
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          Last updated: November 4, 2026
        </p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              1. Introduction
            </h2>
            <p>
              WebNegosyo (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;)
              operates the WebNegosyo platform, including our website and mobile
              applications. This Privacy Policy explains how we collect, use,
              disclose, and safeguard your information when you use our services.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              2. Information We Collect
            </h2>

            <h3 className="mb-2 mt-4 text-lg font-medium text-gray-800">
              Account Information
            </h3>
            <p>
              When you create a merchant account, we collect your name and email
              address for authentication and account management purposes.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-gray-800">
              Usage Data
            </h3>
            <p>
              We use PostHog, a product analytics tool, to collect information
              about how you interact with our app. This includes app launches,
              screen views, and feature usage. This data helps us understand how
              our platform is used and improve the experience.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-gray-800">
              Device Information
            </h3>
            <p>
              We collect device identifiers (push notification tokens) through
              Expo Push Notifications to deliver real-time order alerts to
              merchant devices.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-gray-800">
              Diagnostics
            </h3>
            <p>
              We use Sentry to collect crash logs and performance data. This
              includes error reports, stack traces, and app performance metrics.
              This data is used solely to identify and fix technical issues.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              3. Facebook and Messenger Data
            </h2>
            <p>
              Merchants can connect their Facebook Page to WebNegosyo through
              Facebook Login so that orders and menu replies are delivered in
              Messenger. We request only the <code>pages_show_list</code>,{" "}
              <code>pages_messaging</code> and <code>pages_manage_metadata</code>{" "}
              permissions. This section explains what we receive through that
              integration and what we do with it.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-gray-800">
              What We Receive
            </h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>From merchants:</strong> the name and ID of each Facebook
                Page you choose to connect, a Page access token for each of
                those Pages, and your Facebook user access token, which we use
                only to list the Pages you manage so you can choose one. We do
                not receive your Facebook password.
              </li>
              <li>
                <strong>From customers who message a connected Page:</strong>{" "}
                the Page-scoped ID (PSID) that Messenger assigns to you for that
                Page, the messages and button taps you send to that Page, and the
                order reference included when you open Messenger from a store&apos;s
                checkout. We do not receive your Facebook profile, friends list
                or contact details through Messenger.
              </li>
              <li>
                <strong>Messages a Page sends:</strong> Messenger also tells us
                when a connected Page sends a message (an &quot;echo&quot;), so
                that a merchant can send their menu to a customer from their own
                inbox.
              </li>
            </ul>

            <h3 className="mb-2 mt-4 text-lg font-medium text-gray-800">
              How We Use It
            </h3>
            <p>
              We use this data only to run the Messenger features the merchant
              turned on: sending the customer&apos;s order summary and status
              updates, and menu replies, to the merchant&apos;s Messenger
              conversation with that customer. We store the customer&apos;s PSID
              with their order and in a Messenger session record for that store
              so that replies reach the right conversation. We do not use
              Facebook data for advertising, profiling or any other purpose.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-gray-800">
              How We Store and Protect It
            </h3>
            <p>
              Data travels over encrypted connections (HTTPS/TLS) and is stored
              in our database, which uses row-level security so each store can
              reach only its own records. Page and user access tokens are read
              only by our servers; they are never sent to browsers or shown in
              the merchant dashboard. We do not keep a history of the messages
              customers send; message events may appear briefly in our hosting
              provider&apos;s server logs, which are kept for a limited time for
              troubleshooting.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-gray-800">
              Sharing
            </h3>
            <p>
              We do not sell or rent Facebook data, and we do not share it with
              advertisers or data brokers. It is processed only by the service
              providers that host our platform: Supabase (database hosting) and
              Vercel (website and server hosting). Messages are
              delivered through Meta&apos;s Messenger platform, under Meta&apos;s
              own terms and policies.
            </p>

            <h3 className="mb-2 mt-4 text-lg font-medium text-gray-800">
              Retention and Deletion
            </h3>
            <p>
              We keep a Page&apos;s connection, including its access tokens,
              until the merchant disconnects it. Disconnecting the Page in{" "}
              <strong>Admin &rarr; Settings &rarr; Messenger</strong> deletes the
              stored Page and user access tokens and unsubscribes our app from
              the Page, so we stop receiving its messages. Orders, including the
              PSID stored with them, are kept as part of the merchant&apos;s
              business records until the merchant deletes them or we receive a
              deletion request. To ask us to delete your data, follow the steps
              on our{" "}
              <Link href="/data-deletion" className="text-gray-900 underline">
                data deletion instructions
              </Link>{" "}
              page.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              4. How We Use Your Information
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>App Functionality:</strong> To authenticate your account,
                deliver push notifications for new orders, and provide core
                platform features.
              </li>
              <li>
                <strong>Analytics:</strong> To understand how our platform is
                used and improve features and user experience.
              </li>
              <li>
                <strong>Diagnostics:</strong> To identify, diagnose, and fix
                bugs and performance issues.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              5. Third-Party Services
            </h2>
            <p className="mb-3">
              We use the following third-party services that may process your
              data:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Supabase</strong> &mdash; Authentication and database
                hosting
              </li>
              <li>
                <strong>Vercel</strong> &mdash; Website and server hosting
              </li>
              <li>
                <strong>Meta (Facebook Messenger)</strong> &mdash; Delivery of
                order and menu messages for stores that connect a Facebook Page
              </li>
              <li>
                <strong>PostHog</strong> &mdash; Product analytics
              </li>
              <li>
                <strong>Sentry</strong> &mdash; Error tracking and performance
                monitoring
              </li>
              <li>
                <strong>Expo</strong> &mdash; Push notification delivery
              </li>
              <li>
                <strong>Cloudflare</strong> &mdash; Image storage and processing, DNS, and email delivery
              </li>
              <li>
                <strong>ImageKit</strong> &mdash; Image storage and processing
              </li>
              <li>
                <strong>Convex</strong> &mdash; Real-time data synchronization
              </li>
            </ul>
            <p className="mt-3">
              Each of these services has its own privacy policy governing the use
              of your data.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              6. Data Sharing
            </h2>
            <p>
              We do not sell, trade, or rent your personal information to third
              parties. We do not use your data for advertising or tracking
              purposes. Data is shared with third-party services only as
              necessary to provide the functionality described above.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              7. Data Retention
            </h2>
            <p>
              We retain your account information for as long as your account is
              active. Diagnostic and analytics data is retained according to the
              default retention policies of our third-party service providers.
              Facebook and Messenger data is kept as described in Section 3. You
              may request deletion of your account and associated data at any
              time by following our{" "}
              <Link href="/data-deletion" className="text-gray-900 underline">
                data deletion instructions
              </Link>{" "}
              or by contacting us.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              8. Data Security
            </h2>
            <p>
              We implement appropriate technical and organizational measures to
              protect your personal information, including encrypted connections
              (HTTPS/TLS), row-level security on our database, and secure
              authentication practices.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              9. Your Rights
            </h2>
            <p>You have the right to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Withdraw consent for data processing</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, please contact us using the
              information below.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              10. Children&apos;s Privacy
            </h2>
            <p>
              Our services are not directed to individuals under the age of 13.
              We do not knowingly collect personal information from children. If
              we become aware that a child has provided us with personal
              information, we will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              11. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify
              you of any changes by posting the new Privacy Policy on this page
              and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              12. Contact Us
            </h2>
            <p>
              If you have questions about this Privacy Policy or wish to exercise
              your data rights, please contact us:
            </p>
            <p className="mt-3">
              <strong>WebNegosyo</strong>
              <br />
              Email: webnogosyo3@gmail.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
