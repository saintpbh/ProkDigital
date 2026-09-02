import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { getCachedBlobUrl, getInstantBlobUrl } from '../utils/pdfCache';
import { haptic } from '../utils/haptic';

// Configure PDF.js Worker to reliable CDN
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;
}

interface FastPdfViewerProps {
  url: string;
  title?: string;
  isSplitView?: boolean;
  onClose?: () => void;
}

interface PageMeta {
  pageNumber: number;
  originalWidth: number;
  originalHeight: number;
}

function getSavedProgress(pdfUrl: string): { page: number; scrollTop: number } | null {
  if (typeof window === 'undefined' || !pdfUrl) return null;
  try {
    const raw = localStorage.getItem(`prok_pdf_pos_${encodeURIComponent(pdfUrl)}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load pdf progress', e);
  }
  return null;
}

function saveProgress(pdfUrl: string, page: number, scrollTop: number) {
  if (typeof window === 'undefined' || !pdfUrl) return;
  try {
    localStorage.setItem(
      `prok_pdf_pos_${encodeURIComponent(pdfUrl)}`,
      JSON.stringify({ page, scrollTop, ts: Date.now() })
    );
  } catch (e) {
    console.warn('Failed to save pdf progress', e);
  }
}

export const FastPdfViewer: React.FC<FastPdfViewerProps> = ({
  url,
  title = '문서 열람',
  isSplitView = false,
  onClose
}) => {
  const [blobUrl, setBlobUrl] = useState<string>(getInstantBlobUrl(url) || url);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(() => {
    const saved = getSavedProgress(url);
    return saved?.page || 1;
  });
  const [resumeToast, setResumeToast] = useState<string | null>(null);
  const [isJumpModalOpen, setIsJumpModalOpen] = useState<boolean>(false);
  const [jumpInputVal, setJumpInputVal] = useState<string>('');
  const zoomMultiplier = 1.0; // Always fit-width (zoom UI removed)
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return isSplitView ? Math.max(window.innerWidth - 420, 360) : window.innerWidth;
    }
    return 380;
  });
  const [useCanvasMode, setUseCanvasMode] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const isAutoScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<any>(null);

  // Measure container width dynamically on resize & orientation change
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const clientW = containerRef.current.clientWidth;
        if (clientW > 100) {
          setContainerWidth(clientW);
        }
      }
    };

    updateWidth();
    const timer = setTimeout(updateWidth, 100);

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    window.addEventListener('resize', updateWidth);
    window.addEventListener('orientationchange', updateWidth);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
      window.removeEventListener('orientationchange', updateWidth);
    };
  }, []);

  // iOS Safari: Lock body scroll when modal viewer is open
  useEffect(() => {
    if (!isSplitView) {
      // Lock body & html scroll to prevent iOS scroll-through
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
      };
    }
  }, [isSplitView]);

  // 1. Resolve Blob URL immediately from memory cache
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setLoadError(null);

    const instant = getInstantBlobUrl(url);
    if (instant) {
      setBlobUrl(instant);
    }

    getCachedBlobUrl(url)
      .then((bUrl) => {
        if (!isCancelled) {
          setBlobUrl(bUrl);
        }
      })
      .catch((err) => {
        console.warn('Blob resolution failed, using direct url', err);
        if (!isCancelled) setBlobUrl(url);
      });

    return () => {
      isCancelled = true;
    };
  }, [url]);

  // 2. Load PDF document via PDF.js
  useEffect(() => {
    let isCancelled = false;
    if (!blobUrl) return;

    setIsLoading(true);
    setLoadError(null);

    const loadingTask = pdfjsLib.getDocument({
      url: blobUrl,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    });

    loadingTask.promise
      .then(async (pdfDoc) => {
        if (isCancelled) return;
        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);

        const pageMetas: PageMeta[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          pageMetas.push({
            pageNumber: i,
            originalWidth: viewport.width,
            originalHeight: viewport.height
          });
        }
        if (!isCancelled) {
          setPages(pageMetas);
          setIsLoading(false);

          // 3. Auto-Resume to previously viewed page
          const saved = getSavedProgress(url);
          if (saved && saved.page > 1) {
            isAutoScrollingRef.current = true;
            setCurrentPage(saved.page);
            setResumeToast(`📍 ${saved.page}페이지 이어보기 복원`);
            setTimeout(() => {
              const targetEl = document.getElementById(`pdf-page-card-${saved.page}`);
              if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'instant', block: 'start' });
              } else if (containerRef.current && saved.scrollTop) {
                containerRef.current.scrollTop = saved.scrollTop;
              }
              setTimeout(() => {
                isAutoScrollingRef.current = false;
              }, 400);
            }, 80);

            setTimeout(() => {
              setResumeToast(null);
            }, 2500);
          }
        }
      })
      .catch((err) => {
        console.warn('PDF.js parse failed, falling back to native embed', err);
        if (!isCancelled) {
          setUseCanvasMode(false);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [blobUrl, url]);

  // 4. Track visible page & save scroll progress automatically
  const handleScroll = useCallback(() => {
    if (isAutoScrollingRef.current || !containerRef.current || pages.length === 0) return;

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      const containerTop = containerRef.current.getBoundingClientRect().top;
      const containerCenter = containerTop + containerRef.current.clientHeight / 3;

      let detectedPage = 1;
      let minDistance = Infinity;

      for (const page of pages) {
        const el = document.getElementById(`pdf-page-card-${page.pageNumber}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const distance = Math.abs(rect.top - containerCenter);
          if (distance < minDistance) {
            minDistance = distance;
            detectedPage = page.pageNumber;
          }
        }
      }

      setCurrentPage(detectedPage);
      saveProgress(url, detectedPage, containerRef.current.scrollTop);
    }, 60);
  }, [pages, url]);

  // Smooth Scroll to specific page
  const scrollToPage = (targetPage: number) => {
    haptic.button();
    const pageNum = Math.max(1, Math.min(targetPage, numPages || 1));
    setCurrentPage(pageNum);
    setIsJumpModalOpen(false);

    const targetEl = document.getElementById(`pdf-page-card-${pageNum}`);
    if (targetEl) {
      isAutoScrollingRef.current = true;
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        isAutoScrollingRef.current = false;
        if (containerRef.current) {
          saveProgress(url, pageNum, containerRef.current.scrollTop);
        }
      }, 500);
    }
  };


  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpInputVal, 10);
    if (!isNaN(p) && p >= 1 && p <= numPages) {
      scrollToPage(p);
    }
  };

  return (
    <div className={`fast-pdf-viewer ${isSplitView ? 'is-split' : 'is-modal'}`}>
      {/* Minimal Mobile Toolbar: Page indicator + 원본 열기 + 닫기 */}
      <div className="fast-pdf-toolbar">
        {/* 1. 현재 페이지 표시 (탭하면 페이지 점프 팝업) */}
        <button 
          className="btn-page-indicator" 
          onClick={() => {
            if (numPages > 0) {
              haptic.modal();
              setJumpInputVal(String(currentPage));
              setIsJumpModalOpen(!isJumpModalOpen);
            }
          }}
          title="페이지 이동"
          disabled={numPages === 0}
        >
          <span className="current-p">{currentPage}</span>
          <span className="divider">/</span>
          <span className="total-p">{numPages > 0 ? `${numPages}p` : '...'}</span>
        </button>

        {/* 2. 원본 열기 */}
        <button 
          className="btn-tool btn-tool-browser" 
          onClick={() => {
            haptic.button();
            window.open(url, '_blank');
          }}
          title="브라우저(원본) 열기"
        >
          🌐 원본
        </button>

        {/* 3. 닫기 */}
        {onClose && (
          <button 
            className="btn-tool btn-tool-close" 
            onClick={() => {
              haptic.modal();
              onClose();
            }}
            title="닫기"
          >
            ✕
          </button>
        )}
      </div>

      {/* Auto-Resume Floating Toast Notification */}
      {resumeToast && (
        <div className="pdf-resume-toast">
          <span>{resumeToast}</span>
          <button 
            className="btn-resume-top" 
            onClick={() => scrollToPage(1)}
            title="첫 페이지(1p)로 이동"
          >
            ⤒ 처음(1p)으로
          </button>
        </div>
      )}

      {/* Quick Page Jump Modal / Popover */}
      {isJumpModalOpen && (
        <div className="page-jump-popover-overlay" onClick={() => setIsJumpModalOpen(false)}>
          <div className="page-jump-popover" onClick={(e) => e.stopPropagation()}>
            <div className="jump-header">
              <h4>페이지 이동</h4>
              <button className="btn-close-pop" onClick={() => setIsJumpModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleJumpSubmit} className="jump-form">
              <div className="jump-input-wrap">
                <input 
                  type="number" 
                  min="1" 
                  max={numPages} 
                  value={jumpInputVal} 
                  onChange={(e) => setJumpInputVal(e.target.value)}
                  autoFocus
                  placeholder={`1 ~ ${numPages}`}
                  className="jump-input"
                />
                <span className="jump-max-tag">/ {numPages}p</span>
              </div>
              <button type="submit" className="btn-jump-go">이동</button>
            </form>
            <div className="jump-quick-tags">
              <button onClick={() => scrollToPage(1)}>1p (처음)</button>
              {numPages >= 10 && <button onClick={() => scrollToPage(Math.round(numPages * 0.25))}>{Math.round(numPages * 0.25)}p</button>}
              {numPages >= 10 && <button onClick={() => scrollToPage(Math.round(numPages * 0.5))}>{Math.round(numPages * 0.5)}p (중간)</button>}
              {numPages >= 10 && <button onClick={() => scrollToPage(Math.round(numPages * 0.75))}>{Math.round(numPages * 0.75)}p</button>}
              <button onClick={() => scrollToPage(numPages)}>{numPages}p (마지막)</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Content Area */}
      <div className="fast-pdf-body" ref={containerRef} onScroll={handleScroll}>
        {isLoading && (
          <div className="fast-pdf-skeleton-loader">
            <div className="loader-spinner"></div>
            <p>초고속 문서 로딩 중...</p>
          </div>
        )}

        {loadError && (
          <div className="fast-pdf-error">
            <p>⚠️ {loadError}</p>
            <button className="btn-primary" onClick={() => window.open(url, '_blank')}>
              브라우저로 직접 열기
            </button>
          </div>
        )}

        {/* 1. Fast Canvas Mode with Auto-Fit Width */}
        {useCanvasMode && !loadError && (
          <div className="pdf-canvas-container">
            {pages.map((pageMeta) => {
              // iOS-safe width: subtract padding (8px×2=16px) to never exceed viewport
              const availableWidth = Math.max(containerWidth - 16, 280);
              const targetWidth = availableWidth * zoomMultiplier;

              return (
                <PdfPageCanvas 
                  key={`${pageMeta.pageNumber}_${targetWidth}`} 
                  pdfDoc={pdfDocRef.current} 
                  pageNumber={pageMeta.pageNumber}
                  targetWidth={targetWidth}
                  originalWidth={pageMeta.originalWidth}
                  originalHeight={pageMeta.originalHeight}
                />
              );
            })}
          </div>
        )}

        {/* 2. Native Embed Fallback Mode */}
        {!useCanvasMode && !loadError && (
          <iframe 
            src={`${blobUrl}#toolbar=0&navpanes=0&view=FitH`}
            title={title}
            className="fast-native-pdf-frame"
          />
        )}
      </div>
    </div>
  );
};

/**
 * High-DPI Page Canvas Component with Auto-Fit Width
 */
const PdfPageCanvas: React.FC<{
  pdfDoc: any;
  pageNumber: number;
  targetWidth: number;
  originalWidth: number;
  originalHeight: number;
}> = ({ pdfDoc, pageNumber, targetWidth, originalWidth, originalHeight }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendered, setIsRendered] = useState(false);

  // Aspect ratio preserved height
  const scaleRatio = targetWidth / originalWidth;
  const targetHeight = originalHeight * scaleRatio;

  useEffect(() => {
    let isCancelled = false;
    if (!pdfDoc || !canvasRef.current) return;

    pdfDoc.getPage(pageNumber).then((page: any) => {
      if (isCancelled) return;
      
      const renderScale = scaleRatio;
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      // High DPI display sharpness (Retina / 2x / 3x)
      const outputScale = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for speed & memory
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      const renderContext = {
        canvasContext: context,
        transform: transform,
        viewport: viewport,
      };

      page.render(renderContext).promise.then(() => {
        if (!isCancelled) setIsRendered(true);
      }).catch(() => {
        // Ignore rendering cancellation
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, pageNumber, scaleRatio]);

  return (
    <div 
      id={`pdf-page-card-${pageNumber}`}
      className={`pdf-page-card ${isRendered ? 'is-ready' : 'is-loading'}`}
      style={{ width: `${Math.floor(targetWidth)}px`, maxWidth: '100%', minHeight: `${Math.floor(targetHeight)}px` }}
    >
      <canvas ref={canvasRef} className="pdf-page-canvas" />
      <span className="page-number-tag">{pageNumber}</span>
    </div>
  );
};
