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

interface RenderedPage {
  pageNumber: number;
  dataUrl?: string;
  width: number;
  height: number;
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
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [scale, setScale] = useState<number>(1.0);
  const [useCanvasMode, setUseCanvasMode] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

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

  // 2. Load PDF document via PDF.js for Ultra-Fast Canvas Rendering
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

        // Prepare page placeholders for virtual / progressive render
        const initialPages: RenderedPage[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          initialPages.push({
            pageNumber: i,
            width: viewport.width,
            height: viewport.height
          });
        }
        if (!isCancelled) {
          setPages(initialPages);
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
    setScale((prev) => Math.min(prev + 0.25, 2.5));
  };

  const handleZoomOut = () => {
    haptic.button();
    setScale((prev) => Math.max(prev - 0.25, 0.6));
  };

  const handleZoomReset = () => {
    haptic.button();
    setScale(1.0);
  };

  return (
    <div className={`fast-pdf-viewer ${isSplitView ? 'is-split' : 'is-modal'}`}>
      {/* Floating Fast Viewer Toolbar */}
      <div className="fast-pdf-toolbar">
        <div className="toolbar-left">
          <span className="pdf-type-badge">PDF</span>
          {numPages > 0 && <span className="page-count-badge">총 {numPages}페이지</span>}
          <span className="pdf-title-text" title={title}>{title}</span>
        </div>

        <div className="toolbar-controls">
          <button className="btn-tool" onClick={handleZoomOut} title="축소">
            🔍-
          </button>
          <button className="btn-tool zoom-label" onClick={handleZoomReset} title="기본 배율">
            {Math.round(scale * 100)}%
          </button>
          <button className="btn-tool" onClick={handleZoomIn} title="확대">
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

        {/* 1. Fast Canvas Mode (PDF.js Canvas Renderer with Zero Latency) */}
        {useCanvasMode && !loadError && (
          <div className="pdf-canvas-container" style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
            {pages.map((pageInfo) => (
              <PdfPageCanvas 
                key={pageInfo.pageNumber} 
                pdfDoc={pdfDocRef.current} 
                pageNumber={pageInfo.pageNumber}
                scale={1.5}
              />
            ))}
          </div>
        )}

        {/* 2. Native Embed Fallback Mode (WebKit / Safari / Chrome Native Viewer) */}
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
 * Individual Page Canvas Component with High-DPI Crisp Rendering
 */
const PdfPageCanvas: React.FC<{
  pdfDoc: any;
  pageNumber: number;
  scale?: number;
}> = ({ pdfDoc, pageNumber, scale = 1.5 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    if (!pdfDoc || !canvasRef.current) return;

    pdfDoc.getPage(pageNumber).then((page: any) => {
      if (isCancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      // High DPI display sharpness
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      const renderContext = {
        canvasContext: context,
        transform: transform,
        viewport: viewport,
      };

      page.render(renderContext).promise.then(() => {
        if (!isCancelled) setIsRendered(true);
      }).catch(() => {
        // Ignore rendering cancellation errors
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, pageNumber, scale]);

  return (
    <div className={`pdf-page-card ${isRendered ? 'is-ready' : 'is-loading'}`}>
      <canvas ref={canvasRef} className="pdf-page-canvas" />
      <span className="page-number-tag">{pageNumber}</span>
    </div>
  );
};
