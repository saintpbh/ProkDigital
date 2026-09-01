import { useState, useEffect } from 'react';

export const PWAInstallGuide = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other');
    const [isInAppBrowser, setIsInAppBrowser] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // 1. Check if already running in standalone PWA mode
        const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
        if (standalone) {
            setIsStandalone(true);
            return;
        }

        // 2. Check if dismissed for today
        const dismissedUntil = localStorage.getItem('pwa_prompt_dismissed_until');
        const isDismissed = dismissedUntil && Number(dismissedUntil) > Date.now();

        // 3. Detect platform and in-app browser
        const ua = window.navigator.userAgent.toLowerCase();
        const inApp = /kakaotalk|line|instagram|fban|fbav|naver|daum|kakaostory|band|inapp/i.test(ua);
        setIsInAppBrowser(inApp);

        if (/android/.test(ua)) {
            setPlatform('android');
        } else if (/iphone|ipad|ipod/.test(ua)) {
            setPlatform('ios');
        } else {
            setPlatform('other');
        }

        // 4. Android beforeinstallprompt listener
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            if (!isDismissed) setShowModal(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // 5. iOS Safari auto-show on initial visit
        if (/iphone|ipad|ipod/.test(ua) && !isDismissed) {
            setShowModal(true);
        } else if (/android/.test(ua) && !isDismissed && inApp) {
            setShowModal(true);
        }

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setDeferredPrompt(null);
                setShowModal(false);
            }
        } else if (platform === 'android') {
            alert("브라우저 메뉴(⋮)를 누른 후 '앱 설치' 또는 '홈 화면에 추가'를 선택해 주세요.");
        }
    };

    const handleDismissToday = () => {
        const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
        localStorage.setItem('pwa_prompt_dismissed_until', String(tomorrow));
        setShowModal(false);
    };

    const handleCopyUrl = () => {
        const targetUrl = 'https://digital.prok.or.kr';
        navigator.clipboard.writeText(targetUrl)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
            })
            .catch(() => {
                alert('주소: https://digital.prok.or.kr');
            });
    };

    if (isStandalone || !showModal) return null;

    return (
        <div className="pwa-install-overlay" onClick={() => setShowModal(false)}>
            <div className="pwa-install-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header with App Logo */}
                <div className="modal-top">
                    <img src="/prok-logo.png" alt="한국기독교장로회 로고" className="modal-logo" />
                    <h2>한국기독교장로회 디지털 총회</h2>
                    <p className="modal-subtitle">홈 화면에 전용 앱을 설치하시면 훨씬 빠르고 편리합니다.</p>
                </div>

                {/* In-App Browser Escape Notice */}
                {isInAppBrowser && (
                    <div className="inapp-warning-box">
                        <div className="inapp-warning-header">
                            <span className="warning-icon">⚠️</span>
                            <strong>외부 브라우저로 접속해 주세요</strong>
                        </div>
                        <p>
                            현재 카카오톡/인앱 브라우저로 접속 중입니다.<br />
                            <strong>우측 상단 [⋮] 또는 하단 [공유]</strong>를 눌러 <strong>'{platform === 'ios' ? 'Safari로 열기' : 'Chrome으로 열기'}'</strong>를 선택해야 앱 설치 및 알림이 가능합니다.
                        </p>
                        <button className="btn-copy-url" onClick={handleCopyUrl}>
                            {copied ? '✅ 주소가 복사되었습니다! (브라우저에 붙여넣기)' : '🔗 접속 주소 복사하기'}
                        </button>
                    </div>
                )}

                {/* Platform Specific Guides */}
                {!isInAppBrowser && platform === 'android' && (
                    <div className="install-guide-body android-guide">
                        <div className="features-list">
                            <div className="feature-item">
                                <span className="feat-icon">⚡</span>
                                <div><strong>원클릭 실행 & 전체화면</strong><span>주소창 없이 쾌적한 총회 화면 지원</span></div>
                            </div>
                            <div className="feature-item">
                                <span className="feat-icon">🔔</span>
                                <div><strong>실시간 푸시 알림</strong><span>앱이 닫혀 있어도 중요 공지 즉시 수신</span></div>
                            </div>
                            <div className="feature-item">
                                <span className="feat-icon">📑</span>
                                <div><strong>초고속 문서 열람</strong><span>새 회무 문서 공유 시 즉각 동기화</span></div>
                            </div>
                        </div>

                        <button className="btn-install-primary" onClick={handleInstallClick}>
                            ⚡ 원클릭 앱 설치하기
                        </button>
                    </div>
                )}

                {!isInAppBrowser && platform === 'ios' && (
                    <div className="install-guide-body ios-guide">
                        <div className="ios-steps">
                            <div className="step-card">
                                <div className="step-num">1</div>
                                <div className="step-content">
                                    <strong>하단 도구 모음의 공유 버튼 터치</strong>
                                    <span>화면 맨 아래 중앙의 <span className="icon-badge">⎋ 공유 버튼</span>을 누르세요.</span>
                                </div>
                            </div>
                            <div className="step-card">
                                <div className="step-num">2</div>
                                <div className="step-content">
                                    <strong>'홈 화면에 추가' 선택</strong>
                                    <span>메뉴를 아래로 스크롤하여 <span className="icon-badge">➕ 홈 화면에 추가</span>를 누르세요.</span>
                                </div>
                            </div>
                            <div className="step-card">
                                <div className="step-num">3</div>
                                <div className="step-content">
                                    <strong>우측 상단 '추가' 터치</strong>
                                    <span>홈 화면에 총회 공식 앱 아이콘이 바로 생성됩니다.</span>
                                </div>
                            </div>
                        </div>

                        <button className="btn-install-secondary" onClick={() => setShowModal(false)}>
                            확인했습니다 (웹에서 계속하기)
                        </button>
                    </div>
                )}

                {!isInAppBrowser && platform === 'other' && (
                    <div className="install-guide-body desktop-guide">
                        <p>PC 및 태블릿 브라우저 주소창 우측의 <strong>[설치(⊕)]</strong> 버튼을 누르시면 PC 앱으로도 사용하실 수 있습니다.</p>
                        <button className="btn-install-secondary" onClick={() => setShowModal(false)}>
                            확인했습니다
                        </button>
                    </div>
                )}

                {/* Footer Controls */}
                <div className="modal-footer">
                    <button className="btn-dismiss-today" onClick={handleDismissToday}>
                        오늘 하루 보지 않기
                    </button>
                    <button className="btn-dismiss-close" onClick={() => setShowModal(false)}>
                        닫기
                    </button>
                </div>
            </div>

            <style>{`
                .pwa-install-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.75);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    animation: fadeIn 0.25s ease-out;
                }
                .pwa-install-modal {
                    background: #ffffff;
                    border-radius: 28px;
                    padding: 28px 24px 20px;
                    width: 100%;
                    max-width: 420px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
                    animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    text-align: center;
                    color: #1e293b;
                    box-sizing: border-box;
                }
                .modal-top {
                    margin-bottom: 20px;
                }
                .modal-logo {
                    width: 64px;
                    height: 64px;
                    object-fit: contain;
                    margin-bottom: 12px;
                    filter: drop-shadow(0 4px 10px rgba(0,0,0,0.1));
                }
                .modal-top h2 {
                    font-size: 1.25rem;
                    font-weight: 800;
                    color: #1e3f82;
                    margin: 0 0 6px 0;
                    letter-spacing: -0.3px;
                }
                .modal-subtitle {
                    font-size: 0.85rem;
                    color: #64748b;
                    margin: 0;
                    line-height: 1.4;
                    word-break: keep-all;
                }
                
                /* In-App Warning Box */
                .inapp-warning-box {
                    background: #fff7ed;
                    border: 1.5px solid #fdba74;
                    border-radius: 16px;
                    padding: 14px 16px;
                    margin-bottom: 16px;
                    text-align: left;
                }
                .inapp-warning-header {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #c2410c;
                    margin-bottom: 6px;
                    font-size: 0.9rem;
                }
                .inapp-warning-box p {
                    font-size: 0.8rem;
                    color: #7c2d12;
                    line-height: 1.45;
                    margin: 0 0 10px 0;
                }
                .btn-copy-url {
                    width: 100%;
                    background: #ea580c;
                    color: #ffffff;
                    border: none;
                    padding: 10px;
                    border-radius: 10px;
                    font-weight: 700;
                    font-size: 0.85rem;
                    cursor: pointer;
                }

                /* Features List (Android) */
                .features-list {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-bottom: 20px;
                    text-align: left;
                }
                .feature-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: #f8fafc;
                    padding: 10px 14px;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                }
                .feat-icon {
                    font-size: 1.3rem;
                }
                .feature-item div {
                    display: flex;
                    flex-direction: column;
                }
                .feature-item strong {
                    font-size: 0.88rem;
                    color: #0f172a;
                }
                .feature-item span {
                    font-size: 0.75rem;
                    color: #64748b;
                }

                /* iOS Steps */
                .ios-steps {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-bottom: 20px;
                    text-align: left;
                }
                .step-card {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    background: #f8fafc;
                    padding: 12px 14px;
                    border-radius: 14px;
                    border: 1px solid #e2e8f0;
                }
                .step-num {
                    background: #1e3f82;
                    color: #ffffff;
                    font-size: 0.8rem;
                    font-weight: 800;
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    margin-top: 2px;
                }
                .step-content {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }
                .step-content strong {
                    font-size: 0.88rem;
                    color: #0f172a;
                }
                .step-content span {
                    font-size: 0.78rem;
                    color: #64748b;
                    line-height: 1.35;
                }
                .icon-badge {
                    background: #e2e8f0;
                    color: #0f172a;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 700;
                }

                /* Buttons */
                .btn-install-primary {
                    width: 100%;
                    background: linear-gradient(135deg, #1e3f82 0%, #1e293b 100%);
                    color: #ffffff;
                    border: none;
                    padding: 14px;
                    border-radius: 14px;
                    font-weight: 800;
                    font-size: 1rem;
                    cursor: pointer;
                    box-shadow: 0 4px 14px rgba(30, 63, 130, 0.35);
                    transition: transform 0.15s ease;
                }
                .btn-install-primary:active {
                    transform: scale(0.98);
                }
                .btn-install-secondary {
                    width: 100%;
                    background: #1e3f82;
                    color: #ffffff;
                    border: none;
                    padding: 13px;
                    border-radius: 14px;
                    font-weight: 700;
                    font-size: 0.92rem;
                    cursor: pointer;
                }

                /* Modal Footer */
                .modal-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 16px;
                    padding-top: 12px;
                    border-top: 1px solid #f1f5f9;
                }
                .btn-dismiss-today {
                    background: transparent;
                    border: none;
                    color: #94a3b8;
                    font-size: 0.8rem;
                    cursor: pointer;
                    padding: 4px;
                }
                .btn-dismiss-close {
                    background: transparent;
                    border: none;
                    color: #64748b;
                    font-size: 0.85rem;
                    font-weight: 700;
                    cursor: pointer;
                    padding: 4px 8px;
                }

                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes popIn { from { opacity: 0; transform: scale(0.92) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
            `}</style>
        </div>
    );
};
