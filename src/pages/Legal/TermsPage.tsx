import LegalLayout from './LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms & Conditions"
      subtitle="Terms governing the use of the ZCare health management platform"
      lastUpdated="November 2026"
    >
      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">1. Acceptance of Terms</h2>
        <p>
          By accessing or using ZCare (&quot;the Platform&quot;, available at <a href="https://www.zcare.co.in" className="text-[var(--color-emerald-primary)] hover:underline">https://www.zcare.co.in</a>),
          you agree to be bound by these Terms and Conditions (&quot;Terms&quot;). If you disagree with any part of these Terms, you may not access or use the Platform.
        </p>
      </section>

      {/* Critical Medical Disclaimer */}
      <section className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
        <h3 className="font-bold text-sm flex items-center gap-2 text-amber-950">
          ⚠️ Important Medical Disclaimer
        </h3>
        <p className="text-xs leading-relaxed">
          <strong>ZCare is a digital health record management tool and personal wellness organiser. It does NOT provide medical advice, diagnosis, emergency response, or clinical healthcare treatment.</strong>
        </p>
        <p className="text-xs leading-relaxed">
          The information, OCR scans, and extracted lab values displayed on ZCare are for personal informational reference only. Always seek the advice of a qualified healthcare provider regarding medical conditions, prescriptions, or laboratory results. In the event of a medical emergency, immediately contact your nearest hospital or local emergency medical services.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">2. Description of Service</h2>
        <p>
          ZCare provides users with an intelligent digital health vault where individuals and families can securely store, organize, and view health records, track active medications, set appointment reminders, and record doctor consultation summaries.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">3. User Accounts & Security</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>You must provide accurate, current, and complete information during registration.</li>
          <li>You are solely responsible for maintaining the confidentiality of your login credentials.</li>
          <li>You agree to notify ZCare immediately of any unauthorized use of your account.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">4. Subscription Plans and Payment Terms</h2>
        <p>ZCare offers subscription tiers for unrestricted access to digital health vault features:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Free Trial:</strong> 24 hours of full platform access, available once per user account.</li>
          <li><strong>Monthly Membership:</strong> ₹199 per month (inclusive of applicable taxes).</li>
          <li><strong>Yearly Membership:</strong> ₹1,299 per year (inclusive of applicable taxes).</li>
        </ul>
        <p>
          All online payments are securely processed in Indian Rupees (INR) through Razorpay. You agree to provide valid payment details and authorize the charge for your selected plan.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">5. Intellectual Property & Ownership</h2>
        <p>
          All trademarks, logos, visual designs, software code, and architecture of ZCare are the proprietary property of ZCare and its licensors. You retain 100% ownership of all medical records, files, and personal data you upload.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">6. Governing Law and Jurisdiction</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising in connection with these Terms shall be subject to the exclusive jurisdiction of the competent courts of Thiruvananthapuram, Kerala, India.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">7. Contact Information</h2>
        <p>
          For questions regarding these Terms, contact us at <a href="mailto:support@zcare.co.in" className="text-[var(--color-emerald-primary)] hover:underline">support@zcare.co.in</a> or visit our <a href="/contact" className="text-[var(--color-emerald-primary)] hover:underline">Contact Us</a> page.
        </p>
      </section>
    </LegalLayout>
  );
}
