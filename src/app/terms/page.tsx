import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - WebNegosyo",
  description: "Terms of Service for the WebNegosyo smart menu platform.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Terms of Service
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          Last updated: November 4, 2026
        </p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              1. About These Terms
            </h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your use of the
              WebNegosyo platform, including our website, online menus,
              merchant dashboard and mobile applications (the
              &quot;Services&quot;), operated by WebNegosyo (&quot;we&quot;,
              &quot;our&quot;, or &quot;us&quot;). By using the Services you
              agree to these Terms. If you do not agree, please do not use the
              Services.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              2. What We Provide
            </h2>
            <p>
              WebNegosyo provides software. Merchants use it to publish an
              online menu, take orders, and receive those orders in their own
              tools, such as Facebook Messenger or our merchant app. Each store
              on the platform is run by its merchant, not by us. The merchant
              decides what it sells, its prices, its opening hours and how it
              fulfils orders, and is responsible for the food, products and
              service it provides.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              3. Merchant Accounts
            </h2>
            <p>
              If you run a store on WebNegosyo, you are responsible for keeping
              your login details secure, for the activity of the staff accounts
              you create, and for making sure the information on your store
              (menu items, prices, allergens, contact details and policies) is
              accurate and lawful. You must have the right to use any names,
              logos and images you upload.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              4. Acceptable Use
            </h2>
            <p className="mb-3">You agree not to use the Services to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Sell anything illegal, or break any applicable law</li>
              <li>
                Send spam, unsolicited bulk messages or misleading messages to
                customers
              </li>
              <li>
                Impersonate another person or business, or mislead customers
                about who they are buying from
              </li>
              <li>
                Upload malware, or try to access accounts, stores or data that
                are not yours
              </li>
              <li>
                Interfere with, overload or reverse-engineer the Services
              </li>
            </ul>
            <p className="mt-3">
              We may suspend or close an account that breaks these rules.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              5. Facebook and Messenger Integration
            </h2>
            <p>
              Merchants may connect a Facebook Page so that orders and menu
              replies are delivered in Messenger. That integration is provided
              through Meta&apos;s platform and is also subject to Meta&apos;s
              terms and policies, including the Meta Platform Terms and
              Messenger Platform policies. Merchants are responsible for how
              they use Messenger to communicate with their customers. A merchant
              can disconnect their Page at any time from Admin &rarr; Settings
              &rarr; Messenger. How we handle Facebook data is described in our{" "}
              <Link href="/privacy" className="text-gray-900 underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              6. Orders and Payments
            </h2>
            <p>
              When a customer places an order, the agreement to buy is between
              the customer and the merchant. Payment for an order is made to the
              merchant, using the payment methods the merchant offers.
              Collecting payment, issuing receipts, refunds, cancellations,
              delivery and any disputes about an order are the merchant&apos;s
              responsibility. If you have a question about an order, please
              contact the store you ordered from.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              7. Your Content and Data
            </h2>
            <p>
              Merchants keep ownership of the content they upload, such as menus
              and photos, and give us permission to host and display it so the
              Services can work. We handle personal data as described in our{" "}
              <Link href="/privacy" className="text-gray-900 underline">
                Privacy Policy
              </Link>
              . Instructions for asking us to delete data are on our{" "}
              <Link href="/data-deletion" className="text-gray-900 underline">
                data deletion instructions
              </Link>{" "}
              page.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              8. Availability
            </h2>
            <p>
              We work to keep the Services running and secure, but we cannot
              promise that they will always be available, error-free or
              uninterrupted. Services that we rely on, such as hosting, maps,
              messaging and payment providers, may also be unavailable at times.
              We may change, add or remove features over time.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              9. Limitation of Liability
            </h2>
            <p>
              The Services are provided &quot;as is&quot; and &quot;as
              available&quot;. To the fullest extent permitted by law, we are
              not liable for indirect, incidental or consequential losses, such
              as lost profits, lost sales or lost data, arising from your use of
              the Services, and we are not responsible for the products,
              service or conduct of any merchant. Where the law does not allow
              these limits, our liability is limited to the extent the law
              permits. Nothing in these Terms limits rights you have under
              consumer protection laws that cannot be waived.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              10. Changes to These Terms
            </h2>
            <p>
              We may update these Terms from time to time. We will post the
              updated Terms on this page and update the &quot;Last updated&quot;
              date. If you keep using the Services after a change, you accept
              the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              11. Contact Us
            </h2>
            <p>If you have questions about these Terms, please contact us:</p>
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
