import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, FileText, RefreshCw, Mail, Info } from 'lucide-react';
import Logo from '@/components/ui/Logo';

interface LegalLayoutProps {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  children: ReactNode;
}

export default function LegalLayout({
  title,
  subtitle,
  lastUpdated = 'November 2026',
  children,
}: LegalLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg-page)] text-[var(--color-text-primary)]">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[var(--color-border-light)] px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
        <Link to="/" className="flex items-center gap-2">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-4 text-xs font-medium">
          <Link
            to="/"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-emerald-primary)] transition-colors hidden sm:inline"
          >
            Home
          </Link>
          <Link
            to="/plans"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-emerald-primary)] transition-colors"
          >
            Pricing
          </Link>
          <Link
            to="/signin"
            className="btn btn-outline btn-sm text-xs py-1.5 px-3"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-emerald-primary)] transition-colors mb-4"
          >
            <ArrowLeft size={14} /> Back to ZCare
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-teal-deep)]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-[var(--color-text-muted)] mt-1.5">
              {subtitle}
            </p>
          )}
          <p className="text-xs text-[var(--color-text-light)] mt-2">
            Last updated: {lastUpdated} • Applies to ZCare (zcare.co.in)
          </p>
        </div>

        <div className="card p-6 sm:p-10 bg-white border border-[var(--color-border-light)] shadow-sm space-y-8 leading-relaxed text-sm text-[var(--color-text-secondary)]">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border-light)] bg-white py-8 px-4 sm:px-8 mt-12 text-xs text-[var(--color-text-muted)]">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size="sm" showText={false} />
            <span className="font-semibold text-[var(--color-teal-deep)]">ZCare</span>
            <span>• Personal Health Record Organiser</span>
          </div>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
            <Link to="/about" className="hover:text-[var(--color-emerald-primary)] transition-colors">
              About Us
            </Link>
            <Link to="/privacy" className="hover:text-[var(--color-emerald-primary)] transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-[var(--color-emerald-primary)] transition-colors">
              Terms & Conditions
            </Link>
            <Link to="/refund-policy" className="hover:text-[var(--color-emerald-primary)] transition-colors">
              Refund Policy
            </Link>
            <Link to="/contact" className="hover:text-[var(--color-emerald-primary)] transition-colors">
              Contact Us
            </Link>
          </div>
        </div>
        <div className="max-w-4xl mx-auto text-center mt-6 pt-4 border-t border-[var(--color-border-light)] text-[11px] text-[var(--color-text-light)]">
          <p>
            Disclaimer: ZCare is an informational health records organizer and does not provide medical advice, diagnosis, or clinical treatment.
          </p>
          <p className="mt-1">
            © {new Date().getFullYear()} ZCare. All rights reserved. Registered in India.
          </p>
        </div>
      </footer>
    </div>
  );
}
