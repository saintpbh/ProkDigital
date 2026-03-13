import { useState, useEffect } from 'react';
import { useSSE } from './hooks/useSSE';
import FileUploader from './components/FileUploader';

// Use relative path for API to leverage Vite proxy, or absolute if explicitly set
const getApiBaseUrl = () => {
    // Relative path '/api' is the most stable as it leverages the Vite proxy.
    // This works seamlessly for both local network access and Cloudflare tunnels.
    return ''; 
};

const LOCAL_CONTROL_API = getApiBaseUrl();

type ViewMode = 'dashboard' | 'management';

export default function Admin() {
    const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
    const [events, setEvents] = useState<any[]>([]);
    const [activeEvent, setActiveEvent] = useState<any>(null);
    const [allFiles, setAllFiles] = useState<any[]>([]);
    const [allLinks, setAllLinks] = useState<any[]>([]);
    const [votes, setVotes] = useState<any[]>([]);
    const [qrInfo, setQrInfo] = useState<any>(null);
    const [announcement, setAnnouncement] = useState('');
    const [serviceIp, setServiceIp] = useState<string>('');
    const [isNetworkServiceStarted, setIsNetworkServiceStarted] = useState(false);
    const [publicJoinUrl, setPublicJoinUrl] = useState<string>('');
    const [isTunneling, setIsTunneling] = useState(false);
    
    const sseUrl = activeEvent?.token 
        ? `${LOCAL_CONTROL_API}/api/stream?token=${activeEvent.token}`
        : `${LOCAL_CONTROL_API}/api/stream`;

    // SSE Options - stable reference to avoid connection flapping
    const sseOptions = useState(() => ({
        onAnnouncement: () => fetchEvents(),
        onVoteStatusChange: () => window.dispatchEvent(new CustomEvent('sse-refresh-data')),
        onVoteDeleted: () => window.dispatchEvent(new CustomEvent('sse-refresh-data')),
        onFileUpdate: () => window.dispatchEvent(new CustomEvent('sse-refresh-data')),
        onLinkUpdate: () => window.dispatchEvent(new CustomEvent('sse-refresh-data')),
    }))[0];

    useEffect(() => {
        const handler = () => {
             const savedEventId = localStorage.getItem('admin_activeEventId');
             if (savedEventId) fetchEventData(parseInt(savedEventId));
        };
        window.addEventListener('sse-refresh-data', handler);
        return () => window.removeEventListener('sse-refresh-data', handler);
    }, []);

    const { connectionCount, connectionStatus, errorCount } = useSSE(sseUrl, sseOptions);
    
    useEffect(() => {
        const savedMode = localStorage.getItem('admin_viewMode') as ViewMode;
        if (savedMode) setViewMode(savedMode);
    }, []);

    useEffect(() => {
        localStorage.setItem('admin_viewMode', viewMode);
        if (activeEvent) {
            localStorage.setItem('admin_activeEventId', activeEvent.id.toString());
        } else {
            localStorage.removeItem('admin_activeEventId');
        }
    }, [viewMode, activeEvent]);

    useEffect(() => {
        const checkTunnelStatus = async () => {
            try {
                const res = await fetch(`${LOCAL_CONTROL_API}/api/system/tunnel/status`, { 
                    method: 'GET',
                    headers: { 'bypass-tunnel-reminder': 'true' }
                });
                const data = await res.json();
                if (Array.isArray(data)) {
                    const frontendTunnel = data.find((t: any) => t.port === 5173);
                    if (frontendTunnel && frontendTunnel.url) {
                        localStorage.setItem('MANUAL_FRONTEND_URL', frontendTunnel.url);
                        setPublicJoinUrl(`${frontendTunnel.url}/join/${activeEvent?.token || ''}`);
                    }
                }
            } catch (e) {
                console.warn('Could not fetch tunnel status locally', e);
            }
        };
        checkTunnelStatus();
    }, [activeEvent?.token]);

    const fetchEvents = () => {
        fetch(`${LOCAL_CONTROL_API}/api/events`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
        })
            .then(res => res.json())
            .then(data => {
                setEvents(data);
                // Restore active event if it was persisted
                const savedEventId = localStorage.getItem('admin_activeEventId');
                if (savedEventId) {
                    const found = data.find((e: any) => e.id.toString() === savedEventId);
                    if (found) setActiveEvent(found);
                }
            })
            .catch(err => console.error('Failed to fetch events locally', err));
    };

    const fetchEventData = (eventId: number) => {
        fetch(`${LOCAL_CONTROL_API}/api/events/${eventId}`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
        })
            .then(res => res.json())
            .then(data => {
                setAllFiles(data.files || []);
                setAllLinks(data.links || []);
            });
        fetch(`${LOCAL_CONTROL_API}/api/votes?eventId=${eventId}`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
        })
            .then(res => res.json())
            .then(data => setVotes(Array.isArray(data) ? data : []))
            .catch(() => setVotes([]));
    };

    const fetchQrCode = async (eventId: number) => {
        const tunnelUrl = localStorage.getItem('MANUAL_FRONTEND_URL');
        let origin = tunnelUrl || window.location.origin;
        
        if (!tunnelUrl && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            if (serviceIp && serviceIp !== '127.0.0.1') {
                origin = `http://${serviceIp}:5173`;
            }
        }
        
        fetch(`${LOCAL_CONTROL_API}/api/events/${eventId}/qr?origin=${encodeURIComponent(origin)}`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
        })
            .then(res => res.json())
            .then(data => setQrInfo(data));
    };

    useEffect(() => {
        // Fetch current service IP from local backend
        fetch(`${LOCAL_CONTROL_API}/api/system/ip`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
        })
            .then(r => {
                if (!r.ok) throw new Error('IP fetch 404');
                return r.json();
            })
            .then(data => {
                if (data && data.ip) {
                    setServiceIp(data.ip);
                }
            })
            .catch(err => {
                console.warn('Failed to detect service IP.', err);
                setServiceIp('127.0.0.1');
            });
        
        fetchEvents();
    }, []);

    useEffect(() => {
        if (activeEvent && viewMode === 'management') {
            fetchEventData(activeEvent.id);
            if (serviceIp) fetchQrCode(activeEvent.id);
        }
    }, [activeEvent, viewMode, serviceIp]);

    const handleCreateEvent = async () => {
        const name = prompt('새 행사 이름을 입력하세요');
        if (!name) return;
        const res = await fetch(`${LOCAL_CONTROL_API}/api/events`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify({ name, passcode: '1234' }),
        });
        const newEvent = await res.json();
        setEvents([newEvent, ...events]);
        setActiveEvent(newEvent);
        setViewMode('management');
    };

    const handleUpdateEvent = async (id: number, data: any) => {
        await fetch(`${LOCAL_CONTROL_API}/api/events/${id}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify(data),
        });
        fetchEvents();
    };

    const handleDeleteEvent = async (id: number) => {
        if (!window.confirm('정말로 이 행사를 영구적으로 삭제하시겠습니까? 관련 된 모든 데이터가 사라집니다.')) return;
        await fetch(`${LOCAL_CONTROL_API}/api/events/${id}`, { 
            method: 'DELETE',
            headers: { 'bypass-tunnel-reminder': 'true' }
        });
        setViewMode('dashboard');
        setActiveEvent(null);
        fetchEvents();
    };

    const handleSendAnnouncement = async () => {
        if (!activeEvent || !announcement) return;
        await fetch(`${LOCAL_CONTROL_API}/api/events/${activeEvent.id}/announce`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify({ message: announcement }),
        });
        alert('공지가 발송되었습니다.');
        setAnnouncement('');
    };

    const toggleFile = async (id: number) => {
        await fetch(`${LOCAL_CONTROL_API}/api/files/${id}/toggle`, { 
            method: 'PATCH',
            headers: { 'bypass-tunnel-reminder': 'true' }
        });
        fetchEventData(activeEvent.id);
    };

    const renameFile = async (id: number, oldTitle: string) => {
        const newTitle = prompt('새 파일 이름을 입력하세요', oldTitle);
        if (!newTitle || newTitle === oldTitle) return;
        await fetch(`${LOCAL_CONTROL_API}/api/files/${id}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify({ title: newTitle }),
        });
        fetchEventData(activeEvent.id);
    };

    const deleteFile = async (id: number) => {
        if (!window.confirm('정말로 삭제하시겠습니까?')) return;
        await fetch(`${LOCAL_CONTROL_API}/api/files/${id}`, { 
            method: 'DELETE',
            headers: { 'bypass-tunnel-reminder': 'true' }
        });
        fetchEventData(activeEvent.id);
    };

    const renameLink = async (id: number, oldTitle: string) => {
        const newTitle = prompt('새 링크 이름을 입력하세요', oldTitle);
        if (!newTitle || newTitle === oldTitle) return;
        await fetch(`${LOCAL_CONTROL_API}/api/events/links/${id}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify({ title: newTitle }),
        });
        fetchEventData(activeEvent.id);
    };

    const addVote = async () => {
        const question = prompt('투표 안건을 입력하세요');
        if (!question) return;
        const type = confirm('다지선다 투표입니까? (취소 시 가/부 투표)') ? 'MULTIPLE' : 'YN';
        let options: string[] = [];
        if (type === 'MULTIPLE') {
            const optStr = prompt('선택지들을 콤마(,)로 구분하여 입력하세요 (예: 찬성,반대,기권)');
            if (!optStr) return;
            options = optStr.split(',').map(s => s.trim());
        }

        await fetch(`${LOCAL_CONTROL_API}/api/votes?eventId=${activeEvent.id}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify({ question, type, options }),
        });
        fetchEventData(activeEvent.id);
    };

    const updateVoteStatus = async (id: number, status: string) => {
        await fetch(`${LOCAL_CONTROL_API}/api/votes/${id}/status`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify({ status }),
        });
        fetchEventData(activeEvent.id);
    };

    const toggleVoteResults = async (id: number, show: boolean) => {
        await fetch(`${LOCAL_CONTROL_API}/api/votes/${id}/results`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify({ show }),
        });
        fetchEventData(activeEvent.id);
    };

    const deleteVote = async (id: number) => {
        if (!confirm('투표를 삭제할까요?')) return;
        await fetch(`${LOCAL_CONTROL_API}/api/votes/${id}`, { 
            method: 'DELETE',
            headers: { 'bypass-tunnel-reminder': 'true' }
        });
        fetchEventData(activeEvent.id);
    };

    const addLink = async () => {
        const title = prompt('링크 제목을 입력하세요');
        const url = prompt('URL 주소를 입력하세요');
        if (!title || !url) return;
        await fetch(`${LOCAL_CONTROL_API}/api/events/${activeEvent.id}/links`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify({ title, url }),
        });
        fetchEventData(activeEvent.id);
    };

    const toggleLink = async (id: number) => {
        await fetch(`${LOCAL_CONTROL_API}/api/events/links/${id}/toggle`, { 
            method: 'PATCH',
            headers: { 'bypass-tunnel-reminder': 'true' }
        });
        fetchEventData(activeEvent.id);
    };

    // Dashboard View (Level 1)
    if (viewMode === 'dashboard') {
        const recentEvents = events.slice(0, 3);
        const pastEvents = events.slice(3);

        return (
            <div className="admin-dashboard">
                <header className="admin-header">
                    <div>
                        <h1>디지털 총회 관제 센터</h1>
                        <p>반갑습니다, 관리자님. 운영할 행사를 선택하거나 새로 추가해 주세요.</p>
                    </div>
                    <div className="stats-badge">
                        현재 접속: <b>{connectionCount}명</b>
                    </div>
                </header>

                <section className="network-service-card">
                    <div className="ns-left">
                        <span className="ns-icon">🌐</span>
                        <div className="ns-text">
                            <h3>사내 네트워크 서비스 정보</h3>
                            <p>현재 할당된 주소: <strong>{serviceIp || '감지 중...'}</strong></p>
                        </div>
                    </div>
                    <div className="ns-right">
                        {isNetworkServiceStarted ? (
                            <div className="service-on">
                                <span className="pulse-dot"></span>
                                서비스 가동 중
                            </div>
                        ) : (
                            <button className="btn-start-ns" onClick={() => setIsNetworkServiceStarted(true)}>사내 서비스 시작하기</button>
                        )}
                    </div>
                </section>

                <section className="tunneling-card">
                    <div className="tunnel-header">
                        <span className="tunnel-icon">🚀</span>
                        <div className="tunnel-text">
                            <h3>원클릭 외부 접속 (Anywhere) 활성화</h3>
                            <p>복잡한 설정 없이 버튼 하나로 어디서든 접속 가능한 인터넷 주소를 만듭니다.</p>
                        </div>
                    </div>
                    
                    <div className="tunnel-action">
                        {isTunneling ? (
                            <div className="tunnel-loading">
                                <span className="loader-mini"></span>
                                외부 주소 생성 중... (약 10초 소요)
                            </div>
                        ) : publicJoinUrl ? (
                            <div className="tunnel-success">
                                <div className="url-group">
                                    <label>대의원 공유용 주소 (인터넷)</label>
                                    <div className="url-copy-box">
                                        <code>{publicJoinUrl}</code>
                                        <button onClick={() => {
                                            const text = publicJoinUrl;
                                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                                navigator.clipboard.writeText(text).then(() => alert('공유 주소가 복사되었습니다.'))
                                                    .catch(() => {
                                                        const el = document.createElement('textarea');
                                                        el.value = text;
                                                        document.body.appendChild(el);
                                                        el.select();
                                                        document.execCommand('copy');
                                                        document.body.removeChild(el);
                                                        alert('공유 주소가 복사되었습니다.');
                                                    });
                                            } else {
                                                const el = document.createElement('textarea');
                                                el.value = text;
                                                document.body.appendChild(el);
                                                el.select();
                                                document.execCommand('copy');
                                                document.body.removeChild(el);
                                                alert('공유 주소가 복사되었습니다.');
                                            }
                                        }}>복사</button>
                                    </div>
                                </div>
                                <button className="btn-stop-tunnel" onClick={async () => {
                                    await fetch(`${LOCAL_CONTROL_API}/api/system/tunnel/stop`, { 
                                        method: 'POST',
                                        headers: { 'bypass-tunnel-reminder': 'true' }
                                    });
                                    localStorage.removeItem('MANUAL_API_BASE_URL');
                                    localStorage.removeItem('MANUAL_FRONTEND_URL');
                                    alert('터널이 중단되었습니다. 페이지를 새로고침합니다.');
                                    window.location.reload();
                                }}>서비스 중단</button>
                            </div>
                        ) : (
                            <button className="btn-start-automation" onClick={async () => {
                                setIsTunneling(true);
                                try {
                                    const res = await fetch(`${LOCAL_CONTROL_API}/api/system/tunnel/start`, { 
                                        method: 'POST',
                                        headers: { 'bypass-tunnel-reminder': 'true' }
                                    });
                                    const data = await res.json();
                                    if (data.backendUrl && data.frontendUrl) {
                                        localStorage.setItem('MANUAL_API_BASE_URL', data.backendUrl);
                                        localStorage.setItem('MANUAL_FRONTEND_URL', data.frontendUrl);
                                        // Update Join URL for QR code consistency
                                        setPublicJoinUrl(`${data.frontendUrl}/join/${activeEvent?.token || ''}`);
                                        alert('외부 접속이 활성화되었습니다! 잠시 후 페이지가 새로고침됩니다.');
                                        setTimeout(() => window.location.reload(), 1500);
                                    }
                                } catch (e) {
                                    alert('터널 생성 중 오류가 발생했습니다. 다시 시도해 주세요.');
                                } finally {
                                    setIsTunneling(false);
                                }
                            }}>지금 바로 외부 접속 활성화하기</button>
                        )}
                    </div>

                    <div className="tunnel-info-hint">
                        <strong>✅ 외부 접속 준비 완료</strong>: 위 주소를 복사하여 대의원들께 공유해 주세요. 별도의 비밀번호 입력 없이 즉시 접속됩니다.
                    </div>
                </section>

                <main className="dashboard-content">
                    <section className="event-section">
                        <div className="section-header">
                            <h2>최근 행사</h2>
                            <button className="btn-add" onClick={handleCreateEvent}>+ 새 행사 추가</button>
                        </div>
                        <div className="event-grid">
                            {recentEvents.map(ev => (
                                <div key={ev.id} className="event-card">
                                    <div className="card-main" onClick={() => { setActiveEvent(ev); setViewMode('management'); }}>
                                        <div className="event-tag">RECENT</div>
                                        <h3>{ev.name}</h3>
                                        <p>{new Date(ev.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div className="card-actions">
                                        <button title="제목 변경" onClick={() => {
                                            const n = prompt('새 행사 이름을 입력하세요', ev.name);
                                            if (n && n !== ev.name) handleUpdateEvent(ev.id, { name: n });
                                        }}>✏️</button>
                                        <button title="QR 코드" onClick={() => { fetchQrCode(ev.id); alert('QR 코드가 하단에 생성됩니다(기능준비중)'); }}>📱</button>
                                        <button title="비밀번호 변경" onClick={() => {
                                            const p = prompt('새 암호를 입력하세요', ev.passcode);
                                            if (p) handleUpdateEvent(ev.id, { passcode: p });
                                        }}>🔑</button>
                                        <button title="삭제" className="btn-card-del" onClick={() => handleDeleteEvent(ev.id)}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {pastEvents.length > 0 && (
                        <section className="event-section">
                            <h2>이전 행사들</h2>
                            <div className="event-grid past">
                                {pastEvents.map(ev => (
                                    <div key={ev.id} className="event-card mini" onClick={() => { setActiveEvent(ev); setViewMode('management'); }}>
                                        <h3>{ev.name}</h3>
                                        <button className="btn-past-del" onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.id); }}>×</button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </main>
                <style>{dashboardStyles}</style>
            </div>
        );
    }

    // Management View (Level 2)
    return (
        <div className="admin-management">
            <header className="admin-header-nav">
                <button className="btn-back" onClick={() => setViewMode('dashboard')}>← 대시보드로</button>
                <h1>{activeEvent.name} <small>관리 모드</small></h1>
                <div className="live-badge">LIVE</div>
            </header>

            <div className="management-grid">
                <aside className="mgmt-sidebar">
                    <section className="announcement-tool">
                        <h3>📣 실시간 공지 발송</h3>
                        <textarea
                            placeholder="대의원 화면에 즉시 표시될 내용을 입력하세요..."
                            value={announcement}
                            onChange={(e) => setAnnouncement(e.target.value)}
                        />
                        <button className="btn-send" onClick={handleSendAnnouncement}>공지 즉시 발송</button>
                    </section>
                    
                    <section className="connection-integrity-card">
                        <div className={`status-pill ${connectionStatus}`}>
                           {connectionStatus === 'connected' ? '📡 실시간 연결됨' : connectionStatus === 'connecting' ? '⌛ 연결 시도 중' : '❌ 연결 오류'}
                        </div>
                        <p>터널 주소: <strong>{activeEvent?.token || 'N/A'}</strong></p>
                        {errorCount > 0 && <p className="error-text">오류 횟수: {errorCount}</p>}
                        {connectionStatus === 'error' && <button className="btn-repair" onClick={() => window.location.reload()}>연결 재시도 (새로고침)</button>}
                    </section>

                    {qrInfo && (
                        <section className="share-tool">
                            <h3>🔗 접속 및 공유</h3>
                            <div className="qr-container">
                                <img src={qrInfo.qrCode} alt="QR" />
                                <button className="btn-copy" onClick={() => { 
                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                        navigator.clipboard.writeText(qrInfo.joinUrl)
                                            .then(() => alert('주소가 복사되었습니다.'))
                                            .catch(() => alert('복사 실패. 아래 주소를 직접 복사해 주세요.'));
                                    } else {
                                        alert('보안 연결(HTTPS)이 아니어서 자동 복사를 수행할 수 없습니다. 아래 테스트 URL 주소에서 직접 복사해 주세요.');
                                    }
                                }}>주소 복사</button>
                            </div>
                            <div className="test-url">
                                <label>테스트 URL</label>
                                <input readOnly value={qrInfo.joinUrl} />
                                <button onClick={() => window.open(qrInfo.joinUrl, '_blank')}>열기</button>
                            </div>
                        </section>
                    )}
                </aside>

                <main className="mgmt-content">
                    <section className="content-area">
                        <div className="area-header">
                            <h3>🗳️ 투표 안건 관리</h3>
                            <button className="btn-vote" onClick={addVote}>+ 새 투표 생성</button>
                        </div>
                        <div className="management-list">
                            <table>
                                <thead>
                                    <tr>
                                        <th>안건</th>
                                        <th>유형</th>
                                        <th>상태</th>
                                        <th>제어</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {votes.map(v => (
                                        <tr key={v.id}>
                                            <td>{v.question}</td>
                                            <td>{v.type === 'YN' ? '가/부' : '다지선다'}</td>
                                            <td>
                                                <span className={`tag ${v.status === 'OPEN' ? 'on' : v.status === 'CLOSED' ? 'off' : ''}`}>
                                                    {v.status === 'WAITING' ? '대기' : v.status === 'OPEN' ? '진행중' : '종료'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="btn-group">
                                                    {v.status === 'WAITING' && <button onClick={() => updateVoteStatus(v.id, 'OPEN')}>투표 개시</button>}
                                                    {v.status === 'OPEN' && <button onClick={() => updateVoteStatus(v.id, 'CLOSED')}>투표 종료</button>}
                                                    {v.status === 'CLOSED' && (
                                                        <button onClick={() => toggleVoteResults(v.id, !v.show_results)}>
                                                            {v.show_results ? '결과 숨김' : '결과 발표'}
                                                        </button>
                                                    )}
                                                    <button className="del" onClick={() => deleteVote(v.id)}>삭제</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {votes.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#888' }}>생성된 투표가 없습니다.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="content-area">
                        <div className="area-header">
                            <h3>파일 및 문서 관리</h3>
                            <button className="btn-link" onClick={addLink}>+ 외부 링크 추가</button>
                        </div>
                        <FileUploader eventId={activeEvent.id} onUploadSuccess={() => fetchEventData(activeEvent.id)} apiUrl={LOCAL_CONTROL_API} />

                        <div className="management-list">
                            <table>
                                <thead>
                                    <tr>
                                        <th>제목</th>
                                        <th>구분</th>
                                        <th>상태</th>
                                        <th>제어</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allFiles.map(f => (
                                        <tr key={f.id}>
                                            <td>{f.title}</td>
                                            <td>PDF</td>
                                            <td><span className={`tag ${f.is_public ? 'on' : 'off'}`}>{f.is_public ? '공유중' : '중단'}</span></td>
                                            <td>
                                                <button onClick={() => renameFile(f.id, f.title)}>✏️</button>
                                                <button onClick={() => toggleFile(f.id)}>{f.is_public ? '중지' : '공개'}</button>
                                                <button className="del" onClick={() => deleteFile(f.id)}>삭제</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {allLinks.map(l => (
                                        <tr key={l.id}>
                                            <td>{l.title}</td>
                                            <td>LINK</td>
                                            <td><span className={`tag ${l.is_public ? 'on' : 'off'}`}>{l.is_public ? '공유중' : '중단'}</span></td>
                                            <td>
                                                <button onClick={() => renameLink(l.id, l.title)}>✏️</button>
                                                <button onClick={() => toggleLink(l.id)}>{l.is_public ? '중지' : '공개'}</button>
                                                <button className="del" onClick={() => { 
                                                    if (confirm('삭제할까요?')) 
                                                        fetch(`${LOCAL_CONTROL_API}/api/events/links/${l.id}`, { 
                                                            method: 'DELETE',
                                                            headers: { 'bypass-tunnel-reminder': 'true' }
                                                        }).then(() => fetchEventData(activeEvent.id)) 
                                                }}>삭제</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
            <style>{managementStyles}</style>
        </div>
    );
}

const dashboardStyles = `
    .admin-dashboard { padding: 40px; max-width: 1200px; margin: 0 auto; color: #333; }
    .admin-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 50px; }
    .admin-header h1 { font-size: 2rem; margin: 0; color: #1a237e; }
    .admin-header p { color: #666; margin: 5px 0 0; }
    .stats-badge { background: #e8eaf6; padding: 10px 20px; border-radius: 30px; font-size: 0.9rem; color: #1a237e; }

    .event-section { margin-bottom: 40px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .btn-add { background: #1a237e; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; }

    .event-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
    .event-card { background: white; border-radius: 15px; border: 1px solid #eee; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); transition: transform 0.2s; }
    .event-card:hover { transform: translateY(-5px); }
    .card-main { padding: 25px; cursor: pointer; }
    .event-tag { font-size: 10px; font-weight: 800; color: #1a237e; background: #e8eaf6; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-bottom: 15px; }
    .event-card h3 { margin: 0 0 10px; font-size: 1.25rem; }
    .event-card p { margin: 0; color: #888; font-size: 0.85rem; }
    
    .card-actions { background: #f8f9fa; padding: 12px 20px; display: flex; gap: 10px; border-top: 1px solid #f0f0f0; }
    .card-actions button { background: white; border: 1px solid #ddd; border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 1.1rem; }
    .btn-card-del:hover { background: #ffebee; border-color: #ffcdd2; }

    .event-grid.past { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
    .event-card.mini { padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .event-card.mini h3 { font-size: 1rem; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .btn-past-del { background: none; border: none; color: #ccc; font-size: 1.2rem; cursor: pointer; padding: 0 5px; }
    .btn-past-del:hover { color: #f44336; }

    .network-service-card {
        background: white; border-radius: 12px; padding: 20px 30px; margin-bottom: 40px;
        display: flex; justify-content: space-between; align-items: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.05); border: 1px solid #e0e0e0;
    }
    .ns-left { display: flex; align-items: center; gap: 20px; }
    .ns-icon { font-size: 2.5rem; }
    .ns-text h3 { margin: 0 0 5px; font-size: 1.1rem; }
    .ns-text p { margin: 0; color: #666; font-size: 0.9rem; }
    .btn-start-ns { 
        background: #4caf50; color: white; border: none; padding: 12px 24px; 
        border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s;
    }
    .btn-start-ns:hover { background: #43a047; }
    .service-on { 
        display: flex; align-items: center; gap: 8px; color: #2e7d32; font-weight: bold; 
        background: #e8f5e9; padding: 10px 20px; border-radius: 30px;
    }
    .pulse-dot { width: 8px; height: 8px; background: #2e7d32; border-radius: 50%; animation: pulse-green 1.5s infinite; }
    @keyframes pulse-green { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 125, 50, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(46, 125, 50, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 125, 50, 0); } }

    .tunneling-card {
        background: #f1f8ff; border-radius: 12px; padding: 25px 30px; margin-bottom: 40px;
        border: 1px solid #c8e1ff; color: #0366d6;
    }
    .tunnel-header { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
    .tunnel-icon { font-size: 2rem; }
    .tunnel-text h3 { margin: 0; }
    .tunnel-text p { margin: 5px 0 0; color: #586069; font-size: 0.9rem; }
    
    .tunnel-steps { display: flex; flex-direction: column; gap: 15px; }
    .step label { display: block; font-size: 0.85rem; font-weight: bold; margin-bottom: 8px; }
    .step code { display: block; background: white; padding: 10px; border-radius: 6px; border: 1px solid #ddd; font-family: monospace; }
    .input-group { display: flex; gap: 10px; }
    .input-group input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; }
    .btn-save-tunnel { background: #0366d6; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; }

    .tunnel-action { margin-top: 10px; }
    .btn-start-automation { 
        width: 100%; background: #0366d6; color: white; border: none; padding: 15px; 
        border-radius: 12px; font-weight: bold; font-size: 1.1rem; cursor: pointer;
        box-shadow: 0 4px 15px rgba(3, 102, 214, 0.3); transition: all 0.2s;
    }
    .btn-start-automation:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(3, 102, 214, 0.4); }
    
    .tunnel-loading { display: flex; align-items: center; justify-content: center; gap: 15px; padding: 20px; font-weight: bold; }
    .loader-mini { width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #0366d6; border-radius: 50%; animation: spin 1s linear infinite; }
    
    .tunnel-success { background: white; border-radius: 10px; padding: 20px; border: 1px solid #c8e1ff; }
    .url-group label { display: block; font-size: 0.8rem; color: #586069; margin-bottom: 8px; }
    .url-copy-box { display: flex; gap: 10px; margin-bottom: 15px; }
    .url-copy-box code { flex: 1; background: #f6f8fa; padding: 8px 12px; border-radius: 6px; border: 1px solid #eee; overflow-x: auto; white-space: nowrap; }
    .url-copy-box button { background: #0366d6; color: white; border: none; padding: 5px 15px; border-radius: 6px; cursor: pointer; }
    .btn-stop-tunnel { font-size: 0.8rem; color: #f44336; background: none; border: 1px solid #ffcdd2; padding: 5px 10px; border-radius: 4px; cursor: pointer; }
    
    .tunnel-info-hint { font-size: 0.75rem; color: #666; margin-top: 15px; text-align: center; font-style: italic; }
    .btn-manual-bypass { width: 100%; background: #d32f2f; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 5px; }
    .btn-manual-bypass:hover { background: #b71c1c; }
    .bypass-manual-box { background: #fffde7; padding: 15px; border-radius: 10px; border: 1px dashed #fbc02d; margin-top: 10px; }
`;

const managementStyles = `
    .admin-management { padding: 0; height: 100vh; display: flex; flex-direction: column; background: #f5f7fa; }
    .admin-header-nav { background: white; padding: 15px 30px; display: flex; align-items: center; border-bottom: 1px solid #e1e4e8; gap: 20px; }
    .btn-back { background: none; border: 1px solid #ddd; padding: 8px 15px; border-radius: 6px; cursor: pointer; }
    .admin-header-nav h1 { font-size: 1.3rem; margin: 0; flex: 1; }
    .admin-header-nav h1 small { color: #888; font-weight: normal; margin-left:10px; }
    .live-badge { background: #f44336; color: white; font-size: 10px; font-weight: bold; padding: 3px 8px; border-radius: 4px; animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }

    .management-grid { display: grid; grid-template-columns: 320px 1fr; flex: 1; overflow: hidden; }
    .mgmt-sidebar { background: white; border-right: 1px solid #e1e4e8; padding: 25px; overflow-y: auto; }
    .mgmt-content { padding: 30px; overflow-y: auto; }

    .announcement-tool h3, .share-tool h3, .content-area h3 { font-size: 1rem; margin: 0 0 15px; display: flex; align-items: center; gap: 8px; }
    .announcement-tool textarea { width: 100%; height: 120px; border: 1px solid #ddd; border-radius: 8px; padding: 12px; font-family: inherit; margin-bottom: 10px; box-sizing: border-box; }
    .btn-send { width: 100%; background: #1a237e; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; }
    
    .connection-integrity-card { border-top: 1px solid #eee; margin-top: 20px; padding-top: 20px; font-size: 0.85rem; }
    .status-pill { display: inline-block; padding: 4px 10px; border-radius: 12px; font-weight: bold; margin-bottom: 8px; }
    .status-pill.connected { background: #e8f5e9; color: #2e7d32; }
    .status-pill.connecting { background: #fffde7; color: #fbc02d; }
    .status-pill.error { background: #ffebee; color: #c62828; }
    .btn-repair { width: 100%; background: #f44336; color: white; border: none; padding: 8px; border-radius: 6px; margin-top: 10px; cursor: pointer; }

    .qr-container { text-align: center; background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 15px; }
    .qr-container img { width: 160px; background: white; padding: 10px; border-radius: 8px; border: 1px solid #eee; margin-bottom: 10px; }
    .btn-copy { display: block; width: 100%; padding: 8px; background: white; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; }

    .test-url label { font-size: 0.8rem; color: #666; display: block; margin-bottom: 5px; }
    .test-url { display: flex; flex-direction: column; gap: 5px; }
    .test-url input { padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.8rem; background: #f8f9fa; }
    .test-url button { padding: 8px; background: #333; color: white; border: none; border-radius: 6px; cursor: pointer; }

    .area-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .btn-link { background: #4caf50; color: white; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; }

    .management-list { background: white; border-radius: 12px; border: 1px solid #eee; overflow: hidden; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 15px; background: #f8f9fa; border-bottom: 1px solid #eee; font-size: 0.8rem; color: #888; }
    td { padding: 15px; border-bottom: 1px solid #f0f0f0; }
    .tag { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .tag.on { background: #e8f5e9; color: #2e7d32; }
    .tag.off { background: #f5f5f5; color: #999; }
    
    td button { background: white; border: 1px solid #ddd; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px; }
    td button.del { color: #f44336; border-color: #ffcdd2; }
    td button.del:hover { background: #ffebee; }
`;
