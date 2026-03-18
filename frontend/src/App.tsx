import { useState, useEffect } from 'react';
import { useFirebaseSync } from './hooks/useFirebaseSync';
import { EventLogin } from './components/EventLogin';
import { PWAInstallGuide } from './components/PWAInstallGuide';
import './App.css';
import { requestPushPermission, onForegroundMessage } from './services/messagingService';

function App() {
  const [event, setEvent] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [activeVote, setActiveVote] = useState<any | null>(null);
  const [voteResults, setVoteResults] = useState<any | null>(null);
  const [hasVoted, setHasVoted] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'agenda' | 'vote' | 'schedule' | 'info'>('agenda');
  const [announcementHistory, setAnnouncementHistory] = useState<{ id: string, message: string, timestamp: string }[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [prefetchUrl, setPrefetchUrl] = useState<string | null>(null);
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  const [voterId] = useState(() => {
    let id = localStorage.getItem('voterId');
    if (!id) {
      id = Math.random().toString(36).substring(2, 11);
      localStorage.setItem('voterId', id);
    }
    return id;
  });

  // Firebase Sync (Primary and only data source)
  const { 
    files: displayFiles, 
    links: displayLinks,
  } = useFirebaseSync(token, {
    onAnnouncement: (msg: string) => {
      setAnnouncement(msg);
      if (msg) {
        const newAnnouncement = {
          id: Date.now().toString(),
          message: msg,
          timestamp: new Date().toISOString()
        };
        setAnnouncementHistory(prev => {
          const updated = [newAnnouncement, ...prev];
          const currentToken = window.location.pathname.startsWith('/join/') 
            ? window.location.pathname.split('/join/')[1] 
            : localStorage.getItem('eventToken');
          if (currentToken) localStorage.setItem(`announcements_${currentToken}`, JSON.stringify(updated));
          return updated;
        });
      }
    },
    onNewFilePublished: (url: string) => {
      console.log('[Firebase] Pre-fetching new file:', url);
      setPrefetchUrl(url);
      setTimeout(() => setPrefetchUrl(null), 10000);
    },
    onVoteUpdate: (v: any) => {
      if (!v) {
        setActiveVote(null);
        setVoteResults(null);
        setHasVoted(false);
        return;
      }
      if (v.status === 'OPEN') {
        setActiveVote((prev: any) => ({ ...prev, ...v }));
        setVoteResults(v.results || null);
        if (activeVote?.id !== v.id) setHasVoted(false);
      } else if (v.status === 'CLOSED') {
        setActiveVote((prev: any) => prev ? { ...prev, ...v, status: 'CLOSED' } : v);
        if (v.results) setVoteResults(v.results);
      }
    }
  });

  // Initialize: extract token from URL path and load event
  useEffect(() => {
    const eventToken = window.location.pathname.startsWith('/join/') 
      ? window.location.pathname.split('/join/')[1] 
      : localStorage.getItem('eventToken');

    try {
      // [PWA Start URL Fix] 
      // If we're at the root, check if we're in standalone mode and have a saved path
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      const savedPwaPath = localStorage.getItem('pwa_start_path');
      
      if (window.location.pathname === '/' && isStandalone && savedPwaPath && savedPwaPath !== '/') {
        console.log('[PWA] Redirecting to last saved path:', savedPwaPath);
        window.location.replace(savedPwaPath);
        return;
      }
    } catch (e) {
      console.error('[PWA] Redirect logic error:', e);
    }

    // Save current path for next PWA launch (if it's a join or admin path)
    if (window.location.pathname.startsWith('/join/') || window.location.pathname === '/admin') {
      localStorage.setItem('pwa_start_path', window.location.pathname);
    }

    // Check Push Permission
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        setShowPushPrompt(true);
      } else if (Notification.permission === 'granted') {
        onForegroundMessage();
      }
    }

    if (eventToken) {
      setToken(eventToken);
      // Load announcement history from localStorage
      const savedHistory = localStorage.getItem(`announcements_${eventToken}`);
      if (savedHistory) {
        try {
          setAnnouncementHistory(JSON.parse(savedHistory));
        } catch (e) {
          console.error('Failed to load announcement history', e);
        }
      }
      // Try Cloud Function to validate token and load event data
      fetch('/api/v2/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: eventToken, passcode: '' }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.event) {
            setEvent(data.event);
            if (!data.event.passcode) {
              setIsLoggedIn(true);
            }
          } else if (!data.success && data.message === 'Invalid passcode') {
            // Event exists but requires passcode → show login screen
            setEvent({ token: eventToken, name: '행사', passcode: true });
          } else {
            setError('행사를 찾을 수 없습니다.');
          }
        })
        .catch(err => {
          console.error('Failed to load event:', err);
          setError('서버와 통신할 수 없습니다.');
        });
    }
  }, []);

  const handleLogin = async (passcode: string) => {
    try {
      const res = await fetch('/api/v2/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, passcode }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setIsLoggedIn(true);
          setEvent(data.event);
          return;
        }
      }
      setLoginError('암호가 올바르지 않습니다.');
    } catch (e) {
      console.error('Login failed:', e);
      setLoginError('서버 연결 오류가 발생했습니다.');
    }
  };

  const castVote = async (optionId: number) => {
    if (!activeVote || hasVoted) return;
    try {
      const res = await fetch('/api/v2/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token, 
          voteId: activeVote.id, 
          choices: [optionId], 
          delegateId: voterId 
        }),
      });

      if (res.ok) {
        setHasVoted(true);
      } else {
        const data = await res.json();
        alert(data.message || '투표 처리 중 오류가 발생했습니다.');
      }
    } catch (e) {
      console.error('Vote failed:', e);
      alert('서버와 통신할 수 없습니다.');
    }
  };

  const handleEnablePush = async () => {
    if (!event?.id) return;
    const success = await requestPushPermission(event.id, voterId);
    if (success) {
      alert("푸시 알림이 성공적으로 설정되었습니다.");
      onForegroundMessage();
    } else {
      alert("알림 권한을 허용하지 않으셨거나 기기에서 지원하지 않습니다.");
    }
    setShowPushPrompt(false);
  };

  if (!token) return (
    <div className="landing-container">
      <div className="card">
        <h1>디지털 총회</h1>
        <p>전용 QR 코드 또는 공유 링크를 통해 접속해 주세요.</p>
        <button onClick={() => window.location.href = '/admin'} className="btn-admin">관리자 센터</button>
      </div>
      <style>{`
        .landing-container { display: flex; align-items: center; justify-content: center; height: 100vh; background: #f1f5f9; }
        .card { background: #ffffff; padding: 40px; border-radius: 20px; border: 2px solid #334155; box-shadow: 0 10px 30px rgba(0,0,0,0.1); text-align: center; }
        .btn-admin { margin-top: 20px; background: #1e3a8a; color: #ffffff; border: none; padding: 12px 24px; border-radius: 12px; cursor: pointer; font-weight: bold; }
      `}</style>
    </div>
  );

  if (!event) return (
    <div className="loading-container">
      {error ? (
        <div className="error-box">
          <h3>⚠️ 오류가 발생했습니다</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>다시 시도</button>
        </div>
      ) : (
        <>
          <div className="loader"></div>
          <p>행사 정보를 확인하는 중...</p>
        </>
      )}
    </div>
  );

  if (!isLoggedIn && event.passcode) {
    return <EventLogin eventName={event.name} onLogin={handleLogin} error={loginError} />;
  }

  return (
    <div className="app">
      <PWAInstallGuide />
      <header className="header" style={{ background: '#ffffff', border: '3px solid #0f172a', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h1 style={{ color: '#0f172a', fontWeight: '800' }}>{event.name}</h1>
        <div className="connection-badge" style={{ background: '#f1f5f9', border: '2px solid #0f172a', color: '#047857' }}>
          <span className="dot pulse" style={{ background: '#047857' }}></span>
          REAL-TIME
        </div>
      </header>
      <main className="container">
        {announcement && (
          <div className="announcement-overlay">
            <div className="announcement-content">
              <span className="announcement-icon">📢</span>
              <div className="announcement-text">{announcement}</div>
              <button className="btn-close-announcement" onClick={() => setAnnouncement(null)}>닫기</button>
            </div>
          </div>
        )}

        {showPushPrompt && (
          <div className="push-prompt-banner" style={{ background: '#e0f2fe', border: '2px solid #0284c7', borderRadius: '12px', padding: '15px', color: '#0c4a6e', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1, marginRight: '10px' }}>
              <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>🔔 알림 수신 설정</strong>
              <span style={{ fontSize: '0.85rem' }}>앱을 닫아도 중요 공지와 투표 알림을 받을 수 있습니다. (아이폰은 꼭 홈 화면에 추가 후 설정해주세요)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={handleEnablePush} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>알림 켜기</button>
              <button onClick={() => setShowPushPrompt(false)} style={{ background: 'transparent', color: '#0369a1', border: 'none', padding: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>나중에</button>
            </div>
          </div>
        )}

        {showPushPrompt && (
          <div className="push-prompt-banner" style={{ background: '#e0f2fe', border: '2px solid #0284c7', borderRadius: '12px', padding: '15px', color: '#0c4a6e', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1, marginRight: '10px' }}>
              <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>🔔 알림 수신 설정</strong>
              <span style={{ fontSize: '0.85rem' }}>앱을 닫아도 중요 공지와 투표 알림을 받을 수 있습니다. (아이폰은 애플 보안정책상 꼭 하단 '홈 화면에 추가' 후 설정해야 합니다)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={handleEnablePush} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>알림 켜기</button>
              <button onClick={() => setShowPushPrompt(false)} style={{ background: 'transparent', color: '#0369a1', border: 'none', padding: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>나중에</button>
            </div>
          </div>
        )}

        {false && (
          <div className="connection-error-banner">
            <div className="error-content">
              <span className="error-icon">⚠️</span>
              <div className="error-text">
                <strong>실시간 연결 끊김!</strong> 
                호스트가 서버를 재시작했을 수 있습니다. 대의원 페이지를 새로고침하거나 새로운 접속 주소를 확인해 주세요.
              </div>
              <button className="btn-retry" onClick={() => window.location.reload()}>새로고침</button>
            </div>
          </div>
        )}

        {/* Notification when NOT on vote tab */}
        {activeVote?.status === 'OPEN' && activeTab !== 'vote' && (
          <div 
            className="agenda-info-banner is-live"
            onClick={() => setActiveTab('vote')}
          >
            <div className="card-info">
              <div className="live-vote-ticker">
                <span className="dot"></span>
                <span>현재 투표 진행 중: <b>{activeVote.question}</b></span>
                <button className="btn-go-vote-mini">참여하기</button>
              </div>
            </div>
          </div>
        )}

        {/* Regular announcement when NO active vote or on vote tab */}
        {(activeVote?.status !== 'OPEN' || activeTab === 'vote') && (
          <div className="agenda-info-banner">
            <div className="card-info">
              <div className="announcement-ticker">
                🕒 현재 진행: {announcement || '회의가 시작되길 기다리는 중입니다.'}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'agenda' && (
          <section className="content-list">
            {displayLinks.length > 0 && (
              <div className="link-section">
                <h3>외부 링크 (설문/영상)</h3>
                {displayLinks.map((link: any) => (
                  <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="link-card" style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}>
                    <span className="icon">🔗</span>
                    <div className="link-info">
                      <div className="title">{link.title}</div>
                      <div className="url-hint">
                        {(() => {
                          try { return new URL(link.url).hostname; } 
                          catch { return link.url; }
                        })()}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}

            <h3>참여 문서 (PDF)</h3>
            {displayFiles.map((file: any, index: number) => (
              <div key={file.id} className="file-card">
                <div className="file-info">
                  <div className="title">
                    {file.title}
                    {index === 0 && <span className="badge-new">NEW</span>}
                  </div>
                  <div className="meta">
                    PDF · {file.file_size} · {new Date(file.published_at).toLocaleTimeString()} 공개
                  </div>
                </div>
                <button className="btn-view" onClick={() => setViewerUrl(file.url)}>
                  열람
                </button>
              </div>
            ))}

            {displayFiles.length === 0 && displayLinks.length === 0 && (
              <div className="empty-state">
                공개된 문서가 없습니다. 잠시만 기다려주세요.
              </div>
            )}
          </section>
        )}

        {activeTab === 'vote' && (
          <section className="vote-tab-content">
            {!activeVote ? (
              <div className="empty-vote">
                <div className="icon">🗳️</div>
                <h3>진행 중인 투표가 없습니다</h3>
                <p>투표가 시작되면 알림을 보내드립니다.</p>
              </div>
            ) : activeVote.status === 'OPEN' ? (
              <div className="active-vote-screen">
                <span className="badge-live">LIVE</span>
                <h2>{activeVote.question}</h2>
                <p>의견을 선택하여 투표해 주세요.</p>
                
                {!hasVoted ? (
                  <div className="vote-options">
                    {activeVote.options?.map((opt: any) => (
                      <button key={opt.id} className="btn-option large" onClick={() => castVote(opt.id)}>
                        {opt.text}
                      </button>
                    ))}
                    {activeVote.options?.length === 0 && activeVote.type === 'YN' && (
                      <div className="error-hint">투표 옵션을 불러오지 못했습니다. 새로고침해 주세요.</div>
                    )}
                  </div>
                ) : (
                  <div className="voted-confirmation">
                    <div className="check-icon">✓</div>
                    <h3>투표가 완료되었습니다</h3>
                    <p>소중한 의견이 기록되었습니다.</p>
                    <div className="vote-stats-mini">
                      현재 참여 인원: {activeVote.voted_count || 1}명
                    </div>
                  </div>
                )}
              </div>
            ) : activeVote.status === 'CLOSED' ? (
              <div className="vote-closed-screen">
                <h3>투표가 종료되었습니다</h3>
                <p>결과 발표를 기다려 주세요.</p>
                {voteResults && (
                  <div className="results-display card">
                    <h4>최종 결과</h4>
                    {voteResults.map((res: any) => (
                      <div key={res.id} className="result-item">
                        <div className="result-info">
                          <span>{res.text}</span>
                          <span>{res.count}표 ({res.percentage}%)</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${res.percentage}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        )}

        {activeTab === 'schedule' && (
          <div className="empty-state">준비 중인 화면입니다.</div>
        )}

        {activeTab === 'info' && (
          <section className="info-tab-content">
            <h3>📢 공지사항 보관함</h3>
            <p className="tab-desc">수신된 공지사항 기록입니다.</p>
            
            <div className="announcement-list">
              {announcementHistory.length > 0 ? (
                announcementHistory.map((item) => (
                  <div key={item.id} className="announcement-item-card" onClick={() => setSelectedAnnouncement(item)}>
                    <div className="item-header">
                      <span className="item-icon">📢</span>
                      <span className="item-time">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="item-body">
                      {item.message.length > 40 ? item.message.substring(0, 40) + '...' : item.message}
                    </div>
                    <div className="item-footer">더보기 〉</div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <div className="icon">📭</div>
                  <p>아직 수신된 공지사항이 없습니다.</p>
                </div>
              )}
            </div>

            {/* Announcement Detail Overlay */}
            {selectedAnnouncement && (
              <div className="detail-overlay" onClick={() => setSelectedAnnouncement(null)}>
                <div className="detail-card" onClick={(e) => e.stopPropagation()}>
                  <div className="detail-header">
                    <h3>공지사항 상세</h3>
                    <button className="btn-close" onClick={() => setSelectedAnnouncement(null)}>×</button>
                  </div>
                  <div className="detail-body">
                    <div className="detail-time">발신 시간: {new Date(selectedAnnouncement.timestamp).toLocaleString()}</div>
                    <div className="detail-message">{selectedAnnouncement.message}</div>
                  </div>
                  <button className="btn-confirm" onClick={() => setSelectedAnnouncement(null)}>확인</button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Voting Notification Popup (when not on vote tab) */}
        {activeVote?.status === 'OPEN' && !hasVoted && activeTab !== 'vote' && (
          <div className="voting-notification-overlay">
            <div className="notification-card">
              <span className="badge-live">LIVE</span>
              <h3>현재 투표 중</h3>
              <p>{activeVote.question}</p>
              <button className="btn-jump-vote" onClick={() => setActiveTab('vote')}>
                투표하기 참여
              </button>
              <button className="btn-dismiss" onClick={(e) => { e.stopPropagation(); /* hide logic if needed */ }}>
                나중에
              </button>
            </div>
          </div>
        )}

        {/* Results Notification Popup */}
        {voteResults && activeTab !== 'vote' && (
          <div className="results-notification-overlay">
            <div className="notification-card results">
              <span className="badge-results">결과 발표</span>
              <h3>{activeVote?.question || '투표 결과'}</h3>
              <p>투표 결과가 발표되었습니다.</p>
              <button className="btn-jump-vote" onClick={() => setActiveTab('vote')}>
                결과 확인하기
              </button>
            </div>
          </div>
        )}

        {/* Integrated PDF Viewer Overlay */}
        {viewerUrl && (
          <div className="pdf-viewer-overlay" onClick={() => setViewerUrl(null)}>
            <div className="pdf-viewer-container" onClick={(e) => e.stopPropagation()}>
              <div className="pdf-viewer-header">
                <h3>문서 열람</h3>
                <button className="btn-close-viewer" onClick={() => setViewerUrl(null)}>닫기</button>
              </div>
              <div className="pdf-viewer-body">
                <iframe 
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(viewerUrl)}&embedded=true`}
                  title="PDF Viewer" 
                  width="100%" 
                  height="100%"
                  style={{ border: 'none' }}
                />
              </div>
              <div className="pdf-viewer-footer">
                <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                  화면이 잘 보이지 않으면 아래 버튼을 눌러 원본을 다운로드/확인하세요.
                </p>
                <button className="btn-full-screen" onClick={() => window.open(viewerUrl, '_blank')}>
                  브라우저(원본)로 보기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hidden Pre-fetch Buffer */}
        {prefetchUrl && (
          <iframe src={prefetchUrl} style={{ display: 'none' }} title="prefetch-buffer" />
        )}

      </main>

      <nav className="bottom-nav">
        <div className={`nav-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')}>
          <span className="nav-icon">📋</span>
          <span>안건지</span>
        </div>
        <div className={`nav-item ${activeTab === 'vote' ? 'active' : ''} ${activeVote?.status === 'OPEN' ? 'focus' : ''}`} onClick={() => setActiveTab('vote')}>
          <span className="nav-icon">🗳️</span>
          <span>투표</span>
        </div>
        <div className={`nav-item ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
          <span className="nav-icon">📅</span>
          <span>일정</span>
        </div>
        <div className={`nav-item ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
          <span className="nav-icon">👤</span>
          <span>정보</span>
        </div>
      </nav>

      <style>{`
        /* Design Resets & Overrides */
        :root { 
          /* Absolute Contrast Theme: Explicit hex colors only for UI resilience */
        }
        
        .app { min-height: 100vh; min-height: -webkit-fill-available; background: #f8fafc; color: #0f172a; padding-bottom: calc(90px + env(safe-area-inset-bottom)); }
        
        .header { 
          position: sticky; top: 12px; left: 12px; right: 12px; margin: 12px; 
          padding: 16px 24px; border-radius: 20px; z-index: 100;
          display: flex; justify-content: space-between; align-items: center;
          background: #ffffff !important; opacity: 1 !important; border: 3px solid #0f172a !important;
          box-shadow: 0 10px 30px rgba(15,23,42,0.15) !important;
          animation: slideDown 0.6s ease-out;
        }
        @keyframes slideDown { from { transform: translateY(-50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        
        .header h1 { font-size: 1.15rem; margin: 0; font-family: 'Outfit', sans-serif; color: #0f172a; }
        .connection-badge { 
          background: #f1f5f9; padding: 6px 14px; border-radius: 30px; 
          font-size: 0.7rem; font-weight: 800; display: flex; align-items: center; gap: 8px; color: #047857;
          border: 2px solid #0f172a; letter-spacing: 0.5px;
        }
        .dot { width: 8px; height: 8px; background: #047857; border-radius: 50%; }
        .pulse { animation: pulseAnim 2s infinite; }
        @keyframes pulseAnim { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }

        .container { padding: 90px 20px 20px; max-width: 600px; margin: 0 auto; }

        .announcement-overlay {
          background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: #ffffff; border-radius: 20px;
          padding: 24px; margin-bottom: 25px; display: flex; position: relative;
          box-shadow: 0 15px 35px rgba(30, 58, 138, 0.25); animation: fadeInUp 0.5s ease-out;
        }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .announcement-icon { font-size: 1.5rem; margin-right: 15px; }
        .announcement-text { flex: 1; font-weight: 600; font-size: 1.05rem; line-height: 1.5; }
        .btn-close-announcement { background: rgba(255,255,255,0.2); border: none; color: #ffffff; padding: 6px 14px; border-radius: 12px; font-size: 0.75rem; cursor: pointer; font-weight: 700; transition: 0.2s; }
        .btn-close-announcement:hover { background: rgba(255,255,255,0.3); }

        .agenda-info-banner { 
          background: #ffffff; border-radius: 20px; padding: 25px; margin-bottom: 25px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 2px solid #334155;
          transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); cursor: pointer;
        }
        .agenda-info-banner:active { transform: scale(0.97); }
        .agenda-info-banner.is-live { 
          background: #1e3a8a; 
          border: 2px solid #0f172a;
        }
        .live-vote-ticker { display: flex; flex-direction: column; gap: 12px; color: #ffffff; font-weight: 800; text-align: center; }
        .btn-go-vote-mini { 
          background: #ffffff; color: #1e3a8a; border: none; padding: 12px 20px; border-radius: 14px; 
          font-weight: 800; margin-top: 10px; font-size: 0.9rem; letter-spacing: -0.5px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); cursor: pointer;
        }

        .link-card, .file-card { 
          background: #ffffff; padding: 20px 24px; border-radius: 20px; margin-bottom: 15px;
          display: flex; align-items: center; border: 2px solid #334155; box-shadow: 0 4px 15px rgba(0,0,0,0.05);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer;
        }
        .link-card:active, .file-card:active { transform: scale(0.97); background: #f1f5f9; }
        .link-info, .file-info { flex: 1; }
        .title { font-weight: 700; font-size: 1.05rem; color: #0f172a; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
        .meta, .url-hint { font-size: 0.8rem; color: #475569; font-weight: 600; }
        .btn-view { 
          background: #1e3a8a; color: #ffffff; border: none; padding: 10px 20px; border-radius: 14px; 
          font-weight: 800; font-size: 0.9rem; box-shadow: 0 4px 10px rgba(30, 58, 138, 0.15); cursor: pointer;
        }
        .badge-new { 
          background: #2563eb; color: #ffffff; font-size: 9px; font-weight: 800; 
          padding: 2px 8px; border-radius: 6px; text-transform: uppercase; border: 1px solid #1e3a8a;
        }

        .bottom-nav { 
          position: fixed; bottom: 0; left: 0; right: 0;
          background: #ffffff; height: 85px; 
          display: flex; justify-content: space-around; align-items: center;
          border-top: 2px solid #334155; box-shadow: 0 -10px 40px rgba(0,0,0,0.1);
          border-top-left-radius: 28px; border-top-right-radius: 28px; z-index: 1000;
          padding: 0 10px calc(10px + env(safe-area-inset-bottom));
        }
        .nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; position: relative; opacity: 0.6; transition: all 0.3s; height: 100%; border-radius: 20px; color: #475569; }
        .nav-item.active { opacity: 1; color: #1e3a8a; font-weight: 900; }
        .nav-item.active .nav-icon { transform: translateY(-4px); }
        .nav-icon { font-size: 1.5rem; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .nav-item span:last-child { font-size: 0.75rem; font-weight: 800; }
        .nav-item.focus::after { content: ''; position: absolute; top: 10px; right: 25%; width: 10px; height: 10px; background: #be123c; border-radius: 50%; border: 2px solid #ffffff; animation: pulseAnim 1.5s infinite; }

        /* Overlays & Modals */
        .detail-overlay, .voting-notification-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(12px);
          z-index: 2000; display: flex; align-items: flex-end; justify-content: center;
        }
        .detail-card, .notification-card {
          width: 100%; max-width: 500px; background: #ffffff; border-radius: 32px 32px 0 0; 
          overflow: hidden; box-shadow: 0 -10px 50px rgba(0, 0, 0, 0.2); border: 2px solid #334155; border-bottom: none;
          animation: slideUpModal 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.15);
        }
        @keyframes slideUpModal { from { transform: translateY(100%); } to { transform: translateY(0); } }
        
        .notification-card { padding: 40px 30px; text-align: center; border-radius: 32px; margin: 20px; width: calc(100% - 40px); border: 2px solid #334155; }

        /* Fullscreen PDF Viewer */
        .pdf-viewer-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: #0f172a; z-index: 3000; 
          display: flex; flex-direction: column;
          animation: slideUpModal 0.3s ease-out;
        }
        .pdf-viewer-container {
          flex: 1; display: flex; flex-direction: column; height: 100%; width: 100%; max-width: 800px; margin: 0 auto;
        }
        .pdf-viewer-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 20px; background: #0f172a; color: #ffffff; border-bottom: 2px solid #334155;
        }
        .pdf-viewer-header h3 { margin: 0; font-size: 1.2rem; font-weight: 800; }
        .btn-close-viewer { background: rgba(255,255,255,0.2); border: none; color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .pdf-viewer-body {
          flex: 1; width: 100%; min-height: 0; background: #e2e8f0;
          -webkit-overflow-scrolling: touch;
        }
        .pdf-viewer-footer {
          padding: 16px 20px; background: #ffffff; text-align: center; border-top: 2px solid #334155;
        }
        .btn-full-screen {
          background: #1e3a8a; color: white; border: none; padding: 14px 24px; border-radius: 12px; cursor: pointer; font-weight: 800; font-size: 1.05rem; width: 100%; max-width: 400px; box-shadow: 0 4px 12px rgba(30,58,138,0.2);
        }

        .vote-tab-content { height: calc(100vh - 220px); justify-content: center; display: flex; flex-direction: column; text-align: center; padding: 20px; }
        .btn-option.large { 
          width: 100%; border-radius: 20px; padding: 24px; margin: 10px 0; font-size: 1.2rem; font-weight: 800;
          background: #ffffff; border: 2px solid #334155; color: #0f172a; transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(0,0,0,0.05); cursor: pointer;
        }
        .btn-option.large:active, .btn-option.large:hover { border-color: #1e3a8a; background: #f1f5f9; transform: scale(0.98); }

        .loader { border: 4px solid #f1f5f9; border-top: 4px solid #1e3a8a; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 25px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default App;
