// ============================================================
// ZCare Medical Report Scanner
// Orchestrates document reading, structured text extraction,
// patient record matching, and review preparation.
// No external generative AI API required.
// ============================================================

import {
  extractMedicalData,
  computeFileHash,
} from './medicalDataExtractor';
import {
  matchExtractedData,
  type MatchedExtractionReview,
} from './medicalDataMatcher';
import {
  getMedications,
  getAllergies,
  getConsultations,
  getReminders,
  getLabResults,
  saveDocumentExtraction,
} from './api';
import type {
  MedicalExtractionResult,
  ExtractionProgress,
  DocumentExtraction,
} from '@/types/medicalExtraction';
import type { MedicalDocument } from '@/types';

export interface ScanWorkflowResult {
  extraction: MedicalExtractionResult;
  review: MatchedExtractionReview;
  extractionRecord: DocumentExtraction;
}

// Extract digital text with PDF.js preserving vertical line structure and tabular columns
async function extractDigitalPdfText(file: File, onProgress?: (p: number) => void): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      } catch {
        // Fallback if URL constructor fails
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 10);

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];

      // Reconstruct lines using Y-coordinate bucketing and X-coordinate sorting
      const linesMap = new Map<number, any[]>();
      for (const item of items) {
        if (!item.str && item.str !== ' ') continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        if (!linesMap.has(y)) linesMap.set(y, []);
        linesMap.get(y)!.push(item);
      }

      const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);
      const pageLines: string[] = [];

      for (const y of sortedY) {
        const lineItems = linesMap.get(y)!;
        lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

        let lineText = '';
        let lastX = -1;
        let lastWidth = 0;

        for (const it of lineItems) {
          const text = it.str;
          const currentX = it.transform[4];
          if (lastX >= 0) {
            const space = currentX - (lastX + lastWidth);
            if (space > 15) {
              lineText += '   ';
            } else if (space > 3 && !lineText.endsWith(' ') && !text.startsWith(' ')) {
              lineText += ' ';
            }
          }
          lineText += text;
          lastX = currentX;
          lastWidth = it.width || (text.length * 6);
        }

        const trimmed = lineText.trim();
        if (trimmed) {
          pageLines.push(trimmed);
        }
      }

      fullText += `--- PAGE ${pageNum} ---\n` + pageLines.join('\n') + '\n\n';
      if (onProgress) onProgress(Math.round((pageNum / maxPages) * 100));
    }

    return fullText.trim();
  } catch (err) {
    console.warn('PDF.js text extraction error:', err);
    return '';
  }
}

// Run OCR with Tesseract.js (lazy loaded)
async function runOcrOnImage(file: File, onProgress?: (p: number) => void): Promise<string> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    const ret = await worker.recognize(file);
    await worker.terminate();
    if (onProgress) onProgress(100);
    return ret.data.text || '';
  } catch (err) {
    console.warn('Tesseract OCR error:', err);
    return '';
  }
}

/**
 * Execute the complete medical document scanning pipeline
 */
export async function scanMedicalDocument(
  userId: string,
  file: File,
  document: MedicalDocument,
  onProgress?: (progress: ExtractionProgress) => void,
  abortSignal?: AbortSignal
): Promise<ScanWorkflowResult> {
  if (abortSignal?.aborted) {
    throw new Error('Scanning was cancelled by the user');
  }

  // STEP 1: Uploading document...
  onProgress?.({
    step: 1,
    totalSteps: 6,
    label: 'Uploading document...',
    detail: `Securing ${file.name} in your private health vault`,
    percentage: 10,
  });

  const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');
  const isImage = file.type.startsWith('image/');
  let rawText = '';
  let extractionMethod: 'pdf-text' | 'ocr' | 'fallback' = 'fallback';

  // STEP 2: Reading medical report...
  onProgress?.({
    step: 2,
    totalSteps: 6,
    label: 'Reading medical report...',
    detail: isPDF ? 'Extracting digital text layers...' : 'Initializing OCR engine...',
    percentage: 25,
  });

  if (isPDF) {
    rawText = await extractDigitalPdfText(file);
    if (rawText.length > 50) {
      extractionMethod = 'pdf-text';
    } else {
      // Scanned PDF fallback
      onProgress?.({
        step: 2,
        totalSteps: 6,
        label: 'Reading medical report...',
        detail: 'Scanned document detected. Running optical character recognition (OCR)...',
        percentage: 35,
      });
      rawText = await runOcrOnImage(file);
      if (rawText.length > 20) {
        extractionMethod = 'ocr';
      }
    }
  } else if (isImage) {
    onProgress?.({
      step: 2,
      totalSteps: 6,
      label: 'Reading medical report...',
      detail: 'Running optical character recognition (OCR) with Tesseract.js...',
      percentage: 35,
    });
    rawText = await runOcrOnImage(file);
    if (rawText.length > 20) {
      extractionMethod = 'ocr';
    }
  }

  if (abortSignal?.aborted) {
    throw new Error('Scanning was cancelled by the user');
  }

  // STEP 3: Scanning and identifying medical information...
  onProgress?.({
    step: 3,
    totalSteps: 6,
    label: 'Scanning and identifying medical information...',
    detail: 'Identifying medications, lab tests, allergies, and diagnoses...',
    percentage: 50,
  });

  // STEP 4: Organising extracted details...
  const extractionResult = extractMedicalData(
    rawText,
    file.name,
    document.id,
    extractionMethod,
    subProgress => {
      onProgress?.({
        step: 4,
        totalSteps: 6,
        label: 'Organising extracted details...',
        detail: subProgress.label,
        percentage: 50 + Math.round(subProgress.percentage * 0.25),
      });
    }
  );

  if (abortSignal?.aborted) {
    throw new Error('Scanning was cancelled by the user');
  }

  // STEP 5: Checking existing health records...
  onProgress?.({
    step: 5,
    totalSteps: 6,
    label: 'Checking existing health records...',
    detail: 'Comparing with your current profile to detect duplicates and conflicts...',
    percentage: 85,
  });

  const [existingMeds, existingAllergies, existingConsultations, existingReminders, existingLabs] =
    await Promise.all([
      getMedications(userId),
      getAllergies(userId),
      getConsultations(userId),
      getReminders(userId),
      getLabResults(userId),
    ]);

  const matchedReview = matchExtractedData(extractionResult, {
    medications: existingMeds,
    allergies: existingAllergies,
    consultations: existingConsultations,
    reminders: existingReminders,
    labResults: existingLabs,
  });

  // Save extraction record to document_extractions
  const extractionRecord = await saveDocumentExtraction(userId, {
    medical_document_id: document.id,
    status: 'needs_review',
    extracted_data: extractionResult,
    warnings: extractionResult.warnings,
    extractor_version: extractionResult.extractor_version,
    processed_at: new Date().toISOString(),
  });

  // STEP 6: Reviewing suggested profile updates...
  onProgress?.({
    step: 6,
    totalSteps: 6,
    label: 'Reviewing suggested profile updates...',
    detail: `Identified ${matchedReview.summary.totalItems} medical details for your review.`,
    percentage: 100,
  });

  return {
    extraction: extractionResult,
    review: matchedReview,
    extractionRecord,
  };
}

