// Use pdfjs-dist (Node ESM build)
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function pdfToPages(
  fileBuffer: Buffer
): Promise<{ pageNumber: number; text: string }[]> {
  const loadingTask = getDocument({ data: new Uint8Array(fileBuffer) });
  const pdf = await loadingTask.promise;

  const pages: { pageNumber: number; text: string }[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent: any = await page.getTextContent();
      const text = textContent.items
        .map((it: any) => (typeof it.str === "string" ? it.str : ""))
        .join(" ")
        .trim();
      pages.push({ pageNumber: i, text });
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}