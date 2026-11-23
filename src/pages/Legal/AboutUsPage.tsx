import { ShieldCheck, HeartHandshake, FileSearch, Lock } from 'lucide-react';
import LegalLayout from './LegalLayout';

export default function AboutUsPage() {
  return (
    <LegalLayout
      title="About ZCare"
      subtitle="Empowering patients and families across India with organized, accessible health data"
      lastUpdated="November 2026"
    >
      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">Our Mission</h2>
        <p>
          Managing medical records, prescriptions, lab results, and appointments across multiple clinics, hospitals, and diagnostic labs is traditionally fragmented and stressful. Papers get misplaced, test trends go unnoticed, and critical health history is often missing when doctors need it most.
        </p>
        <p>
          <strong>ZCare</strong> was founded to solve this challenge. We build privacy-preserving, intelligent digital healthcare tools that help individuals, parents, and caregivers maintain a complete, organized, lifetime Digital Health Vault.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
        <div className="p-4 rounded-xl bg-[var(--color-mint-lighter)] border border-[var(--color-border)] space-y-2">
          <div className="flex items-center gap-2 text-[var(--color-teal-deep)] font-semibold text-xs">
            <Lock size={16} className="text-[var(--color-emerald-primary)]" />
            <span>Privacy-First Architecture</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Your medical records are yours alone. We enforce strict database Row-Level Security (RLS) and never monetize personal health records.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--color-mint-lighter)] border border-[var(--color-border)] space-y-2">
          <div className="flex items-center gap-2 text-[var(--color-teal-deep)] font-semibold text-xs">
            <FileSearch size={16} className="text-[var(--color-emerald-primary)]" />
            <span>Deterministic Clinical Extraction</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Upload blood reports, discharge summaries, and prescriptions. Our on-device OCR extracts lab values and active dosages cleanly.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--color-mint-lighter)] border border-[var(--color-border)] space-y-2">
          <div className="flex items-center gap-2 text-[var(--color-teal-deep)] font-semibold text-xs">
            <HeartHandshake size={16} className="text-[var(--color-emerald-primary)]" />
            <span>Family & Caregiver Support</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Keep track of medication schedules, dosage timings, and upcoming doctor appointments all in one unified dashboard.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--color-mint-lighter)] border border-[var(--color-border)] space-y-2">
          <div className="flex items-center gap-2 text-[var(--color-teal-deep)] font-semibold text-xs">
            <ShieldCheck size={16} className="text-[var(--color-emerald-primary)]" />
            <span>Made for India</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Designed for Indian healthcare formats, domestic UPI payment infrastructure, and compliant with the DPDP Act 2023.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--color-teal-deep)]">Company & Entity Details</h2>
        <div className="p-4 rounded-xl bg-[var(--color-bg-page)] border border-[var(--color-border-light)] text-xs space-y-1.5">
          <p><strong>Platform Name:</strong> ZCare</p>
          <p><strong>Registered Entity:</strong> ZCare Healthcare / Devi Sabarinath</p>
          <p><strong>Registered Address:</strong> Tc 25 3530 Sabarisyndicate, Uppalam Road, Thiruvananthapuram, Kerala, India — 695001</p>
          <p><strong>Official Website:</strong> <a href="https://www.zcare.co.in" className="text-[var(--color-emerald-primary)] hover:underline">https://www.zcare.co.in</a></p>
          <p><strong>Support Email:</strong> <a href="mailto:support@zcare.co.in" className="text-[var(--color-emerald-primary)] hover:underline">support@zcare.co.in</a></p>
        </div>
      </section>
    </LegalLayout>
  );
}
