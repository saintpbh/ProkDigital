import React, { useState, useEffect, useRef } from 'react';
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
  const [zoomMultiplier, setZoomMultiplier] = useState<number>(1.0); // 1.0 = 100% Auto-fit width
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return isSplitView ? Math.max(window.innerWidth - 420, 360) : window.innerWidth;
    }
    return 380;
  });
  const [useCanvasMode, setUseCanvasMode] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

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
  }, [blobUrl]);

  // Zoom Handlers
  const handleZoomIn = () => {
    haptic.button();
    setZoomMultiplier((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 3.0));
  };

  const handleZoomOut = () => {
    haptic.button();
    setZoomMultiplier((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.5));
  };

  const handleFitWidth = () => {
    haptic.button();
    setZoomMultiplier(1.0); // 1.0 = Default 100% Fit Width
  };

  return (
    <div className={`fast-pdf-viewer ${isSplitView ? 'is-split' : 'is-modal'}`}>
      {/* Floating Fast Viewer Toolbar */}
      <div className="fast-pdf-toolbar">
        <div className="toolbar-left">
          <span className="pdf-type-badge">PDF</span>
          {numPages > 0 && <span className="page-count-badge">총 {numPages}p</span>}
          <span className="pdf-title-text" title={title}>{title}</span>
        </div>

        <div className="toolbar-controls">
          <button 
            className="btn-tool" 
            onClick={handleZoomOut} 
            title="축소 (작게)"
            disabled={zoomMultiplier <= 0.5}
          >
            🔍-
          </button>
          <button 
            className={`btn-tool btn-fit-width ${zoomMultiplier === 1.0 ? 'active' : ''}`} 
            onClick={handleFitWidth} 
            title="가로폭 맞춤 (기본 100%)"
          >
            ↔ {Math.round(zoomMultiplier * 100)}% {zoomMultiplier === 1.0 ? '(폭맞춤)' : ''}
          </button>
          <button 
            className="btn-tool" 
            onClick={handleZoomIn} 
            title="확대 (크게)"
            disabled={zoomMultiplier >= 3.0}
          >
            🔍+
          </button>
          <button 
            className="btn-tool btn-tool-browser" 
            onClick={() => {
              haptic.button();
              window.open(url, '_blank');
            }}
            title="브라우저(원본) 열기 / 다운로드"
          >
            🌐 원본 열기
          </button>
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
      </div>

      {/* PDF Content Area */}
      <div className="fast-pdf-body" ref={containerRef}>
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

        {/* 1. Fast Canvas Mode with Auto-Fit Width & Zoom */}
        {useCanvasMode && !loadError && (
          <div className="pdf-canvas-container">
            {pages.map((pageMeta) => {
              // Calculate width that fits the container (with 24px padding margin)
              const availableWidth = Math.max(containerWidth - 28, 280);
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
      className={`pdf-page-card ${isRendered ? 'is-ready' : 'is-loading'}`}
      style={{ width: `${Math.floor(targetWidth)}px`, minHeight: `${Math.floor(targetHeight)}px` }}
    >
      <canvas ref={canvasRef} className="pdf-page-canvas" />
      <span className="page-number-tag">{pageNumber}</span>
    </div>
  );
};
