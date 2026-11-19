# ZCare — Healthcare Records Platform
> **"A Healthier Future Starts With Your Story."**

A complete, responsive, full-stack personal healthcare records web application built by **ARASS Tech**, strictly following the customer reference design specifications.

---

## 1. Overview & Customer Requirements

ZCare enables individuals and families to keep their entire medical history organized, secure, and accessible from any device. The application implements all 8 required screens and workflows visible in the customer reference design:

1. **Landing / Introduction**: Brand identity, ECG logo, hero section, security badge, and product capabilities.
2. **Create Your Profile**: Personal health profile (name, date of birth, gender, preferred language, height, weight, photo).
3. **Choose a Plan**: Monthly (₹100) and Yearly (₹1,050) subscriptions with transparent terms and payment integration safeguards.
4. **Dashboard**: Comprehensive care overview with real-time statistics, medication preview, recent consultations, allergy alerts, upcoming reminders, and downloadable health summary.
5. **Medications & Allergies**: Complete CRUD management for active/paused medications (dosage, instructions, schedule) and classified allergies (severity badges, reactions, clinical verification status).
6. **Health Insurance**: Star Health cashless policy card with masked policy numbers, sum insured progress tracking, insured family members (Aarav, Neha, Ishaan), 24/7 support line, and key policy benefits.
7. **Doctor Consultation History**: Interactive care timeline tracking doctor visits, specialties, clinical notes, follow-up dates, and linked medical reports/prescriptions.
8. **Health Reminders**: Interactive monthly calendar with selected-day agenda for appointments, blood tests, and vaccinations.
9. **Digital Health Vault**: Private medical document storage with client-side text extraction (PDF.js) and OCR (Tesseract.js).
10. **Patient Health Summary (PDF Export)**: Downloadable, clinically organized medical summary report generated via jsPDF.
11. **Automatic Medical Report Scanning & Profile Updating**: Real-time document reading, deterministic extraction, duplicate/conflict detection, interactive review interface, and automated profile updates across all modules.

---

## 2. Automatic Medical Report Scanning & Health Profile Updating

ZCare automatically scans uploaded medical documents, parses clinical fields, matches them with existing records, and updates the patient's active health profile upon confirmation.

### Workflow Pipeline
```
UPLOAD REPORT (PDF / JPG / PNG)
       ↓
AUTOMATIC DOCUMENT SCANNING
       ↓
TEXT EXTRACTION / CLIENT-SIDE OCR (PDF.js / Tesseract.js)
       ↓
STRUCTURED MEDICAL EXTRACTION (Deterministic Rules & Dictionaries)
       ↓
PROFILE MATCHING & CONFLICT DETECTION
       ↓
INTERACTIVE REVIEW SCREEN ("Medical Information Detected")
       ↓
PATIENT CONFIRMS UPDATES
       ↓
ATOMIC PERSISTENCE TO SUPABASE / LOCALSTORAGE
       ↓
DASHBOARD & ALL HEALTH MODULES AUTOMATICALLY REFRESHED
```

### Key Safety & Compliance Rules
- **No External AI API Dependency**: No external generative AI API keys (OpenAI, Gemini, Anthropic) or mandatory servers required. Runs completely client-side in the browser.
- **Traceability**: Every extracted medication, allergy, lab test, and consultation stores a provenance link (`medical_record_sources`) referencing the original document ID, page number, and source snippet.
- **Safeguards Against Silently Overwriting**:
  - Differentiates between active, discontinued, and historical medications.
  - Flags dosage conflicts (e.g. 1000mg vs 500mg) for individual user confirmation.
  - Automatically identifies exact duplicates to prevent redundant entries.
  - Distinguishes patient-reported, report-extracted, and clinician-verified data.

---

## 3. Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router 7, Lucide React icons, date-fns.
- **Backend & Database**: Supabase, PostgreSQL 15, PostgreSQL Row Level Security (RLS), Supabase Storage.
- **PDF Generation**: jsPDF for client-side downloadable medical summaries.
- **Document Processing**: PDF.js for text-based PDFs and Tesseract.js for scanned image OCR.
- **AI Independence**: **Zero external generative AI API dependencies.** Document parsing uses deterministic, client-side rule extraction and user confirmation.

---

## 4. Brand & Design System

The application strictly reflects the customer brand tokens:
- **Primary Emerald**: `#006B55`
- **Deep Teal**: `#003E38`
- **Soft Mint**: `#E8F5F0`
- **Background Page**: `#F7FAF9`
- **Primary Text**: `#102A2A`
- **Muted Text**: `#5B6B68`
- **Borders**: `#D5E1DD`

---

## 5. Getting Started Locally

### Prerequisites
- Node.js 18+ or 20+ (Node 22 supported)
- npm or pnpm

### Installation
```bash
# Clone or navigate to the project directory
cd c:/Antigravity/D-Rec

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will start at `http://localhost:5173`.

### Running Automated Test Suite
To verify the full 10-test automated verification suite for report scanning:
```bash
npm run test
```

### Instant Evaluation / Demo Mode
If Supabase credentials are not configured, ZCare automatically provides an **Instant 1-Click Demo Mode** preloaded with the customer's reference data (`Aarav Sharma`, Metformin, Penicillin allergy, Star Health Insurance, Dr. Amrutha Nair consultation, October 24 reminders, and confirmed lab results). You can test all 8 screens, perform CRUD operations, upload and scan documents, and download PDFs immediately without backend setup.

---

## 6. Supabase Backend Setup

When deploying to production with live PostgreSQL:

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Set your project URL and publishable anon key:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
   ```
4. Navigate to your Supabase Project's **SQL Editor** and execute both migrations:
   - `supabase/migrations/20250101000000_initial_schema.sql` (Core schema & storage)
   - `supabase/migrations/20250102000000_extraction_tables.sql` (Lab results, extractions, & provenance)

---

## 7. Database Schema & Security (RLS)

All tables strictly enforce PostgreSQL Row Level Security. Authenticated users can only read, insert, update, and delete their own records:

| Table | Purpose | Security Policy |
| :--- | :--- | :--- |
| `profiles` | User demographics & biometric units | RLS `auth.uid() = user_id` |
| `medications` | Dosages, schedules, and active status | RLS `auth.uid() = user_id` |
| `allergies` | Allergens, severity, verification status | RLS `auth.uid() = user_id` |
| `insurance_policies` | Policy details, sum insured, contacts | RLS `auth.uid() = user_id` |
| `insurance_members` | Covered family members | RLS `auth.uid() = user_id` |
| `consultations` | Doctor visits and clinical notes | RLS `auth.uid() = user_id` |
| `medical_documents` | Metadata for reports & prescriptions | RLS `auth.uid() = user_id` |
| `reminders` | Scheduled appointments & checkups | RLS `auth.uid() = user_id` |
| `subscriptions` | Plan memberships | RLS `auth.uid() = user_id` |
| `lab_results` | Structured laboratory test parameters | RLS `auth.uid() = user_id` |
| `document_extractions` | Extraction history & audit trail | RLS `auth.uid() = user_id` |
| `medical_record_sources` | Provenance links tracing data to document | RLS `auth.uid() = user_id` |

Storage buckets are private; files can only be accessed by their owner via short-lived signed URLs.

---

## 8. Building for Production

```bash
# Type check and build bundle
npm run build

# Preview production build locally
npm run preview
```

Deploy the generated `dist/` directory to Vercel, Netlify, Cloudflare Pages, or AWS Amplify.

---

## 9. Customer Handover Notes

- **Payment Gateway**: The plan selection screen is wired to safe developer mode. When activating live payment processing (e.g. Razorpay or Stripe), configure webhook listeners and verify signatures on a serverless function or Supabase Edge Function.
- **Medical Disclaimer**: ZCare is a personal health record management tool. All summary reports clearly state that records are patient-provided and do not constitute independent medical diagnoses.

---
*Built for ARASS Tech | ZCare Healthcare Platform*
