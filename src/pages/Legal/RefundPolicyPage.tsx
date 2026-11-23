import LegalLayout from './LegalLayout';

export default function RefundPolicyPage() {
  return (
    <LegalLayout
      title="Refund & Cancellation Policy"
      subtitle="Clear and fair terms regarding membership plans and billing"
      lastUpdated="November 2026"
    >
      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">1. 24-Hour Free Evaluation Period</h2>
        <p>
          At ZCare, we want you to experience the full power of our Digital Health Vault before making a financial commitment.
          Every new user receives an unrestricted <strong>24-hour Free Trial</strong> upon account registration to explore document scanning, medication tracking, lab extraction, and profile tools without entering any credit card or payment details.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">2. Membership Cancellation</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Prepaid Memberships:</strong> Memberships are prepaid for their duration (₹199 for 1 month or ₹1,299 for 1 year). Because plans are prepaid in advance, you can choose not to renew at the conclusion of your billing period.
          </li>
          <li>
            <strong>Continued Access:</strong> If you cancel or choose not to renew your subscription, you retain complete, uninterrupted premium access until the end of your current paid billing period (marked by your plan expiry date).
          </li>
          <li>
            <strong>Data Preservation:</strong> When a subscription ends, your uploaded medical records remain safely stored in your health vault and can be accessed or downloaded anytime. We do not delete your health history.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">3. Refund Terms</h2>
        <p>
          Because ZCare provides a full-featured 24-hour free trial prior to purchase, <strong>subscription fees are generally non-refundable once an account is billed and activated</strong>.
        </p>
        <p>However, we will gladly issue a full refund under the following exceptional circumstances:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Duplicate Billing:</strong> If technical error resulted in duplicate debits for the same subscription period.</li>
          <li><strong>Service Outage / Inability to Access:</strong> If verified technical platform errors prevented you from accessing the service for a prolonged period immediately following purchase.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">4. Refund Request Process</h2>
        <p>
          To request a refund under the eligible conditions, please email our support team at{' '}
          <a href="mailto:support@zcare.co.in" className="text-[var(--color-emerald-primary)] hover:underline">
            support@zcare.co.in
          </a>{' '}
          within <strong>48 hours</strong> of the transaction with:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your registered account email address.</li>
          <li>Razorpay Payment ID / Order reference number.</li>
          <li>Brief description of the issue or proof of duplicate debit.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">5. Refund Processing Timeline</h2>
        <p>
          Once approved by our support team, refunds are processed through our payment gateway (Razorpay) to the original method of payment (UPI, Credit/Debit Card, or Net Banking).
        </p>
        <p className="p-3.5 rounded-lg bg-[var(--color-mint-lighter)] text-xs text-[var(--color-teal-deep)]">
          ⏱️ <strong>Settlement Timeline:</strong> The refunded amount typically reflects in your bank account or payment app within <strong>5 to 7 business banking days</strong> from the date of approval.
        </p>
      </section>
    </LegalLayout>
  );
}
