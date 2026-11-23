import LegalLayout from './LegalLayout';

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How ZCare protects and manages your personal and health records"
      lastUpdated="November 2026"
    >
      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">1. Introduction</h2>
        <p>
          Welcome to ZCare (accessible at <a href="https://www.zcare.co.in" className="text-[var(--color-emerald-primary)] hover:underline">https://www.zcare.co.in</a>).
          ZCare (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to respecting your privacy and protecting the sensitive medical and personal information you entrust to our digital health platform.
        </p>
        <p>
          This Privacy Policy explains how we collect, process, store, and safeguard your personal data in compliance with the
          <strong> Information Technology Act, 2000</strong>, the <strong>Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011</strong>,
          and the <strong>Digital Personal Data Protection Act (DPDP Act, 2023)</strong> of India.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">2. Information We Collect</h2>
        <p>We collect only the minimum information necessary to provide our digital health record management services:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Account Identifiers:</strong> Name, email address, phone number, and encrypted password credentials.
          </li>
          <li>
            <strong>Medical & Health Records:</strong> Lab reports, diagnostic tests, prescriptions, doctor consultation notes, vaccination cards, discharge summaries, and insurance details uploaded by you to your Digital Health Vault.
          </li>
          <li>
            <strong>Clinical Data Extracted Locally:</strong> Medication names, dosages, allergy warnings, test reference ranges, and doctor appointment logs generated via client-side OCR and text extraction.
          </li>
          <li>
            <strong>Payment & Billing Data:</strong> Order identifiers, transaction timestamps, payment reference IDs, and subscription tier. <em>Note: Sensitive payment card numbers, UPI PINs, and net banking credentials are processed directly by our RBI-licensed payment gateway partner (Razorpay) and are never stored on ZCare servers.</em>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">3. How Your Information is Used</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To securely organize, categorize, and present your personal medical history in your private dashboard.</li>
          <li>To parse clinical details from uploaded records using privacy-preserving client-side processing.</li>
          <li>To generate medication reminders, dosage alerts, and doctor appointment schedules requested by you.</li>
          <li>To process membership subscription fees and provide access to premium vault features.</li>
          <li>To respond to customer support requests and resolve technical inquiries.</li>
        </ul>
        <p className="font-semibold text-[var(--color-teal-deep)]">
          We will NEVER sell, rent, or trade your personal health data to pharmaceutical companies, insurance underwriters, advertisers, or third-party brokers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">4. Security & Data Protection</h2>
        <p>
          We employ robust administrative, technical, and physical security measures to protect your medical information:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Encryption in Transit:</strong> All web traffic is strictly encrypted using modern 256-bit Transport Layer Security (TLS/HTTPS).</li>
          <li><strong>Database Row-Level Security (RLS):</strong> Our database enforces strict row-level security policies ensuring users can only read and write their own encrypted medical records.</li>
          <li><strong>Deterministic Client-Side Processing:</strong> Document scanning and OCR (via PDF.js and Tesseract) execute on your device whenever possible, keeping your documents private.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">5. Data Retention and User Rights</h2>
        <p>
          Under Indian privacy laws, you possess complete sovereignty over your health data:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Right to Access & Download:</strong> You can download or export your uploaded medical documents, lab results, and health profiles at any time.</li>
          <li><strong>Right to Erasure:</strong> You can delete individual medical records or your entire ZCare account. Upon account deletion, all personal records are permanently purged from our database and storage buckets.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">6. Contact & Grievance Redressal</h2>
        <p>
          In accordance with the Information Technology Act, 2000 and the DPDP Act, 2023, if you have any questions or grievances regarding this Privacy Policy, please contact our Grievance Officer:
        </p>
        <div className="p-4 rounded-xl bg-[var(--color-mint-lighter)] border border-[var(--color-border)] text-xs space-y-1">
          <p><strong>Grievance Officer:</strong> Privacy & Compliance Team</p>
          <p><strong>Entity Name:</strong> ZCare Healthcare</p>
          <p><strong>Address:</strong> Tc 25 3530 Sabarisyndicate, Uppalam Road, Thiruvananthapuram, Kerala, IN, 695001</p>
          <p><strong>Email:</strong> <a href="mailto:support@zcare.co.in" className="text-[var(--color-emerald-primary)] hover:underline">support@zcare.co.in</a></p>
          <p><strong>Response Time:</strong> We acknowledge complaints within 48 hours and resolve them within 30 days.</p>
        </div>
      </section>
    </LegalLayout>
  );
}
