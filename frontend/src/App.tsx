import { useState, useEffect } from 'react';
import { useSSE } from './hooks/useSSE';
import { EventLogin } from './components/EventLogin';
import { PWAInstallGuide } from './components/PWAInstallGuide';
import './App.css';

// Dynamically determine the API base URL
// Use relative path for API to leverage Vite proxy, or absolute if explicitly set
const getInitialApiUrl = () => {
    // Relative path '/api' is the most stable as it leverages the Vite proxy.
    // This works seamlessly for both local network access and Cloudflare tunnels.
    return ''; 
};

const DEFAULT_API_URL = getInitialApiUrl();

function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [event, setEvent] = useState<any>(null);
  const [isApiReady, setIsApiReady] = useState(false);
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

  const [voterId] = useState(() => {
    let id = localStorage.getItem('voterId');
    if (!id) {
      id = Math.random().toString(36).substring(2, 11);
      localStorage.setItem('voterId', id);
    }
    return id;
  });

  // SSE Options with stable references
  const sseOptions = useState(() => ({
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
          // Get token from localStorage to avoid stale closure if needed, or similar
          const currentToken = window.location.pathname.startsWith('/join/') 
            ? window.location.pathname.split('/join/')[1] 
            : localStorage.getItem('eventToken');
          if (currentToken) localStorage.setItem(`announcements_${currentToken}`, JSON.stringify(updated));
          return updated;
        });
      }
    },
    onVoteStatusChange: (v: any) => {
      console.log('Vote status changed via SSE:', v);
      if (v.status === 'OPEN') {
        setActiveVote((prev: any) => {
          const options = v.options && v.options.length > 0 ? v.options : (prev?.options || []);
          return { ...prev, ...v, options };
        });
        setVoteResults(null);
        setHasVoted(false);
      } else if (v.status === 'CLOSED') {
        setActiveVote((prev: any) => prev ? { ...prev, ...v, status: 'CLOSED' } : v);
      } else if (v.status === 'WAITING') {
        setActiveVote(null);
        setVoteResults(null);
        setHasVoted(false);
      }
    },
    onVoteDeleted: (id: number) => {
      setActiveVote((prev: any) => {
        if (prev?.id === id) return null;
        return prev;
      });
      setVoteResults(null);
      setHasVoted(false);
    },
    onVoteCountUpdate: (data: any) => {
      setActiveVote((prev: any) => {
        if (prev && (prev.id === data.id)) {
          return { ...prev, voted_count: data.count };
        }
        return prev;
      });
    },
    onVoteResults: (data: any) => {
      setVoteResults(data.results);
    },
    onFileUpdate: () => window.dispatchEvent(new CustomEvent('sse-refresh-data')),
    onLinkUpdate: () => window.dispatchEvent(new CustomEvent('sse-refresh-data')),
    onNewFilePublished: (url: string) => {
      console.log('[PDF] Pre-fetching new file:', url);
      setPrefetchUrl(`${apiUrl}${url}`);
      // Clear prefetch after 10s to allow reuse
      setTimeout(() => setPrefetchUrl(null), 10000);
    }
  }))[0];

  const sseUrl = event 
    ? (event.token ? `${apiUrl}/api/stream?token=${event.token}` : `${apiUrl}/api/stream`)
    : null;

  const { files, setFiles, links, setLinks, connectionCount, connectionStatus, errorCount } = useSSE(sseUrl, sseOptions);
  useEffect(() => {
    // If on localhost, verify if we should be using a different IP from the backend
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      fetch('http://localhost:3000/api/system/ip')
        .then(r => {
          if (!r.ok) throw new Error('Failed to fetch IP');
          return r.json();
        })
        .then(data => {
          if (data && data.ip && data.ip !== '127.0.0.1') {
            console.log('Switching to network IP:', data.ip);
            setApiUrl(`http://${data.ip}:3000`);
          }
          setIsApiReady(true);
        })
        .catch((err) => {
          console.warn('Could not fetch dynamic IP, using default (localhost).', err);
          setIsApiReady(true);
        });
    } else {
      setIsApiReady(true);
    }
  }, []);
  useEffect(() => {
    if (!isApiReady) return;

    const eventToken = window.location.pathname.startsWith('/join/') 
      ? window.location.pathname.split('/join/')[1] 
      : localStorage.getItem('eventToken');
    if (eventToken) {
      setToken(eventToken);
      fetch(`${apiUrl}/api/events/token/${eventToken}`, {
        headers: { 'bypass-tunnel-reminder': 'true' }
      })
        .then(res => {
          if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
          return res.json();
        })
        .then(data => {
          setEvent(data);
          if (data.current_announcement) {
            setAnnouncement(data.current_announcement);
          }
          // Load history from localStorage
          const savedHistory = localStorage.getItem(`announcements_${eventToken}`);
          if (savedHistory) {
            try {
              setAnnouncementHistory(JSON.parse(savedHistory));
            } catch (e) {
              console.error('Failed to load announcement history', e);
            }
          }
          // Fetch initial votes for this event
          fetch(`${apiUrl}/api/votes?eventId=${data.id}`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
          })
            .then(r => r.json())
            .then(votesList => {
              const active = votesList.find((v: any) => v.status === 'OPEN');
              if (active) setActiveVote(active);
            });
        })
        .catch(err => {
          console.error('Failed to fetch event', err);
          setError(`행사 정보를 가져오는 데 실패했습니다: ${err.message}`);
        })
        .finally(() => {
            // Once we have basic event info, load its metadata (files, links)
            // This is safer to do here than in a separate useEffect to avoid race
        });
    }
  }, [isApiReady, apiUrl]);

  // Secondary effect to fetch event data once the event object is set
  useEffect(() => {
    if (event?.id) {
        fetchEventData(event.id);
    }
  }, [event?.id]);

  useEffect(() => {
    const handler = () => {
        if (event?.id) fetchEventData(event.id);
    };
    window.addEventListener('sse-refresh-data', handler);
    return () => window.removeEventListener('sse-refresh-data', handler);
  }, [event?.id]);

  const handleLogin = async (passcode: string) => {
    const res = await fetch(`${apiUrl}/api/events/validate`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, passcode }),
    });
    const isValid = await res.json();
    if (isValid) {
      setIsLoggedIn(true);
      fetchEventData();
    } else {
      setLoginError('암호가 올바르지 않습니다.');
    }
  };

  const castVote = async (optionId: number) => {
    if (!activeVote || hasVoted) return;
    try {
      const res = await fetch(`${apiUrl}/api/votes/${activeVote.id}/cast`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ optionId, voterToken: voterId }),
      });
      if (res.ok) {
        setHasVoted(true);
      } else {
        const errorData = await res.json();
        alert(errorData.message || '투표 처리 중 오류가 발생했습니다.');
        if (res.status === 409) setHasVoted(true); // Already voted
      }
    } catch (err) {
      console.error('Vote failed', err);
      alert('서버와 통신할 수 없습니다.');
    }
  };

  const fetchEventData = (eventId?: number) => {
    const targetId = eventId || event?.id;
    if (!targetId) return;
    fetch(`${apiUrl}/api/events/${targetId}`, {
      headers: { 'bypass-tunnel-reminder': 'true' }
    })
      .then(res => res.json())
      .then(data => {
        setFiles(data.files.filter((f: any) => f.is_public));
        setLinks(data.links.filter((l: any) => l.is_public));
      });
  };

  if (!token) return (
    <div className="landing-container">
      <div className="card">
        <h1>디지털 총회</h1>
        <p>전용 QR 코드 또는 공유 링크를 통해 접속해 주세요.</p>
        <button onClick={() => window.location.href = '/admin'} className="btn-admin">관리자 센터</button>
      </div>
      <style>{`
        .landing-container { display: flex; align-items: center; justify-content: center; height: 100vh; background: #f0f2f5; }
        .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
        .btn-admin { margin-top: 20px; background: #1a237e; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; }
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
      <header className="header">
        <h1>{event.name}</h1>
        <div className="connection-badge">
          📡 실시간 연결 중 ({connectionCount}명 접속)
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

        {(connectionStatus === 'error' || errorCount > 2) && (
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
            {links.length > 0 && (
              <div className="link-section">
                <h3>외부 링크 (설문/영상)</h3>
                {links.map(link => (
                  <div key={link.id} className="link-card" onClick={() => window.open(link.url, '_blank')}>
                    <span className="icon">🔗</span>
                    <div className="link-info">
                      <div className="title">{link.title}</div>
                      <div className="url-hint">{new URL(link.url).hostname}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3>참여 문서 (PDF)</h3>
            {files.map((file, index) => (
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
                <button className="btn-view" onClick={() => setViewerUrl(`${apiUrl}${file.url}`)}>
                  열람
                </button>
              </div>
            ))}

            {files.length === 0 && links.length === 0 && (
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
                  src={viewerUrl} 
                  title="PDF Viewer" 
                  width="100%" 
                  height="100%"
                  style={{ border: 'none' }}
                />
              </div>
              <div className="pdf-viewer-footer">
                <button className="btn-full-screen" onClick={() => window.open(viewerUrl, '_blank')}>
                  브라우저로 보기
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
        .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
        .loader { border: 4px solid #f3f3f3; border-top: 4px solid var(--primary); border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin-bottom: 20px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        
        .announcement-overlay {
          background: #fff9c4;
          border: 2px solid #fbc02d;
          border-radius: 12px;
          margin-bottom: 20px;
          padding: 15px;
          display: flex;
          animation: slideDown 0.3s ease-out;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .announcement-content { display: flex; align-items: center; width: 100%; gap: 12px; }
        .announcement-icon { font-size: 24px; }
        .announcement-text { flex: 1; font-weight: bold; color: #827717; line-height: 1.4; }
        .btn-close-announcement { background: none; border: 1px solid #fbc02d; color: #827717; padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; }

        .link-section { margin-bottom: 25px; }
        .link-section h3 { font-size: 1rem; color: #666; margin-bottom: 12px; }
        .link-card { background: #e3f2fd; padding: 15px; border-radius: 12px; display: flex; align-items: center; gap: 15px; cursor: pointer; border: 1px solid #bbdefb; }
        .link-card .icon { font-size: 20px; }
        .link-card .title { font-weight: bold; color: #1565c0; }
        .link-card .url-hint { font-size: 11px; color: #64b5f6; }

        .connection-badge {
          background: ${connectionStatus === 'connected' ? 'rgba(76, 175, 80, 0.2)' : connectionStatus === 'error' ? 'rgba(244, 67, 54, 0.2)' : 'rgba(255,255,255,0.15)'};
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          display: inline-block;
          margin-top: 10px;
          border: 1px solid ${connectionStatus === 'connected' ? '#4caf50' : connectionStatus === 'error' ? '#f44336' : 'transparent'};
        }
        .connection-error-banner {
          background: #ffebee;
          border: 2px solid #f44336;
          border-radius: 12px;
          margin-bottom: 20px;
          padding: 15px;
          animation: shake 0.5s ease-in-out;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .error-content { display: flex; align-items: center; gap: 12px; color: #b71c1c; }
        .error-text { flex: 1; font-size: 0.9rem; line-height: 1.4; }
        .btn-retry { background: #f44336; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; }
        .agenda-info {
          background: white;
          border-radius: 12px;
          padding: 15px;
          margin-bottom: 20px;
          border-left: 4px solid var(--primary);
        }
        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          width: 100%;
          background: white;
          display: flex;
          height: 60px;
          border-top: 1px solid #eee;
          justify-content: space-around;
          align-items: center;
          z-index: 100;
        }
        .agenda-info-banner {
          background: white; border-radius: 12px; padding: 15px; margin-bottom: 20px;
          border-left: 4px solid var(--primary); transition: background 0.2s; cursor: pointer;
        }
        .agenda-info-banner.is-live { border-left-color: #f44336; background: #fffde7; }
        .agenda-info-banner.is-live:active { background: #fff9c4; }

        .live-vote-ticker { display: flex; align-items: center; gap: 10px; color: #f44336; font-size: 0.95rem; font-weight: bold; width: 100%; }
        .announcement-ticker { color: #555; font-size: 0.9rem; }

        .vote-tab-content { padding: 20px; text-align: center; height: calc(100vh - 180px); display: flex; flex-direction: column; justify-content: center; }
        .active-vote-screen h2 { margin: 15px 0; font-size: 1.8rem; }
        .btn-option.large { width: 100%; margin: 8px 0; padding: 20px; font-size: 1.2rem; }
        
        .empty-vote .icon { font-size: 4rem; opacity: 0.2; margin-bottom: 20px; }
        .empty-vote h3 { color: #888; margin-bottom: 10px; }
        .empty-vote p { color: #bbb; }

        .voting-notification-overlay, .results-notification-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
        }
        .notification-card {
          background: white; width: 100%; max-width: 320px; border-radius: 24px; padding: 30px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2); animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          text-align: center;
        }
        @keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .notification-card h3 { margin-bottom: 10px; }
        .btn-jump-vote {
          width: 100%; background: #1a237e; color: white; border: none; padding: 15px;
          border-radius: 12px; font-weight: bold; font-size: 1rem; cursor: pointer; margin-top: 20px;
          box-shadow: 0 4px 12px rgba(26, 35, 126, 0.3);
        }
        .btn-dismiss { background: none; border: none; color: #888; margin-top: 15px; cursor: pointer; }

        .live-vote-ticker { display: flex; align-items: center; gap: 10px; color: #f44336; font-size: 0.9rem; }
        .dot { width: 8px; height: 8px; background: #f44336; border-radius: 50%; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }
        .btn-go-vote-mini { border: 1px solid #f44336; color: #f44336; background: white; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; margin-left: auto; cursor: pointer; }

        .voted-confirmation { padding: 30px 0; }
        .check-icon { font-size: 4rem; color: #4caf50; margin-bottom: 20px; }
        .vote-stats-mini { margin-top: 20px; color: #888; font-size: 0.8rem; }

        .results-display.card { text-align: left; padding: 20px; margin-top: 20px; border: 1px solid #eee; border-radius: 16px; }
        .result-item { margin-bottom: 15px; }
        .result-info { display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 5px; font-size: 0.9rem; }
        .progress-bar { background: #f0f0f0; height: 8px; border-radius: 4px; overflow: hidden; }
        .progress-fill { background: #1a237e; height: 100%; }

        .info-tab-content { padding: 10px 0; text-align: left; }
        .tab-desc { color: #888; font-size: 0.9rem; margin-bottom: 20px; text-align: center; }
        .announcement-list { display: flex; flex-direction: column; gap: 12px; padding-bottom: 40px; }
        .announcement-item-card { 
          background: white; border-radius: 12px; padding: 15px; 
          box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #eee;
          cursor: pointer; transition: transform 0.1s;
        }
        .announcement-item-card:active { transform: scale(0.98); background: #fafafa; }
        .item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .item-icon { font-size: 1.2rem; }
        .item-time { font-size: 0.8rem; color: #aaa; }
        .item-body { font-size: 0.95rem; color: #333; line-height: 1.4; word-break: break-all; }
        .item-footer { margin-top: 8px; font-size: 0.8rem; color: var(--primary); text-align: right; font-weight: bold; }

        .detail-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px;
        }
        .detail-card {
          background: white; width: 100%; max-width: 400px; border-radius: 20px; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.3); animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .detail-header { padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .detail-header h3 { margin: 0; font-size: 1.1rem; color: #333; }
        .btn-close { background: none; border: none; font-size: 1.5rem; color: #999; cursor: pointer; }
        .detail-body { padding: 24px; max-height: 60vh; overflow-y: auto; }
        .detail-time { font-size: 0.85rem; color: #888; margin-bottom: 15px; }
        .detail-message { font-size: 1.05rem; color: #222; line-height: 1.6; white-space: pre-wrap; word-break: break-all; }
        .btn-confirm { 
          width: calc(100% - 40px); margin: 0 20px 20px; background: var(--primary); 
          color: white; border: none; padding: 14px; border-radius: 12px; 
          font-weight: bold; cursor: pointer; font-size: 1rem;
        }

        .pdf-viewer-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; z-index: 3000;
        }
        .pdf-viewer-container {
          background: white; width: 95%; height: 90%; border-radius: 20px;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .pdf-viewer-header {
          padding: 15px 20px; background: #f8f9fa; border-bottom: 1px solid #eee;
          display: flex; justify-content: space-between; align-items: center;
        }
        .pdf-viewer-header h3 { margin: 0; font-size: 1rem; color: #333; }
        .btn-close-viewer { 
          background: #333; color: white; border: none; padding: 6px 15px; 
          border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: bold;
        }
        .pdf-viewer-body { flex: 1; background: #525659; position: relative; }
        .pdf-viewer-footer { padding: 10px; background: #f8f9fa; border-top: 1px solid #eee; text-align: center; }
        .btn-full-screen { background: none; border: 1px solid #ccc; color: #666; padding: 5px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default App;
