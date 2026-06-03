import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support - WebNegosyo",
  description:
    "Get help with the WebNegosyo smart menu platform and merchant admin app. Contact support, browse FAQs, and find answers to common questions.",
};

const SUPPORT_EMAIL = "webnogosyo3@gmail.com";

const faqs: { q: string; a: string }[] = [
  {
    q: "How do I sign in to the WebNegosyo Admin app?",
    a: "The WebNegosyo Admin app is for restaurant merchants who already have a WebNegosyo account. Sign in with the email and password issued to you when your store was onboarded. If you do not yet have an account, contact us using the email below and our team will set one up for you.",
  },
  {
    q: "I forgot my password or cannot log in. What should I do?",
    a: "Email us at the support address below from the email associated with your store. We will verify your account and help you reset your password so you can get back into the dashboard.",
  },
  {
    q: "What does the Admin app do?",
    a: "The app lets restaurant merchants manage their online store on the go: receive real-time order alerts, view and update incoming orders, track daily sales and revenue, and review product and menu analytics.",
  },
  {
    q: "How do I receive new order notifications?",
    a: "Allow push notifications when prompted on first launch. New orders trigger an alert with sound so you never miss one. You can re-enable notifications anytime from your device Settings if you declined.",
  },
  {
    q: "How do I become a WebNegosyo merchant?",
    a: "WebNegosyo is open to any food or retail business that wants an online ordering store. Reach out using the contact details below and we will walk you through onboarding.",
  },
];

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Support</h1>
        <p className="mb-8 text-sm text-gray-500">
          We&apos;re here to help you get the most out of WebNegosyo.
        </p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              Contact Us
            </h2>
            <p>
              The fastest way to reach our team is by email. We aim to respond
              within one business day.
            </p>
            <p className="mt-4 rounded-lg bg-gray-50 p-4">
              <strong>WebNegosyo Support</strong>
              <br />
              Email:{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-blue-600 underline"
              >
                {SUPPORT_EMAIL}
              </a>
              <br />
              Hours: Monday&ndash;Saturday, 9:00 AM&ndash;6:00 PM (PHT)
            </p>
            <p className="mt-3 text-sm text-gray-500">
              When emailing us, please include your store name and the email
              address on your account so we can assist you faster.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              Frequently Asked Questions
            </h2>
            <div className="space-y-6">
              {faqs.map((faq) => (
                <div key={faq.q}>
                  <h3 className="mb-2 text-lg font-medium text-gray-800">
                    {faq.q}
                  </h3>
                  <p>{faq.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-gray-900">
              More Resources
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <Link
                  href="/privacy"
                  className="font-medium text-blue-600 underline"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-medium text-blue-600 underline"
                >
                  Request account deletion or data export
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
