import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderHeart,
  Stethoscope,
  Pill,
  Bell,
  Shield,
  Globe,
  Lock,
  ArrowRight,
  Check,
  Sparkles,
  Activity,
  CalendarClock,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import './landing.css';

const features = [
  { icon: FolderHeart, title: 'Store your health records in one place', description: 'Upload and organise medical reports, prescriptions, and lab results securely.' },
  { icon: Stethoscope, title: 'Track consultations and follow-ups', description: 'Keep a complete history of doctor visits, diagnoses, and recommendations.' },
  { icon: Pill, title: 'Manage medications and allergies', description: 'Track your current medicines, known allergies, and dosing schedules.' },
  { icon: Bell, title: 'Get health reminders for checkups, medicines, etc.', description: 'Never miss an appointment, medication, or health check-up again.' },
  { icon: Shield, title: 'View and manage health insurance', description: 'Store your policy details, coverage, and insured member information.' },
  { icon: Globe, title: 'Access anytime, anywhere', description: 'Your health records available on any device, whenever you need them.' },
];

const accessFeatures = [
  'Works on web and mobile',
  'Keep your health records with you',
  'Secure and encrypted',
  'Easy to use and simple interface',
  'Stay on top of your health',
];

function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 8c-3.5 0-6.5 1.8-8 4.5-1.5-2.7-3.5-3.5-6-2.5-3.5 1.8-4 6.2-1.5 9L24 34l15.5-15c2.5-2.8 2-6.2-1.5-9-2.5-1-4.5-.2-6 2.5C30.5 9.8 27.5 8 24 8z" fill="white" />
      <path d="M12 20h5l3-6 3 9 3-6h5" stroke="#006B55" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Adds .is-visible to .lp-reveal elements as they scroll into view (once). */
function useScrollReveal() {
  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('.lp-reveal'));
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    items.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  useScrollReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Gentle 3D tilt of the glass preview following the pointer (mouse/pen only).
  const tilt = (e: PointerEvent<HTMLDivElement>) => {
    const el = previewRef.current;
    if (!el || e.pointerType === 'touch' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg)`;
  };
  const resetTilt = () => {
    if (previewRef.current) previewRef.current.style.transform = '';
  };

  return (
    <div className="lp min-h-screen">
      {/* ================= HERO ================= */}
      <div className="lp-hero">
        <div className="lp-orb lp-orb--a" />
        <div className="lp-orb lp-orb--b" />
        <div className="lp-orb lp-orb--c" />
        <div className="lp-grid" />

        <header className={`lp-nav ${scrolled ? 'lp-nav--scrolled' : ''}`}>
          <div className="lp-nav-inner">
            <a href="/" className="lp-brand" aria-label="ZCare home">
              <span className="lp-brand-mark"><BrandMark /></span>
              ZCare
            </a>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/signin')} className="lp-btn lp-btn--glass lp-btn--sm">Sign In</button>
              <button onClick={() => navigate('/signup')} className="lp-btn lp-btn--primary lp-btn--sm hidden sm:inline-flex">Get Started</button>
            </div>
          </div>
        </header>

        <section className="lp-hero-inner">
          <div>
            <span className="lp-eyebrow lp-rise lp-d1">
              <span className="lp-eyebrow-dot"><Sparkles size={13} /></span>
              Your complete healthcare companion
            </span>
            <h1 className="lp-title lp-rise lp-d2">
              A healthier future starts with <span className="lp-title-accent">your story.</span>
            </h1>
            <p className="lp-lead lp-rise lp-d3">
              Keep your medical history organised, secure, and easily accessible so you can make informed decisions and stay healthier.
            </p>
            <div className="lp-cta-row lp-rise lp-d4">
              <button onClick={() => navigate('/signup')} className="lp-btn lp-btn--primary" id="get-started-btn">
                Get Started <ArrowRight size={18} className="lp-arrow" />
              </button>
              <button onClick={() => navigate('/signin')} className="lp-btn lp-btn--glass">Sign In</button>
            </div>
            <div className="lp-trust lp-rise lp-d5">
              <span><Lock size={14} /> Private &amp; encrypted</span>
              <span><Smartphone size={14} /> Web &amp; mobile</span>
              <span><ShieldCheck size={14} /> Try free for 1 day</span>
            </div>
          </div>

          {/* Glass product preview (illustrative sample data) */}
          <div className="lp-stage lp-rise lp-d3" onPointerMove={tilt} onPointerLeave={resetTilt}>
            <div className="lp-badge lp-badge--tl">
              <span className="lp-badge-icon"><CalendarClock size={15} /></span>
              <span>Follow-up reminder set</span>
            </div>
            <div className="lp-preview" ref={previewRef} aria-label="ZCare app preview with sample data">
              <div className="lp-preview-head">
                <div className="lp-dots"><i /><i /><i /></div>
                <span className="lp-chip">Health overview</span>
              </div>
              <div className="lp-tiles">
                <div className="lp-tile lp-tile--wide">
                  <div className="lp-tile-label"><Activity size={13} /> HbA1c trend</div>
                  <svg className="lp-spark" viewBox="0 0 300 54" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="lpFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#34d3a6" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#34d3a6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0 14 C40 12, 60 22, 100 24 S170 30, 200 36 S260 42, 300 44 L300 54 L0 54 Z" fill="url(#lpFill)" />
                    <path className="line" d="M0 14 C40 12, 60 22, 100 24 S170 30, 200 36 S260 42, 300 44" fill="none" stroke="#34d3a6" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  <div className="lp-tile-sub">Improving across your last 4 reports</div>
                </div>
                <div className="lp-tile">
                  <div className="lp-tile-label"><Pill size={13} /> Medicines</div>
                  <div className="lp-tile-value">3 active</div>
                  <div className="lp-tile-sub">Next dose 8:00 PM</div>
                </div>
                <div className="lp-tile">
                  <div className="lp-tile-label"><span className="lp-pulse" /> Allergies</div>
                  <div className="lp-tile-value">2 recorded</div>
                  <div className="lp-tile-sub">Shared with your doctor</div>
                </div>
                <div className="lp-tile lp-tile--wide">
                  <div className="lp-tile-label"><Stethoscope size={13} /> Last consultation</div>
                  <div className="lp-tile-value">General Physician</div>
                  <div className="lp-tile-sub">Notes &amp; prescription saved</div>
                </div>
              </div>
              <div className="lp-sample">Sample data</div>
            </div>
            <div className="lp-badge lp-badge--br">
              <span className="lp-badge-icon"><ShieldCheck size={15} /></span>
              <span>Records encrypted</span>
            </div>
          </div>
        </section>
      </div>

      {/* ================= FEATURES ================= */}
      <section className="lp-section lp-features-bg">
        <div className="text-center flex flex-col items-center lp-reveal">
          <span className="lp-kicker">Features</span>
          <h2 className="lp-h2">Everything you need to manage your health</h2>
          <p className="lp-sub">One calm, secure place for your records, medicines, doctors and insurance.</p>
        </div>
        <div className="lp-feature-grid">
          {features.map((f, i) => (
            <div key={f.title} className="lp-feature lp-reveal" style={{ '--lp-delay': `${(i % 3) * 110}ms` } as CSSProperties}>
              <div className="lp-feature-icon"><f.icon size={22} /></div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= ACCESS BAND ================= */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-band lp-reveal">
          <div className="lp-orb lp-orb--b" style={{ right: -120, top: -80 }} />
          <div>
            <span className="lp-kicker" style={{ color: '#9ff0d3' }}>Always with you</span>
            <h2 className="lp-h2" style={{ color: '#fff' }}>Access Anywhere, Anytime</h2>
            <ul className="lp-checks">
              {accessFeatures.map(feature => (
                <li key={feature}>
                  <span className="lp-check"><Check size={14} /></span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-band-card">
            <span className="lp-brand-mark" style={{ width: 56, height: 56, margin: '0 auto 1.1rem', borderRadius: 16 }}>
              <BrandMark size={30} />
            </span>
            <p>A healthier future starts with your story.</p>
            <div className="lp-cta-row" style={{ marginTop: '1.6rem' }}>
              <button onClick={() => navigate('/signup')} className="lp-btn lp-btn--primary">
                Get Started <ArrowRight size={18} className="lp-arrow" />
              </button>
              <button onClick={() => navigate('/signin')} className="lp-btn lp-btn--glass">Sign In</button>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="lp-footer">
        <p>Trusted by patients and families. Made by ARASS Tech.</p>
        <small>ZCare is a personal health record organiser. It does not provide medical advice, diagnosis, or treatment.</small>
      </footer>
    </div>
  );
}
