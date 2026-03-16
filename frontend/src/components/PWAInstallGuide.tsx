import { useState, useEffect } from 'react';

export const PWAInstallGuide = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other');
    const [isStandalone, setIsStandalone] = useState(false);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        // standalone 모드인지 확인 (이미 설치됨)
        if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
            setIsStandalone(true);
            return;
        }

        // 플랫폼 감지
        const userAgent = window.navigator.userAgent.toLowerCase();
        if (/android/.test(userAgent)) {
            setPlatform('android');
        } else if (/iphone|ipad|ipod/.test(userAgent)) {
            setPlatform('ios');
        }

        // 안드로이드 설치 프로ンプ트 이벤트 리스너
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowGuide(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // iOS는 Safari 환경에서만 가이드 표시
        if (/iphone|ipad|ipod/.test(userAgent) && !(/crios|fxios|optios|edgios/.test(userAgent))) {
            setShowGuide(true);
        }

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            setShowGuide(false);
        }
    };

    if (isStandalone || !showGuide) return null;

    return (
        <div className="pwa-guide-container">
            {platform === 'android' && deferredPrompt && (
                <div className="android-banner">
                    <div className="guide-content">
                        <span className="pwa-icon">📱</span>
                        <div className="guide-text">
                            <strong>디지털 총회 앱 설치</strong>
                            <span>홈 화면에 추가하여 앱처럼 편리하게 사용하세요.</span>
                        </div>
                    </div>
                    <div className="guide-actions">
                        <button className="btn-install" onClick={handleInstallClick}>설치하기</button>
                        <button className="btn-dismiss" onClick={() => setShowGuide(false)}>다음에</button>
                    </div>
                </div>
            )}

            {platform === 'ios' && (
                <div className="ios-guide-overlay" onClick={() => setShowGuide(false)}>
                    <div className="ios-bubble" onClick={(e) => e.stopPropagation()}>
                        <div className="ios-guide-header">
                            <strong>홈 화면에 추가하여 앱으로 사용하기</strong>
                            <button className="btn-close" onClick={() => setShowGuide(false)}>×</button>
                        </div>
                        <div className="ios-guide-body">
                            <p>1. 하단 도구 모음의 <strong>공유 버튼</strong>( <span className="ios-icon">⎋</span> )을 누르세요.</p>
                            <p>2. 리스트를 아래로 내려 <strong>'홈 화면에 추가'</strong> 아이콘을 누르세요.</p>
                        </div>
                        <div className="ios-bubble-arrow"></div>
                    </div>
                </div>
            )}

            <style>{`
                .pwa-guide-container { position: fixed; left: 0; width: 100%; z-index: 3000; }
                
                /* Android Banner */
                .android-banner { 
                    bottom: 0; background: #1a237e; color: white; padding: 16px 20px; 
                    display: flex; flex-direction: column; gap: 12px;
                    border-radius: 20px 20px 0 0; box-shadow: 0 -4px 20px rgba(0,0,0,0.2);
                    animation: slideUpPWA 0.4s ease-out;
                }
                .guide-content { display: flex; align-items: center; gap: 12px; }
                .pwa-icon { font-size: 24px; }
                .guide-text { display: flex; flex-direction: column; }
                .guide-text strong { font-size: 1rem; }
                .guide-text span { font-size: 0.8rem; opacity: 0.8; }
                .guide-actions { display: flex; gap: 8px; }
                .btn-install { flex: 1; background: white; color: #1a237e; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; }
                .btn-dismiss { background: rgba(255,255,255,0.1); color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; }

                /* iOS Bubble */
                .ios-guide-overlay { 
                    top: 0; bottom: 0; background: rgba(0,0,0,0.3); 
                    display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding-bottom: 80px;
                }
                .ios-bubble { 
                    background: white; width: 90%; max-width: 340px; border-radius: 16px; padding: 20px; 
                    box-shadow: 0 4px 30px rgba(0,0,0,0.3); position: relative; animation: popInPWA 0.3s ease-out;
                }
                .ios-guide-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
                .ios-guide-header strong { font-size: 0.95rem; color: #1a237e; line-height: 1.4; }
                .ios-guide-body p { font-size: 0.9rem; color: #444; margin: 8px 0; }
                .ios-icon { font-size: 1.2rem; vertical-align: middle; color: #007aff; }
                .ios-bubble-arrow { 
                    position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%);
                    border-left: 10px solid transparent; border-right: 10px solid transparent;
                    border-top: 10px solid white;
                }
                @keyframes slideUpPWA { from { transform: translateY(100%); } to { transform: translateY(0); } }
                @keyframes popInPWA { from { transform: scale(0.9) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
            `}</style>
        </div>
    );
};
