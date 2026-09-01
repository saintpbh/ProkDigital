import { useState, useEffect, useRef } from 'react';
import { useFirebaseSync } from './hooks/useFirebaseSync';
import { EventLogin } from './components/EventLogin';
import { PWAInstallGuide } from './components/PWAInstallGuide';
import { haptic } from './utils/haptic';
import { APP_VERSION, forceUpdateApp } from './utils/appUpdate';
import './styles/global.css';
import './styles/components.css';
import './styles/attendee.css';
import { requestPushPermission, onForegroundMessage } from './services/messagingService';
import { firebaseService } from './services/firebaseService';

type TabType = 'agenda' | 'schedule' | 'announcements';

function App() {
  const [event, setEvent] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState('');
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const pathToken = window.location.pathname.startsWith('/join/') 
      ? window.location.pathname.split('/join/')[1] 
      : null;
    return pathToken || localStorage.getItem('eventToken') || null;
  });
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('agenda');
  const [selectedDayTab, setSelectedDayTab] = useState<string>('ALL');
  const [announcementHistory, setAnnouncementHistory] = useState<{ id: string, message: string, timestamp: string }[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [prefetchUrl, setPrefetchUrl] = useState<string | null>(null);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(() => {
    return Number(localStorage.getItem('last_read_announcement_ts') || 0);
  });

  const [voterId] = useState(() => {
    let id = localStorage.getItem('voterId');
    if (!id) {
      id = Math.random().toString(36).substring(2, 11);
      localStorage.setItem('voterId', id);
    }
    return id;
  });

  const authenticatedPasscodeRef = useRef<string | null>(null);
  const sessionVersionRef = useRef<number>(0);
  const isLoggedInRef = useRef<boolean>(false);

  // Firebase Sync (Primary and only data source)
  const { 
    files: displayFiles, 
    links: displayLinks,
    schedules: displaySchedules
  } = useFirebaseSync(token, {
    onAnnouncement: (msg: string) => {
      const cleanMsg = msg ? msg.replace(/[📢📣]/g, '').trim() : '';
      setAnnouncement(cleanMsg);
      if (cleanMsg) {
        // Haptic feedback on incoming announcement
        haptic.notification();
        const newAnnouncement = {
          id: Date.now().toString(),
          message: cleanMsg,
          timestamp: new Date().toISOString()
        };
        setAnnouncementHistory(prev => {
          const updated = [newAnnouncement, ...prev.filter(p => p.message !== cleanMsg)];
          const currentToken = window.location.pathname.startsWith('/join/') 
            ? window.location.pathname.split('/join/')[1] 
            : localStorage.getItem('eventToken');
          if (currentToken) localStorage.setItem(`announcements_${currentToken}`, JSON.stringify(updated));
          return updated;
        });
      }
    },
    onEventUpdate: (updatedEvent: any) => {
      if (!updatedEvent) return;
      setEvent((prev: any) => ({ ...prev, ...updatedEvent }));
      
      const serverPasscode = updatedEvent.passcode ? String(updatedEvent.passcode) : '';
      const serverSessionVersion = updatedEvent.session_version ? Number(updatedEvent.session_version) : 0;
      
      if (updatedEvent.token) {
        setToken(updatedEvent.token);
        localStorage.setItem('eventToken', updatedEvent.token);
      }

      // Remote logout detection
      if (isLoggedInRef.current) {
        let shouldLogout = false;

        if (serverPasscode && authenticatedPasscodeRef.current !== serverPasscode) {
          shouldLogout = true;
        }

        if (serverSessionVersion > 0 && sessionVersionRef.current < serverSessionVersion) {
          shouldLogout = true;
        }

        if (shouldLogout) {
          console.warn('[Security] 🚨 Forcing immediate remote logout.');
          haptic.warning();
          setIsLoggedIn(false);
          isLoggedInRef.current = false;
          authenticatedPasscodeRef.current = null;
          sessionVersionRef.current = 0;
          setLoginError('접속 비밀번호가 변경되었거나 관리자에 의해 원격 로그아웃되었습니다. 새 비밀번호로 다시 로그인해 주세요.');
        }
      }
    },
    onNewFilePublished: (url: string) => {
      console.log('[Firebase] 📄 New document shared! Triggering prominent long haptic feedback.');
      // Distinct long haptic pattern to definitely catch attendee's attention
      haptic.newDocument();
      setPrefetchUrl(url);
      setTimeout(() => setPrefetchUrl(null), 10000);
    }
  });

  // Initialize
  useEffect(() => {
    const pathToken = window.location.pathname.startsWith('/join/') 
      ? window.location.pathname.split('/join/')[1] 
      : null;
    
    const eventToken = pathToken || localStorage.getItem('eventToken') || null;

    try {
      if (window.location.pathname.startsWith('/join/') || window.location.pathname === '/admin') {
        localStorage.setItem('pwa_start_path', window.location.pathname);
      }
    } catch (e) {
      console.error('[PWA] Path save error:', e);
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
      const savedHistory = localStorage.getItem(`announcements_${eventToken}`);
      if (savedHistory) {
        try {
          setAnnouncementHistory(JSON.parse(savedHistory));
        } catch (e) {
          console.error('Failed to load announcement history', e);
        }
      }
    }

    fetch('/api/v2/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: eventToken, passcode: '' }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.event) {
          setEvent(data.event);
          if (data.event.token) {
            setToken(data.event.token);
            localStorage.setItem('eventToken', data.event.token);
          }
          if (!data.event.passcode) {
            setIsLoggedIn(true);
            isLoggedInRef.current = true;
            authenticatedPasscodeRef.current = '';
            sessionVersionRef.current = data.event.session_version ? Number(data.event.session_version) : Date.now();
          }
        } else {
          setError(data.message || '행사 정보를 불러올 수 없습니다.');
        }
      })
      .catch(err => {
        console.error('Initial fetch failed:', err);
        setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      });
  }, []);

  // Live Presence Heartbeat & Attendee Registration Sync
  useEffect(() => {
    if (!event?.id) return;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone || false;
    
    // 1. If logged in, record attendee registration in Firestore
    if (isLoggedIn) {
      firebaseService.recordAttendeeLogin(event.id, voterId, isStandalone);
    }

    // 2. Send live presence heartbeat immediately and periodically
    firebaseService.sendPresenceHeartbeat(event.id, voterId, isStandalone, isLoggedIn);
    const heartbeatTimer = setInterval(() => {
      firebaseService.sendPresenceHeartbeat(event.id, voterId, isStandalone, isLoggedIn);
    }, 25000);

    return () => clearInterval(heartbeatTimer);
  }, [event?.id, isLoggedIn, voterId]);

  const handleLogin = async (passcode: string) => {
    haptic.button();
    setLoginError('');
    try {
      const res = await fetch('/api/v2/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, passcode }),
      });
      const data = await res.json();
      if (data.success && data.event) {
        haptic.success();
        setEvent(data.event);
        setIsLoggedIn(true);
        isLoggedInRef.current = true;
        authenticatedPasscodeRef.current = passcode;
        sessionVersionRef.current = data.event.session_version ? Number(data.event.session_version) : Date.now();
        if (data.event.token) {
          setToken(data.event.token);
          localStorage.setItem('eventToken', data.event.token);
        }
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone || false;
        firebaseService.recordAttendeeLogin(data.event.id, voterId, isStandalone);
        firebaseService.sendPresenceHeartbeat(data.event.id, voterId, isStandalone, true);
      } else {
        haptic.warning();
        setLoginError('접속 비밀번호가 올바르지 않습니다.');
      }
    } catch (e) {
      haptic.warning();
      setLoginError('서버 연결 실패');
    }
  };

  const handleTabChange = (tab: TabType) => {
    haptic.tab();
    setActiveTab(tab);
    if (tab === 'announcements') {
      const now = Date.now();
      setLastReadTimestamp(now);
      localStorage.setItem('last_read_announcement_ts', String(now));
    }
  };

  const handleEnablePush = async () => {
    haptic.button();
    if (!event?.id) return;
    const success = await requestPushPermission(event.id, voterId);
    if (success) {
      haptic.success();
      alert("푸시 알림이 성공적으로 설정되었습니다.");
      onForegroundMessage();
    } else {
      haptic.warning();
      alert("알림을 설정할 수 없습니다.\n\n[확인 사항]\n1. 아이폰: iOS 16.4 이상입니까?\n2. 홈 화면: '홈 화면에 추가'를 통해 설치한 앱으로 접속하셨습니까?\n3. 차단: 브라우저 설정에서 알림이 차단되어 있지는 않습니까?");
    }
    setShowPushPrompt(false);
  };

  // Force Update Handler
  const handleForceUpdate = async () => {
    haptic.button();
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await forceUpdateApp();
    } catch (e) {
      console.error(e);
      window.location.reload();
    }
  };

  // Calculate unread announcements count
  const unreadCount = announcementHistory.filter(
    a => new Date(a.timestamp).getTime() > lastReadTimestamp
  ).length;

  // Extract unique schedule days for tabs
  const uniqueDays: string[] = Array.from(
    new Set(displaySchedules.map((s: any) => s.day).filter(Boolean))
  );

  const filteredSchedules = selectedDayTab === 'ALL'
    ? displaySchedules
    : displaySchedules.filter((s: any) => s.day === selectedDayTab);

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
    return (
      <>
        <PWAInstallGuide />
        <EventLogin eventName={event.name} onLogin={handleLogin} error={loginError} />
      </>
    );
  }

  return (
    <div className="app">
      <PWAInstallGuide />
      
      {/* Header with Safe Area Spacing & App Info Button */}
      <header className="header">
        <div className="header-brand-wrap">
          <img src="/prok-logo.png" alt="기장 로고" className="header-logo-img" />
          <h1>{event.name}</h1>
        </div>
        <div className="header-actions">
          <div className="connection-badge">
            <span className="dot pulse"></span>
            REAL-TIME
          </div>
          <button 
            className="btn-app-info" 
            onClick={() => {
              haptic.modal();
              setIsInfoModalOpen(true);
            }} 
            title="앱 정보 및 강제 업데이트"
          >
            ℹ️
          </button>
        </div>
      </header>

      <main className="container">
        {/* Real-time Announcement Popup Banner */}
        {announcement && (
          <div className="announcement-overlay">
            <div className="announcement-content">
              <div className="announcement-text">{announcement}</div>
              <button 
                className="btn-close-announcement" 
                onClick={() => {
                  haptic.button();
                  setAnnouncement(null);
                }}
              >
                닫기
              </button>
            </div>
          </div>
        )}

        {/* Push Notification Setup Banner */}
        {showPushPrompt && (
          <div className="push-prompt-banner">
            <div className="push-prompt-text">
              <strong>🔔 알림 수신 설정</strong>
              <span>앱을 닫아도 중요 공지와 실시간 알림을 받을 수 있습니다. (아이폰은 꼭 홈 화면에 추가 후 설정해주세요)</span>
            </div>
            <div className="push-prompt-actions">
              <button className="btn-push-enable" onClick={handleEnablePush}>알림 켜기</button>
              <button className="btn-push-dismiss" onClick={() => { haptic.button(); setShowPushPrompt(false); }}>나중에</button>
            </div>
          </div>
        )}


        {/* 📑 TAB 1: 문서 (공유 문서, 링크, 설문) */}
        {activeTab === 'agenda' && (
          <section className="content-list">
            {displayLinks.length > 0 && (
              <div className="link-section">
                <h3>외부 링크 (설문/영상)</h3>
                {displayLinks.map((link: any) => (
                  <a 
                    key={link.id} 
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="link-card"
                    onClick={() => haptic.button()}
                  >
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

            <h3>공유 문서 (PDF)</h3>
            {displayFiles.map((file: any, index: number) => (
              <div key={file.id} className="file-card">
                <div className="file-info">
                  <div className="title">
                    {file.title}
                    {index === 0 && <span className="badge-new">NEW</span>}
                  </div>
                  <div className="meta">
                    PDF · {file.file_size || ''} · {new Date(file.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 공개
                  </div>
                </div>
                <button 
                  className="btn-view" 
                  onClick={() => {
                    haptic.viewDocument();
                    setViewerUrl(file.url);
                  }}
                >
                  열람
                </button>
              </div>
            ))}

            {displayFiles.length === 0 && displayLinks.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📂</div>
                <p>공개된 문서가 없습니다. 잠시만 기다려주세요.</p>
              </div>
            )}
          </section>
        )}

        {/* 📅 TAB 2: 일정 (총회 스케줄 타임라인) */}
        {activeTab === 'schedule' && (
          <section className="schedule-tab-content">
            <div className="schedule-header-row">
              <h3>📅 총회 회무 일정</h3>
              <p className="tab-desc">실시간 진행 일정을 확인하세요.</p>
            </div>

            {/* Day Selector Tabs */}
            {uniqueDays.length > 1 && (
              <div className="schedule-day-tabs">
                <button 
                  className={`day-tab-btn ${selectedDayTab === 'ALL' ? 'active' : ''}`}
                  onClick={() => { haptic.tab(); setSelectedDayTab('ALL'); }}
                >
                  전체
                </button>
                {uniqueDays.map((day) => (
                  <button
                    key={day}
                    className={`day-tab-btn ${selectedDayTab === day ? 'active' : ''}`}
                    onClick={() => { haptic.tab(); setSelectedDayTab(day); }}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}

            {/* Timeline List */}
            <div className="schedule-timeline">
              {filteredSchedules.map((item: any) => (
                <div 
                  key={item.id} 
                  className={`schedule-card ${item.is_current ? 'is-live-current' : ''}`}
                >
                  {item.is_current && (
                    <div className="live-now-badge">
                      <span className="dot pulse"></span>
                      NOW 진행 중
                    </div>
                  )}
                  <div className="schedule-card-header">
                    <span className="schedule-day-tag">{item.day}</span>
                    <span className="schedule-time">🕒 {item.time || '시간 미정'}</span>
                    {item.location && <span className="schedule-loc">📍 {item.location}</span>}
                  </div>
                  <div className="schedule-card-title">{item.title}</div>
                  {item.description && (
                    <div className="schedule-card-desc">{item.description}</div>
                  )}
                </div>
              ))}

              {filteredSchedules.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">📅</div>
                  <p>등록된 일정이 없습니다. 총회 일정이 등록되면 실시간으로 표시됩니다.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 🔔 TAB 3: 알림 및 앱 정보 */}
        {activeTab === 'announcements' && (
          <section className="info-tab-content">
            <div className="announcement-header-row">
              <h3>🔔 알림 및 공지사항</h3>
              <p className="tab-desc">수신된 공지사항 기록입니다 (최신순).</p>
            </div>
            
            <div className="announcement-list">
              {announcementHistory.length > 0 ? (
                announcementHistory.map((item) => (
                  <div 
                    key={item.id} 
                    className="announcement-item-card" 
                    onClick={() => {
                      haptic.modal();
                      setSelectedAnnouncement(item);
                    }}
                  >
                    <div className="item-header">
                      <span className="item-time">
                        {new Date(item.timestamp).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}{' '}
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="item-body">
                      {item.message.length > 45 ? item.message.substring(0, 45) + '...' : item.message}
                    </div>
                    <div className="item-footer">자세히 보기 〉</div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <p>아직 수신된 공지사항이 없습니다.</p>
                </div>
              )}
            </div>

            {/* ℹ️ App Info & Force Update Card */}
            <div className="app-info-card">
              <div className="info-card-header">
                <div className="info-card-title">
                  <span className="info-icon">ℹ️</span>
                  <div>
                    <h4>앱 정보 및 업데이트</h4>
                    <span className="version-tag">{APP_VERSION}</span>
                  </div>
                </div>
                <button 
                  className={`btn-force-update ${isUpdating ? 'is-loading' : ''}`}
                  disabled={isUpdating}
                  onClick={handleForceUpdate}
                >
                  {isUpdating ? '⏳ 갱신 중...' : '⚡ 강제 업데이트'}
                </button>
              </div>
              <p className="info-card-desc">
                새 기능이나 최신 공지/문서가 보이지 않을 때 눌러주세요. 앱을 지웠다 다시 설치하지 않아도 <strong>캐시를 초기화하고 즉시 최신 버전으로 갱신</strong>됩니다.
              </p>
            </div>

            {/* Announcement Detail Overlay */}
            {selectedAnnouncement && (
              <div 
                className="detail-overlay" 
                onClick={() => {
                  haptic.modal();
                  setSelectedAnnouncement(null);
                }}
              >
                <div className="detail-card" onClick={(e) => e.stopPropagation()}>
                  <div className="detail-header">
                    <h3>공지사항 상세</h3>
                    <button 
                      className="btn-close" 
                      onClick={() => {
                        haptic.modal();
                        setSelectedAnnouncement(null);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div className="detail-body">
                    <div className="detail-time">
                      발신 시간: {new Date(selectedAnnouncement.timestamp).toLocaleString()}
                    </div>
                    <div className="detail-message">{selectedAnnouncement.message}</div>
                  </div>
                  <button 
                    className="btn-confirm" 
                    onClick={() => {
                      haptic.button();
                      setSelectedAnnouncement(null);
                    }}
                  >
                    확인
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ℹ️ App Info & Force Update Modal */}
        {isInfoModalOpen && (
          <div 
            className="detail-overlay" 
            onClick={() => {
              haptic.modal();
              setIsInfoModalOpen(false);
            }}
          >
            <div className="detail-card app-info-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="detail-header">
                <h3>ℹ️ 앱 정보 및 버전 관리</h3>
                <button 
                  className="btn-close" 
                  onClick={() => {
                    haptic.modal();
                    setIsInfoModalOpen(false);
                  }}
                >
                  ×
                </button>
              </div>
              <div className="detail-body">
                <div className="app-info-row">
                  <span className="label">앱 명칭</span>
                  <span className="value">한국기독교장로회 디지털 총회</span>
                </div>
                <div className="app-info-row">
                  <span className="label">현재 버전</span>
                  <span className="value highlight">{APP_VERSION}</span>
                </div>
                <div className="app-info-row">
                  <span className="label">연결 상태</span>
                  <span className="value status-good">🟢 실시간 동기화 정상</span>
                </div>
                <div className="app-info-row">
                  <span className="label">접속 행사</span>
                  <span className="value">{event?.name || '기본 행사'}</span>
                </div>

                <div className="update-notice-box">
                  <strong>💡 강제 업데이트 안내</strong>
                  <p>
                    관리자가 새로운 기능이나 문서를 올렸는데 모바일 화면에 즉시 보이지 않을 경우 아래 버튼을 누르세요. 
                    앱을 삭제 후 다시 설치할 필요 없이 <strong>모든 캐시를 즉시 비우고 최신 앱으로 갱신</strong>합니다.
                  </p>
                </div>
              </div>

              <div className="app-info-modal-actions">
                <button 
                  className={`btn-force-update-large ${isUpdating ? 'is-loading' : ''}`}
                  disabled={isUpdating}
                  onClick={handleForceUpdate}
                >
                  {isUpdating ? '⏳ 최신 버전으로 갱신 중...' : '⚡ 최신 버전으로 강제 업데이트 (캐시 초기화)'}
                </button>
                <button 
                  className="btn-modal-dismiss" 
                  onClick={() => {
                    haptic.button();
                    setIsInfoModalOpen(false);
                  }}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Integrated PDF Viewer Overlay */}
        {viewerUrl && (
          <div 
            className="pdf-viewer-overlay" 
            onClick={() => {
              haptic.modal();
              setViewerUrl(null);
            }}
          >
            <div className="pdf-viewer-container" onClick={(e) => e.stopPropagation()}>
              <div className="pdf-viewer-header">
                <h3>문서 열람</h3>
                <button 
                  className="btn-close-viewer" 
                  onClick={() => {
                    haptic.modal();
                    setViewerUrl(null);
                  }}
                >
                  닫기
                </button>
              </div>
              <div className="pdf-viewer-body">
                <iframe 
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(viewerUrl)}&embedded=true`}
                  title="PDF Viewer" 
                  width="100%" 
                  height="100%"
                  className="pdf-iframe"
                />
              </div>
              <div className="pdf-viewer-footer">
                <p className="pdf-viewer-hint">
                  화면이 잘 보이지 않으면 아래 버튼을 눌러 원본을 확인하세요.
                </p>
                <button 
                  className="btn-full-screen" 
                  onClick={() => {
                    haptic.button();
                    window.open(viewerUrl, '_blank');
                  }}
                >
                  브라우저(원본)로 보기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hidden Pre-fetch Buffer */}
        {prefetchUrl && (
          <iframe src={prefetchUrl} className="prefetch-buffer" title="prefetch-buffer" />
        )}
      </main>

      {/* 3-Tab Bottom Navigation: 문서, 일정, 알림 */}
      <nav className="bottom-nav">
        <div 
          className={`nav-item ${activeTab === 'agenda' ? 'active' : ''}`} 
          onClick={() => handleTabChange('agenda')}
        >
          <span className="nav-icon">📑</span>
          <span>문서</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'schedule' ? 'active' : ''}`} 
          onClick={() => handleTabChange('schedule')}
        >
          <span className="nav-icon">📅</span>
          <span>일정</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'announcements' ? 'active' : ''}`} 
          onClick={() => handleTabChange('announcements')}
        >
          <div className="nav-icon-container">
            <span className="nav-icon">🔔</span>
            {unreadCount > 0 && <span className="nav-badge">{unreadCount}</span>}
          </div>
          <span>알림</span>
        </div>
      </nav>
    </div>
  );
}

export default App;
