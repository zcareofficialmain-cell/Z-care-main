import { jsPDF } from 'jspdf';
import type { Profile, Medication, Allergy, InsurancePolicy, Consultation, MedicalDocument, Reminder } from '@/types';
import type { LabResult } from '@/types/medicalExtraction';
import { formatDate } from '@/utils';

export interface HealthSummaryOptions {
  includeProfile?: boolean;
  includeMedications?: boolean;
  includeAllergies?: boolean;
  includeConsultations?: boolean;
  includeInsurance?: boolean;
  includeDocuments?: boolean;
  includeReminders?: boolean;
  includeLabResults?: boolean;
}

export function generateHealthSummaryPDF(
  profile: Profile | null,
  medications: Medication[],
  allergies: Allergy[],
  consultations: Consultation[],
  policies: InsurancePolicy[],
  documents: MedicalDocument[],
  reminders: Reminder[],
  labResults: LabResult[] = [],
  options: HealthSummaryOptions = {
    includeProfile: true,
    includeMedications: true,
    includeAllergies: true,
    includeConsultations: true,
    includeInsurance: true,
    includeDocuments: true,
    includeReminders: true,
    includeLabResults: true,
  }
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 20) {
      doc.addPage();
      y = 16;
      renderFooter();
    }
  };

  const renderFooter = () => {
    const pageNum = doc.getNumberOfPages();
    doc.setFontSize(8);
    doc.setTextColor(138, 154, 151); // #8A9A97
    doc.text(
      'ZCare Healthcare Platform — Generated on ' + formatDate(new Date().toISOString()),
      margin,
      pageHeight - 10
    );
    doc.text(
      `Page ${pageNum}`,
      pageWidth - margin,
      pageHeight - 10,
      { align: 'right' }
    );
  };

  // Header Bar
  doc.setFillColor(0, 107, 85); // Emerald #006B55
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ZCare', margin, 13);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Personal Health Record Summary', margin, 19);

  doc.setFontSize(8);
  doc.text('Confidential Medical Record', pageWidth - margin, 13, { align: 'right' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageWidth - margin, 19, { align: 'right' });

  y = 34;

  // Patient Profile Section
  if (options.includeProfile && profile) {
    doc.setFillColor(232, 245, 240); // Soft Mint #E8F5F0
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F');

    doc.setTextColor(0, 62, 56); // Deep Teal
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(profile.full_name || 'Patient Name', margin + 5, y + 7);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(16, 42, 42);

    const dobStr = profile.date_of_birth ? formatDate(profile.date_of_birth) : 'Not specified';
    const genderStr = profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : 'Not specified';
    const langStr = profile.language || 'English';
    const heightStr = profile.height ? `${profile.height} cm` : '—';
    const weightStr = profile.weight ? `${profile.weight} kg` : '—';

    doc.text(`DOB: ${dobStr}  |  Gender: ${genderStr}  |  Language: ${langStr}`, margin + 5, y + 13);
    doc.text(`Height: ${heightStr}  |  Weight: ${weightStr}`, margin + 5, y + 18);

    y += 28;
  }

  // Section divider helper
  const renderSectionHeader = (title: string, count?: number) => {
    checkPageBreak(14);
    doc.setFillColor(0, 107, 85);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 62, 56);
    doc.text(`${title} ${count !== undefined ? `(${count})` : ''}`, margin + 6, y + 5.5);
    y += 10;
  };

  // Known Allergies
  if (options.includeAllergies && allergies.length > 0) {
    renderSectionHeader('Known Allergies', allergies.length);

    allergies.forEach(alg => {
      checkPageBreak(12);
      doc.setFillColor(254, 242, 242); // Soft red
      doc.roundedRect(margin, y, contentWidth, 10, 1, 1, 'F');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38); // Danger red
      doc.text(alg.allergen, margin + 4, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(16, 42, 42);
      const sev = alg.severity.toUpperCase();
      const react = alg.reaction ? `— Reaction: ${alg.reaction}` : '';
      const ver = `[${alg.verification_status}]`;
      doc.text(`${sev} ${react} ${ver}`, margin + 35, y + 6);

      y += 12;
    });
    y += 2;
  }

  // Current Medications
  if (options.includeMedications && medications.length > 0) {
    renderSectionHeader('Medications', medications.length);

    medications.forEach(med => {
      checkPageBreak(15);
      doc.setFillColor(247, 250, 249);
      doc.roundedRect(margin, y, contentWidth, 14, 1, 1, 'F');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 107, 85);
      doc.text(`${med.name} ${med.strength ? `(${med.strength})` : ''}`, margin + 4, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(16, 42, 42);
      const sched = med.frequency || 'Daily';
      const instr = med.instructions ? `| Instructions: ${med.instructions}` : '';
      const started = med.start_date ? `| Started: ${formatDate(med.start_date)}` : '';
      const statusBadge = `[${med.status.toUpperCase()}]`;

      doc.text(`${sched} ${instr} ${started}  ${statusBadge}`, margin + 4, y + 10);

      y += 16;
    });
    y += 2;
  }

  // Doctor Consultations
  if (options.includeConsultations && consultations.length > 0) {
    renderSectionHeader('Doctor Consultation History', consultations.length);

    consultations.forEach(con => {
      checkPageBreak(18);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(213, 225, 221);
      doc.roundedRect(margin, y, contentWidth, 16, 1, 1, 'D');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 62, 56);
      doc.text(`${con.doctor_name} ${con.specialty ? `— ${con.specialty}` : ''}`, margin + 4, y + 5);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(91, 107, 104);
      doc.text(`${formatDate(con.consultation_date)}  |  ${con.hospital_name || 'Clinic'}`, margin + 4, y + 9.5);

      if (con.notes || con.reason) {
        doc.setTextColor(16, 42, 42);
        const reasonText = con.reason ? `Reason: ${con.reason}. ` : '';
        const notesText = con.notes ? `Notes: ${con.notes}` : '';
        doc.text(`${reasonText}${notesText}`.slice(0, 110), margin + 4, y + 13.5);
      }

      y += 18;
    });
    y += 2;
  }

  // Health Insurance
  if (options.includeInsurance && policies.length > 0) {
    renderSectionHeader('Health Insurance Coverage', policies.length);

    policies.forEach(pol => {
      checkPageBreak(16);
      doc.setFillColor(232, 245, 240);
      doc.roundedRect(margin, y, contentWidth, 14, 1, 1, 'F');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 107, 85);
      doc.text(pol.provider, margin + 4, y + 5);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(16, 42, 42);
      const policyNum = pol.policy_number ? `Policy: ${pol.policy_number}` : '';
      const sumInsured = pol.sum_insured ? ` | Sum Insured: ₹${pol.sum_insured.toLocaleString('en-IN')}` : '';
      const validity = pol.valid_until ? ` | Valid until: ${formatDate(pol.valid_until)}` : '';

      doc.text(`${policyNum}${sumInsured}${validity}`, margin + 4, y + 10);
      y += 16;
    });
    y += 2;
  }

  // Laboratory & Diagnostic Results
  if (options.includeLabResults && labResults.length > 0) {
    renderSectionHeader('Laboratory & Diagnostic Results', labResults.length);

    labResults.forEach(lab => {
      checkPageBreak(14);
      doc.setFillColor(247, 250, 249);
      doc.roundedRect(margin, y, contentWidth, 12, 1, 1, 'F');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 62, 56);
      doc.text(lab.test_name, margin + 4, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(16, 42, 42);

      const valStr = `Result: ${lab.result_value} ${lab.unit || ''}`;
      const refStr = lab.reference_range ? ` | Ref: ${lab.reference_range}` : '';
      const dateStr = lab.test_date ? ` | Date: ${formatDate(lab.test_date)}` : '';
      const statusStr = lab.result_status && lab.result_status !== 'unknown' && lab.result_status !== 'normal'
        ? ` [${lab.result_status.toUpperCase()}]`
        : '';

      doc.text(`${valStr}${refStr}${dateStr}  ${statusStr}`, margin + 4, y + 9.5);
      y += 14;
    });
    y += 2;
  }

  // Medical Documents
  if (options.includeDocuments && documents.length > 0) {
    renderSectionHeader('Stored Medical Records', documents.length);

    documents.forEach(docItem => {
      checkPageBreak(12);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 42, 42);
      doc.text(`• ${docItem.title} [${docItem.document_type}]`, margin + 4, y + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(91, 107, 104);
      const docDate = docItem.document_date ? formatDate(docItem.document_date) : 'Undated';
      const hosp = docItem.hospital_name ? ` | ${docItem.hospital_name}` : '';
      doc.text(`${docDate}${hosp}`, margin + 8, y + 8.5);
      y += 11;
    });
    y += 2;
  }

  // Upcoming Reminders
  if (options.includeReminders && reminders.length > 0) {
    renderSectionHeader('Health Reminders & Schedule', reminders.length);

    reminders.slice(0, 5).forEach(rem => {
      checkPageBreak(10);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(16, 42, 42);
      const dueStr = rem.due_at ? formatDate(rem.due_at) : '';
      doc.text(`• ${rem.title} (${rem.type.toUpperCase()}) — Due: ${dueStr} [${rem.status}]`, margin + 4, y + 4.5);
      y += 8;
    });
    y += 2;
  }

  // Medical Disclaimer at the end
  checkPageBreak(18);
  doc.setFontSize(7.5);
  doc.setTextColor(138, 154, 151);
  doc.text(
    'Notice: This health summary is generated from patient-provided or authorised records in ZCare for personal reference. It does not constitute an independent medical diagnosis or certification. Please consult a qualified healthcare professional for medical advice.',
    margin,
    y + 6,
    { maxWidth: contentWidth }
  );

  renderFooter();

  // Save the PDF
  const filename = `ZCare_Health_Summary_${(profile?.full_name || 'Patient').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
  return filename;
}

