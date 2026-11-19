import type { DocumentType } from '@/types';

export interface ExtractedDocumentData {
  title?: string;
  document_type?: DocumentType;
  hospital_name?: string;
  doctor_name?: string;
  document_date?: string;
  follow_up_date?: string;
  medications?: string[];
  rawText: string;
  method: 'pdf-text' | 'ocr' | 'fallback';
}

// Rule-based deterministic metadata extractor (no external AI API required)
export function parseExtractedText(rawText: string, originalFileName: string): ExtractedDocumentData {
  const result: ExtractedDocumentData = {
    rawText,
    method: 'pdf-text',
    medications: [],
  };

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Hospital / Clinic Name
  const hospitalRegex = /(?:hospital|clinic|centre|center|healthcare|laboratory|diagnostic|medical\s+center|institute)\b/i;
  for (const line of lines.slice(0, 15)) {
    if (hospitalRegex.test(line) && line.length < 80) {
      result.hospital_name = line.replace(/^[#*•\s-]+/, '').trim();
      break;
    }
  }

  // 2. Doctor Name
  const doctorRegex = /(?:dr\.?|doctor)\s+([a-z\s.'-]+)/i;
  for (const line of lines.slice(0, 20)) {
    const match = line.match(doctorRegex);
    if (match && match[0].length < 40) {
      result.doctor_name = match[0].trim();
      break;
    }
  }

  // 3. Document Date
  // Formats: DD/MM/YYYY, YYYY-MM-DD, DD-MMM-YYYY, DD Month YYYY
  const dateRegex = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/i;
  for (const line of lines) {
    if (/date|dt\b|dated/i.test(line) || dateRegex.test(line)) {
      const match = line.match(dateRegex);
      if (match) {
        try {
          const parsed = new Date(match[0]);
          if (!isNaN(parsed.getTime())) {
            result.document_date = parsed.toISOString().split('T')[0];
            break;
          }
        } catch {
          // continue
        }
      }
    }
  }

  // 4. Follow-up date
  const followUpRegex = /(?:follow[\s-]?up|review|next\s+visit)(?:\s+(?:on|after|date))?:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i;
  const followUpMatch = rawText.match(followUpRegex);
  if (followUpMatch && followUpMatch[1]) {
    try {
      const parsed = new Date(followUpMatch[1]);
      if (!isNaN(parsed.getTime())) {
        result.follow_up_date = parsed.toISOString().split('T')[0];
      }
    } catch {
      // ignore
    }
  }

  // 5. Document Type
  const lowerText = (rawText + ' ' + originalFileName).toLowerCase();
  if (lowerText.includes('prescription') || lowerText.includes('rx')) {
    result.document_type = 'prescription';
    result.title = 'Prescription' + (result.doctor_name ? ` - ${result.doctor_name}` : '');
  } else if (lowerText.includes('blood') || lowerText.includes('lab') || lowerText.includes('lipid') || lowerText.includes('cbc') || lowerText.includes('test report')) {
    result.document_type = 'lab-result';
    result.title = 'Laboratory Test Report';
  } else if (lowerText.includes('x-ray') || lowerText.includes('mri') || lowerText.includes('ct scan') || lowerText.includes('ultrasound') || lowerText.includes('ecg')) {
    result.document_type = 'imaging';
    result.title = 'Diagnostic Imaging / ECG Report';
  } else if (lowerText.includes('discharge')) {
    result.document_type = 'discharge-summary';
    result.title = 'Discharge Summary';
  } else {
    result.document_type = 'report';
    result.title = originalFileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  }

  // 6. Common Medication keywords detection
  const medKeywords = [
    'metformin', 'atorvastatin', 'paracetamol', 'amoxicillin', 'aspirin',
    'vitamin', 'omeprazole', 'losartan', 'amlodipine', 'azithromycin',
    'cetirizine', 'pantoprazole', 'ibuprofen', 'insulin', 'ciprofloxacin'
  ];
  for (const med of medKeywords) {
    if (new RegExp(`\\b${med}\\b`, 'i').test(rawText)) {
      result.medications?.push(med.charAt(0).toUpperCase() + med.slice(1));
    }
  }

  return result;
}

// Extract text from text-based PDF using PDF.js preserving line breaks
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      } catch {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 10); // extract up to first 10 pages

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];

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
    }

    return fullText.trim();
  } catch (err) {
    console.warn('PDF.js text extraction failed or file is scanned image:', err);
    return '';
  }
}

// Optional OCR for scanned images using Tesseract.js
export async function extractTextWithOCR(file: File, onProgress?: (p: number) => void): Promise<string> {
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

// Unified client-side document processor
export async function processMedicalFile(
  file: File,
  onStatusUpdate?: (status: string) => void
): Promise<ExtractedDocumentData> {
  const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');
  const isImage = file.type.startsWith('image/');

  let extractedText = '';
  let method: 'pdf-text' | 'ocr' | 'fallback' = 'fallback';

  if (isPDF) {
    onStatusUpdate?.('Extracting digital text with PDF.js...');
    extractedText = await extractTextFromPDF(file);
    if (extractedText.length > 30) {
      method = 'pdf-text';
    } else {
      onStatusUpdate?.('PDF has no embedded text. Scanned document detected.');
    }
  } else if (isImage) {
    onStatusUpdate?.('Running client-side OCR with Tesseract.js...');
    extractedText = await extractTextWithOCR(file);
    if (extractedText.length > 10) {
      method = 'ocr';
    }
  }

  onStatusUpdate?.('Extracting structured medical metadata...');
  const result = parseExtractedText(extractedText, file.name);
  result.method = method;
  return result;
}

