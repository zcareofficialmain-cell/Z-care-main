// ============================================================
// ZCare Document Section Detector
// Divides clinical documents into logical, typed sections
// before entity extraction. Preserves line order, page numbers,
// and section context.
// ============================================================

export type SectionType =
  | 'PATIENT_INFO'
  | 'DIAGNOSIS'
  | 'MEDICAL_HISTORY'
  | 'PRESCRIPTION'
  | 'EXISTING_MEDICATIONS'
  | 'ALLERGIES'
  | 'LAB_RESULTS'
  | 'CONSULTATION'
  | 'TREATMENT'
  | 'FOLLOW_UP'
  | 'DISCLAIMER_NOTES'
  | 'GENERAL_CLINICAL';

export interface DocumentSection {
  type: SectionType;
  title: string;
  content: string;
  lines: string[];
  pageNumber: number;
}

interface SectionHeaderRule {
  type: SectionType;
  pattern: RegExp;
  title: string;
}

const SECTION_HEADER_RULES: SectionHeaderRule[] = [
  // Disclaimers & synthetic test expectations (MUST be detected first to isolate them)
  {
    type: 'DISCLAIMER_NOTES',
    pattern: /^(?:(?:\d+\.\s*)?DOCUMENT\s+PROCESSING\s+EXPECTATIONS|IMPORTANT\s+TEST\s+NOTE|SYNTHETIC\s+TEST\s+DATA|DISCLAIMER|NOT\s+FOR\s+CLINICAL\s+USE\b)/i,
    title: 'Document Notes & Disclaimers',
  },
  // Patient Details
  {
    type: 'PATIENT_INFO',
    pattern: /^(?:PATIENT\s+DETAILS|PATIENT\s+INFORMATION|DEMOGRAPHICS|PATIENT\s+DEMOGRAPHICS)/i,
    title: 'Patient Details',
  },
  // Diagnoses / Assessment
  {
    type: 'DIAGNOSIS',
    pattern: /^(?:REASON\s+FOR\s+VISIT\s*&\s*ASSESSMENT|FINAL\s+DIAGNOSIS|PROVISIONAL\s+DIAGNOSIS|CLINICAL\s+(?:DIAGNOSIS|IMPRESSION)|DIAGNOS[EI]S|ASSESSMENT|WORKING\s+ASSESSMENT)/i,
    title: 'Diagnosis & Assessment',
  },
  // New Medication Orders
  {
    type: 'PRESCRIPTION',
    pattern: /^(?:(?:\d+\.\s*)?NEW\s+MEDICATION\s+ORDERS|NEW\s+PRESCRIPTIONS?|MEDICATIONS?\s+PRESCRIBED|PRESCRIPTION|RX\b|TREATMENT\s+PLAN)/i,
    title: 'New Medication Orders',
  },
  // Existing Medications for Reconciliation
  {
    type: 'EXISTING_MEDICATIONS',
    pattern: /^(?:(?:\d+\.\s*)?EXISTING\s+MEDICATION(?:S)?(?:\s+MENTIONED\s+FOR\s+RECONCILIATION)?|MEDICATION\s+RECONCILIATION|CURRENT\s+MEDICATIONS?|HOME\s+MEDICATIONS?|CONTINUED\s+MEDICATIONS?)/i,
    title: 'Existing Medications',
  },
  // Allergies
  {
    type: 'ALLERGIES',
    pattern: /^(?:(?:\d+\.\s*)?NEWLY\s+REPORTED\s+ALLERG(?:Y|IES)|KNOWN\s+ALLERG(?:Y|IES)|ALLERG(?:Y|IES)(?:\s*&\s*ADVERSE\s+REACTIONS)?|ADVERSE\s+DRUG\s+REACTIONS?)/i,
    title: 'Allergies',
  },
  // Laboratory Results
  {
    type: 'LAB_RESULTS',
    pattern: /^(?:(?:\d+\.\s*)?LABORATORY\s+RESULTS|LAB\s+RESULTS|BIOCHEMISTRY\s+INVESTIGATION\s+REPORT|INVESTIGATION\s+REPORT|INVESTIGATIONS|PATHOLOGY\s+REPORT)/i,
    title: 'Laboratory Results',
  },
  // Follow-up
  {
    type: 'FOLLOW_UP',
    pattern: /^(?:(?:\d+\.\s*)?FOLLOW[\s-]?UP(?:\s+RECOMMENDATIONS?)?|NEXT\s+VISIT|NEXT\s+APPOINTMENT|DISCHARGE\s+INSTRUCTIONS)/i,
    title: 'Follow-Up Recommendations',
  },
  // Doctor Consultation
  {
    type: 'CONSULTATION',
    pattern: /^(?:OUTPATIENT\s+CONSULTATION|DOCTOR\s+CONSULTATION|CONSULTING\s+CLINICIAN|CLINICAL\s+SUMMARY)/i,
    title: 'Doctor Consultation',
  },
  // Medical History
  {
    type: 'MEDICAL_HISTORY',
    pattern: /^(?:MEDICAL\s+HISTORY|PAST\s+MEDICAL\s+HISTORY|HISTORY\s+OF\s+PRESENT\s+ILLNESS)/i,
    title: 'Medical History',
  },
];

/**
 * Divide raw document text into structured sections.
 * Handles multi-page documents, line order, and heading variations.
 */
export function detectDocumentSections(rawText: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  if (!rawText || rawText.trim().length === 0) return sections;

  // Split by page markers if present (e.g. "--- PAGE 1 ---")
  const pageBlocks = rawText.split(/(?:^|\n)--- PAGE (\d+) ---\n/);
  
  let currentPage = 1;
  const segments: { pageNumber: number; text: string }[] = [];

  if (pageBlocks.length > 1) {
    // pageBlocks will be [preText, '1', page1Text, '2', page2Text, ...]
    for (let i = 1; i < pageBlocks.length; i += 2) {
      const pageNum = parseInt(pageBlocks[i], 10) || currentPage;
      const pageContent = pageBlocks[i + 1] || '';
      segments.push({ pageNumber: pageNum, text: pageContent });
      currentPage = pageNum;
    }
  } else {
    segments.push({ pageNumber: 1, text: rawText });
  }

  // Current active section accumulator
  let currentSectionType: SectionType = 'GENERAL_CLINICAL';
  let currentTitle = 'General Clinical Header';
  let currentLines: string[] = [];
  let currentSectionPage = 1;

  const flushSection = () => {
    if (currentLines.length > 0) {
      const content = currentLines.join('\n').trim();
      if (content.length > 0) {
        sections.push({
          type: currentSectionType,
          title: currentTitle,
          content,
          lines: [...currentLines],
          pageNumber: currentSectionPage,
        });
      }
      currentLines = [];
    }
  };

  for (const seg of segments) {
    const lines = seg.text.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (currentLines.length > 0) currentLines.push('');
        continue;
      }

      // Check if this line is a section header
      let matchedRule: SectionHeaderRule | null = null;
      for (const rule of SECTION_HEADER_RULES) {
        if (rule.pattern.test(line)) {
          matchedRule = rule;
          break;
        }
      }

      if (matchedRule) {
        // Flush previous section
        flushSection();
        currentSectionType = matchedRule.type;
        currentTitle = matchedRule.title;
        currentSectionPage = seg.pageNumber;
        currentLines = [line];
      } else {
        currentLines.push(line);
      }
    }
  }

  // Flush final section
  flushSection();

  return sections;
}

/**
 * Filter sections by type
 */
export function getSectionsByType(sections: DocumentSection[], type: SectionType): DocumentSection[] {
  return sections.filter(s => s.type === type);
}

/**
 * Combine text from all sections of a given type
 */
export function getSectionContent(sections: DocumentSection[], type: SectionType): string {
  return sections
    .filter(s => s.type === type)
    .map(s => s.content)
    .join('\n\n');
}

/**
 * Determine if a section represents disclaimer/test expectation text
 */
export function isDisclaimerSection(section: DocumentSection): boolean {
  return section.type === 'DISCLAIMER_NOTES';
}

