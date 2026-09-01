// Memory & Blob Cache Manager for Instant PDF Rendering
const memoryBlobMap = new Map<string, string>();
const loadingPromises = new Map<string, Promise<string>>();

/**
 * Preload a single PDF URL into memory blob cache
 */
export async function preloadPdf(url: string): Promise<string> {
  if (!url) return '';
  if (memoryBlobMap.has(url)) {
    return memoryBlobMap.get(url)!;
  }
  if (loadingPromises.has(url)) {
    return loadingPromises.get(url)!;
  }

  const promise = (async () => {
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(pdfBlob);
      memoryBlobMap.set(url, blobUrl);
      return blobUrl;
    } catch (err) {
      console.warn('PDF background pre-cache failed for', url, err);
      return url; // fallback to original URL
    } finally {
      loadingPromises.delete(url);
    }
  })();

  loadingPromises.set(url, promise);
  return promise;
}

/**
 * Preload all public PDF documents in parallel
 */
export function preloadAllPdfs(urls: string[]) {
  const validUrls = urls.filter(u => u && u.startsWith('http'));
  validUrls.forEach(url => {
    preloadPdf(url).catch(() => {});
  });
}

/**
 * Get cached Blob URL or load immediately
 */
export async function getCachedBlobUrl(url: string): Promise<string> {
  if (!url) return '';
  if (memoryBlobMap.has(url)) {
    return memoryBlobMap.get(url)!;
  }
  return preloadPdf(url);
}

/**
 * Synchronously check if a PDF is already cached in RAM
 */
export function getInstantBlobUrl(url: string): string | null {
  return memoryBlobMap.get(url) || null;
}
