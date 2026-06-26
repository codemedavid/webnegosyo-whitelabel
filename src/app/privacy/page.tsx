import type { Metadata } from "next";

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
          Last updated: April 4, 2026
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
              3. How We Use Your Information
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
              4. Third-Party Services
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
              5. Data Sharing
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
              6. Data Retention
            </h2>
            <p>
              We retain your account information for as long as your account is
              active. Diagnostic and analytics data is retained according to the
              default retention policies of our third-party service providers.
              You may request deletion of your account and associated data at any
              time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              7. Data Security
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
              8. Your Rights
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
              9. Children&apos;s Privacy
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
              10. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify
              you of any changes by posting the new Privacy Policy on this page
              and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              11. Contact Us
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
