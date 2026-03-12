import { useState, useEffect } from 'react';
import { useSSE } from './hooks/useSSE';
import { EventLogin } from './components/EventLogin';
import './App.css';

const API_BASE_URL = 'http://localhost:3000';

function App() {
  const [event, setEvent] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const { files, setFiles, links, setLinks, connectionCount } = useSSE(
    event ? `${API_BASE_URL}/api/stream?token=${event.token}` : null,
    {
      onAnnouncement: (msg: string) => {
        setAnnouncement(msg);
        // Optional: Add a subtle sound or vibration here
      }
    }
  );

  useEffect(() => {
    const path = window.location.pathname;
    const eventToken = path.split('/join/')[1];
    if (eventToken) {
      setToken(eventToken);
      fetch(`${API_BASE_URL}/api/events/token/${eventToken}`)
        .then(res => res.json())
        .then(data => {
          setEvent(data);
          if (data.current_announcement) {
            setAnnouncement(data.current_announcement);
          }
        })
        .catch(err => console.error('Failed to fetch event', err));
    }
  }, []);

  const handleLogin = async (passcode: string) => {
    const res = await fetch(`${API_BASE_URL}/api/events/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const fetchEventData = () => {
    if (!event) return;
    fetch(`${API_BASE_URL}/api/events/${event.id}`)
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
      <div className="loader"></div>
      <p>행사 정보를 확인하는 중...</p>
    </div>
  );

  if (!isLoggedIn && event.passcode) {
    return <EventLogin eventName={event.name} onLogin={handleLogin} error={loginError} />;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>{event.name}</h1>
        <div className="connection-badge">
          📡 실시간 연결 중 ({connectionCount}명 접속)
        </div>
      </header>

      <main className="container">
        {announcement && (
          <section className="announcement-overlay">
            <div className="announcement-content">
              <span className="announcement-icon">📢</span>
              <div className="announcement-text">{announcement}</div>
              <button className="btn-close-announcement" onClick={() => setAnnouncement(null)}>닫기</button>
            </div>
          </section>
        )}

        <section className="agenda-info">
          <div className="card-info">
            🕒 현재 진행: {announcement || '회의가 시작되길 기다리는 중입니다.'}
          </div>
        </section>

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
              <button className="btn-view" onClick={() => window.open(`${API_BASE_URL}${file.url}`, '_blank')}>
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
      </main>

      <nav className="bottom-nav">
        <div className="nav-item active">안건지</div>
        <div className="nav-item focus">투표</div>
        <div className="nav-item">일정</div>
        <div className="nav-item">정보</div>
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
          background: rgba(255,255,255,0.15);
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          display: inline-block;
          margin-top: 10px;
        }
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
        .nav-item { font-size: 0.75rem; color: #888; text-align: center; }
        .nav-item.active { color: var(--primary); font-weight: bold; }
        .nav-item.focus { color: #f44336; font-weight: bold; position: relative; }
        .nav-item.focus::after { content: ''; position: absolute; top: -5px; right: -5px; width: 8px; height: 8px; background: #f44336; border-radius: 50%; animation: blink 1s infinite; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }

        .empty-state {
          text-align: center;
          padding: 40px;
          color: #999;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}

export default App;
