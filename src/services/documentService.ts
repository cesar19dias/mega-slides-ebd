import mammoth from 'mammoth';
import { extractTextFromPDF } from './pdfService';

/**
 * Extrai texto legível de arquivos enviados pelo usuário:
 * - PDF: via pdfjs-dist
 * - DOCX: via mammoth (extrai texto cru sem formatação binária)
 * - TXT/MD/outros: via file.text()
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();

  if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
    return await extractTextFromPDF(file);
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await (mammoth as any).extractRawText({ arrayBuffer });
    return (result?.value || '').trim();
  }

  return await file.text();
}
