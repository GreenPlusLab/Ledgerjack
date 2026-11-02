/**
 * ocr — read the text of a receipt photo on this phone (Tesseract, Apache-2.0).
 *
 * Everything it needs (the reader, its engine and the English language file,
 * about 7 MB) is served from LedgerJack itself under /ocr/, never from another
 * website, and is downloaded once, the first time it's used. The photo never
 * leaves the phone.
 */

export const OCR_DOWNLOAD_MB = 7;
const READY_KEY = "ocr_downloaded";

export function ocrDownloadedBefore(): boolean {
  try { return localStorage.getItem(READY_KEY) === "true"; } catch { return false; }
}

export type OcrProgress = (status: string, progress: number) => void;

/** Read the text in an image (data URL, Blob or File). Runs entirely on this device. */
export async function readTextOnDevice(image: string | Blob, onProgress?: OcrProgress): Promise<string> {
  const { createWorker, OEM } = await import("tesseract.js");
  const base = new URL("ocr/", document.baseURI).href;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`,
    langPath: `${base}lang`,
    workerBlobURL: false,
    gzip: true,
    logger: (m: { status: string; progress: number }) => onProgress?.(m.status, m.progress),
  });
  try {
    const { data } = await worker.recognize(image);
    try { localStorage.setItem(READY_KEY, "true"); } catch { /* ignore */ }
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}
