import { useState, type FormEvent } from 'react';
import { Mail, MapPin, Clock, Phone, Send, CheckCircle2 } from 'lucide-react';
import LegalLayout from './LegalLayout';

export default function ContactUsPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <LegalLayout
      title="Contact Us"
      subtitle="We are here to help you with your ZCare account, billing, or technical queries"
      lastUpdated="November 2026"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
        {/* Contact Info Panel */}
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-bold text-[var(--color-teal-deep)] mb-1">Get in Touch</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Our customer care team is available to assist you Monday through Saturday.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--color-bg-page)] border border-[var(--color-border-light)]">
              <Mail className="shrink-0 mt-0.5 text-[var(--color-emerald-primary)]" size={18} />
              <div>
                <span className="font-semibold block text-[var(--color-teal-deep)]">Customer Support Email</span>
                <a href="mailto:support@zcare.co.in" className="text-[var(--color-emerald-primary)] hover:underline">
                  support@zcare.co.in
                </a>
                <p className="text-[11px] text-[var(--color-text-light)] mt-0.5">Response within 24 to 48 hours</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--color-bg-page)] border border-[var(--color-border-light)]">
              <MapPin className="shrink-0 mt-0.5 text-[var(--color-emerald-primary)]" size={18} />
              <div>
                <span className="font-semibold block text-[var(--color-teal-deep)]">Operating & Registered Office</span>
                <p className="text-[var(--color-text-secondary)]">
                  ZCare Healthcare<br />
                  Tc 25 3530 Sabarisyndicate, Uppalam Road<br />
                  Thiruvananthapuram, Kerala, India — 695001
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--color-bg-page)] border border-[var(--color-border-light)]">
              <Clock className="shrink-0 mt-0.5 text-[var(--color-emerald-primary)]" size={18} />
              <div>
                <span className="font-semibold block text-[var(--color-teal-deep)]">Support Hours</span>
                <p className="text-[var(--color-text-secondary)]">Monday – Saturday: 9:00 AM – 6:00 PM IST</p>
                <p className="text-[11px] text-[var(--color-text-light)]">Closed on Sundays and Indian National Holidays</p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="p-6 rounded-2xl bg-[var(--color-mint-lighter)]/50 border border-[var(--color-border)]">
          <h3 className="font-bold text-sm text-[var(--color-teal-deep)] mb-4">Send a Message</h3>

          {submitted ? (
            <div className="p-6 text-center space-y-2">
              <CheckCircle2 size={36} className="mx-auto text-[var(--color-emerald-primary)]" />
              <h4 className="font-bold text-sm text-[var(--color-teal-deep)]">Message Received!</h4>
              <p className="text-xs text-[var(--color-text-muted)]">
                Thank you for contacting ZCare. Our support team will get back to you at <strong>{form.email}</strong> shortly.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setForm({ name: '', email: '', subject: '', message: '' });
                }}
                className="btn btn-outline btn-sm text-xs mt-3"
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="input-label" htmlFor="contact-name">Your Name *</label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  className="input-field text-xs"
                  placeholder="e.g. Priya Nair"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label className="input-label" htmlFor="contact-email">Email Address *</label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  className="input-field text-xs"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div>
                <label className="input-label" htmlFor="contact-subject">Subject</label>
                <select
                  id="contact-subject"
                  className="input-field text-xs"
                  value={form.subject}
                  onChange={e => setForm({ ...form, subject: e.target.value })}
                >
                  <option value="">Select an inquiry type</option>
                  <option value="billing">Subscription & Billing Query</option>
                  <option value="technical">Technical Support / Document OCR</option>
                  <option value="privacy">Data Privacy & Account</option>
                  <option value="general">General Feedback</option>
                </select>
              </div>

              <div>
                <label className="input-label" htmlFor="contact-message">Message *</label>
                <textarea
                  id="contact-message"
                  required
                  rows={4}
                  className="input-field text-xs"
                  placeholder="How can we help you today?"
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-sm w-full font-medium inline-flex items-center justify-center gap-1.5"
              >
                <Send size={13} />
                Send Message
              </button>
            </form>
          )}
        </div>
      </div>
    </LegalLayout>
  );
}
