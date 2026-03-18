import { useState, useEffect } from 'react';
import { db, storage } from './lib/firebase';
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, 
    query, orderBy, where, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

type ViewMode = 'dashboard' | 'management';

export default function Admin() {
    const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
    const [events, setEvents] = useState<any[]>([]);
    const [activeEvent, setActiveEvent] = useState<any>(null);
    const [allFiles, setAllFiles] = useState<any[]>([]);
    const [allLinks, setAllLinks] = useState<any[]>([]);
    const [votes, setVotes] = useState<any[]>([]);
    const [announcement, setAnnouncement] = useState('');
    
    // File upload state
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isWarmingUp, setIsWarmingUp] = useState<string | null>(null);

    // Modal state for Add Event
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newEventName, setNewEventName] = useState('');

    // Modal state for Passcode Modification
    const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
    const [newPasscode, setNewPasscode] = useState('');

    // Restore saved view mode and active event on mount
    useEffect(() => {
        const savedMode = localStorage.getItem('admin_viewMode') as ViewMode;
        if (savedMode) setViewMode(savedMode);
    }, []);

    useEffect(() => {
        localStorage.setItem('admin_viewMode', viewMode);
        if (activeEvent) {
            localStorage.setItem('admin_activeEventId', activeEvent.id);
        } else {
            localStorage.removeItem('admin_activeEventId');
        }
    }, [viewMode, activeEvent]);

    // ==========================================
    // Real-time Firestore listeners
    // ==========================================

    // Listen to events collection (real-time)
    useEffect(() => {
        const q = query(collection(db, 'events'), orderBy('created_at', 'desc'));
        const unsub = onSnapshot(q, (snapshot) => {
            const evts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setEvents(evts);
            // Restore active event
            const savedId = localStorage.getItem('admin_activeEventId');
            if (savedId && !activeEvent) {
                const found = evts.find(e => e.id === savedId);
                if (found) setActiveEvent(found);
            }
        });
        return () => unsub();
    }, []);

    // Listen to files for active event (real-time)
    useEffect(() => {
        if (!activeEvent) return;
        const q = query(collection(db, 'files'), where('eventId', '==', activeEvent.id));
        const unsub = onSnapshot(q, (snapshot) => {
            const files = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllFiles(files);
        });
        return () => unsub();
    }, [activeEvent?.id]);

    // Listen to links for active event (real-time)
    useEffect(() => {
        if (!activeEvent) return;
        const q = query(collection(db, 'links'), where('eventId', '==', activeEvent.id));
        const unsub = onSnapshot(q, (snapshot) => {
            const links = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllLinks(links);
        });
        return () => unsub();
    }, [activeEvent?.id]);

    // Listen to votes for active event (real-time)
    useEffect(() => {
        if (!activeEvent) return;
        const q = query(collection(db, 'votes'), where('eventId', '==', activeEvent.id));
        const unsub = onSnapshot(q, (snapshot) => {
            const voteList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setVotes(voteList);
        });
        return () => unsub();
    }, [activeEvent?.id]);

    // ==========================================
    // Event CRUD (Firestore)
    // ==========================================

    const handleCreateEventSubmit = async () => {
        const name = newEventName.trim();
        if (!name) return;
        try {
            const token = Math.random().toString(36).substring(2, 10);
            const docRef = await addDoc(collection(db, 'events'), {
                name,
                passcode: '1234',
                token,
                is_active: true,
                current_announcement: '',
                created_at: serverTimestamp(),
            });
            const newEvent = { id: docRef.id, name, passcode: '1234', token, is_active: true, created_at: new Date() };
            setActiveEvent(newEvent);
            setViewMode('management');
            setIsCreateModalOpen(false);
            setNewEventName('');
        } catch (err) {
            console.error('Failed to create event:', err);
            alert('행사 생성에 실패했습니다.');
        }
    };

    const handleUpdateEvent = async (id: string, data: any) => {
        try {
            await updateDoc(doc(db, 'events', id), data);
            if (activeEvent?.id === id) {
                setActiveEvent((prev: any) => ({ ...prev, ...data }));
            }
        } catch (err) {
            console.error('Failed to update event:', err);
            alert('행사 업데이트에 실패했습니다.');
        }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!window.confirm('정말로 이 행사를 영구적으로 삭제하시겠습니까? 관련 된 모든 데이터가 사라집니다.')) return;
        try {
            await deleteDoc(doc(db, 'events', id));
            if (activeEvent?.id === id) {
                setViewMode('dashboard');
                setActiveEvent(null);
            }
        } catch (err) {
            console.error('Failed to delete event:', err);
        }
    };

    // ==========================================
    // Announcements (Firestore)
    // ==========================================

    const handleSendAnnouncement = async () => {
        if (!activeEvent || !announcement) return;
        try {
            // Update the event document with the announcement
            // Use the token as the doc ID for delegates to find
            // First update the event doc
            await updateDoc(doc(db, 'events', activeEvent.id), {
                current_announcement: announcement,
            });
            alert('공지가 발송되었습니다.');
            setAnnouncement('');
        } catch (err) {
            console.error('Failed to send announcement:', err);
            alert('공지 발송에 실패했습니다.');
        }
    };

    // ==========================================
    // File Operations (Firebase Storage + Firestore)
    // ==========================================

    const handleFileUpload = (file: File) => {
        if (!activeEvent) return;
        if (file.type !== 'application/pdf') {
            alert('PDF 파일만 업로드 가능합니다.');
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        const storageRef = ref(storage, `events/${activeEvent.id}/files/${Date.now()}_${file.name}`);
        const metadata = { cacheControl: 'public, max-age=31536000' };
        const uploadTask = uploadBytesResumable(storageRef, file, metadata);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                setUploadProgress(progress);
            },
            (error) => {
                console.error('Upload failed:', error);
                alert('파일 업로드에 실패했습니다.');
                setIsUploading(false);
            },
            async () => {
                // Upload complete → get CDN download URL
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                
                // Store file metadata in Firestore
                await addDoc(collection(db, 'files'), {
                    eventId: activeEvent.id,
                    title: file.name.replace('.pdf', ''),
                    url: downloadURL,
                    storage_path: storageRef.fullPath,
                    file_size: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
                    is_public: false,
                    published_at: serverTimestamp(),
                });

                setIsUploading(false);
                setUploadProgress(0);
            }
        );
    };

    const toggleFile = async (id: string, currentPublic: boolean) => {
        await updateDoc(doc(db, 'files', id), { is_public: !currentPublic });
    };

    const renameFile = async (id: string, oldTitle: string) => {
        const newTitle = prompt('새 파일 이름을 입력하세요', oldTitle);
        if (!newTitle || newTitle === oldTitle) return;
        await updateDoc(doc(db, 'files', id), { title: newTitle });
    };

    const deleteFile = async (id: string, storagePath?: string) => {
        if (!window.confirm('정말로 삭제하시겠습니까?')) return;
        try {
            // Delete from Storage if path exists
            if (storagePath) {
                try {
                    await deleteObject(ref(storage, storagePath));
                } catch (e) {
                    console.warn('Storage file may already be deleted:', e);
                }
            }
            // Delete metadata from Firestore
            await deleteDoc(doc(db, 'files', id));
        } catch (err) {
            console.error('Failed to delete file:', err);
        }
    };

    // ==========================================
    // Link Operations (Firestore)
    // ==========================================

    const addLink = async () => {
        const title = prompt('링크 제목을 입력하세요');
        const url = prompt('URL 주소를 입력하세요');
        if (!title || !url) return;
        await addDoc(collection(db, 'links'), {
            eventId: activeEvent.id,
            title,
            url,
            is_public: true,
            published_at: serverTimestamp(),
        });
    };

    const toggleLink = async (id: string, currentPublic: boolean) => {
        await updateDoc(doc(db, 'links', id), { is_public: !currentPublic });
    };

    const renameLink = async (id: string, oldTitle: string) => {
        const newTitle = prompt('새 링크 이름을 입력하세요', oldTitle);
        if (!newTitle || newTitle === oldTitle) return;
        await updateDoc(doc(db, 'links', id), { title: newTitle });
    };

    const deleteLink = async (id: string) => {
        if (!confirm('삭제할까요?')) return;
        await deleteDoc(doc(db, 'links', id));
    };

    // ==========================================
    // Vote Operations (Firestore)
    // ==========================================

    const addVote = async () => {
        const question = prompt('투표 안건을 입력하세요');
        if (!question) return;
        const type = confirm('다지선다 투표입니까? (취소 시 가/부 투표)') ? 'MULTIPLE' : 'YN';
        let options: string[] = [];
        if (type === 'MULTIPLE') {
            const optStr = prompt('선택지들을 콤마(,)로 구분하여 입력하세요 (예: 찬성,반대,기권)');
            if (!optStr) return;
            options = optStr.split(',').map(s => s.trim());
        } else {
            options = ['찬성', '반대'];
        }

        await addDoc(collection(db, 'votes'), {
            eventId: activeEvent.id,
            question,
            type,
            options: options.map((label, i) => ({ id: i + 1, label })),
            status: 'WAITING',
            show_results: false,
            voted_count: 0,
            created_at: serverTimestamp(),
        });
    };

    const updateVoteStatus = async (id: string, status: string) => {
        await updateDoc(doc(db, 'votes', id), { status });
    };

    const toggleVoteResults = async (id: string, show: boolean) => {
        await updateDoc(doc(db, 'votes', id), { show_results: show });
    };

    const deleteVote = async (id: string) => {
        if (!confirm('투표를 삭제할까요?')) return;
        await deleteDoc(doc(db, 'votes', id));
    };

    // ==========================================
    // QR Code / Share URL Generation (Client-side)
    // ==========================================
    
    const getJoinUrl = () => {
        if (!activeEvent?.token) return '';
        return `${window.location.origin}/join/${activeEvent.token}`;
    };

    // ==========================================
    // Dashboard View
    // ==========================================

    if (viewMode === 'dashboard') {
        const recentEvents = events.slice(0, 6);
        const pastEvents = events.slice(6);

        return (
            <div className="admin-dashboard">
                <header className="admin-header">
                    <div>
                        <h1 style={{ color: '#0f172a', marginBottom: '8px' }}>디지털 총회 관제 센터</h1>
                        <p style={{ fontSize: '0.85rem', color: '#1e3a8a', fontWeight: 'bold', marginBottom: '15px' }}>
                            v2.5.4-프리미엄 대비 UI 완전 적용 (2026.03.18)
                        </p>
                        <p style={{ color: '#334155', fontWeight: '500' }}>반갑습니다, 관리자님. 운영할 행사를 선택하거나 새로 추가해 주세요.</p>
                    </div>
                    <div className="stats-badge" style={{ background: '#1e3a8a', color: '#ffffff', border: '2px solid #000000' }}>
                        📡 Firebase 온라인 서비스
                    </div>
                </header>

                <main className="dashboard-content">
                    <section className="event-section">
                        <div className="section-header">
                            <h2>최근 행사</h2>
                            <button className="btn-add" onClick={() => setIsCreateModalOpen(true)}>+ 새 행사 추가</button>
                        </div>
                        <div className="event-grid">
                            {recentEvents.map(ev => (
                                <div key={ev.id} className="event-card">
                                    <div className="card-main" onClick={() => { setActiveEvent(ev); setViewMode('management'); }}>
                                        <div className="event-tag">RECENT</div>
                                        <h3>{ev.name}</h3>
                                        <p>{ev.created_at instanceof Timestamp ? ev.created_at.toDate().toLocaleDateString() : new Date(ev.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div className="card-actions">
                                        <button title="제목 변경" onClick={() => {
                                            const n = prompt('새 행사 이름을 입력하세요', ev.name);
                                            if (n && n !== ev.name) handleUpdateEvent(ev.id, { name: n });
                                        }}>✏️</button>
                                        <button title="비밀번호 변경" onClick={() => {
                                            const p = prompt('새 암호를 입력하세요', ev.passcode);
                                            if (p) handleUpdateEvent(ev.id, { passcode: p });
                                        }}>🔑</button>
                                        <button title="삭제" className="btn-card-del" onClick={() => handleDeleteEvent(ev.id)}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                            {events.length === 0 && (
                                <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
                                    아직 등록된 행사가 없습니다. "+ 새 행사 추가" 버튼을 눌러 시작하세요.
                                </div>
                            )}
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

                {/* Custom Create Event Modal */}
                {isCreateModalOpen && (
                    <div className="admin-modal-overlay">
                        <div className="admin-modal">
                            <h3>새로운 행사 추가</h3>
                            <p>생성할 행사의 이름을 입력해 주세요.</p>
                            <input 
                                type="text" 
                                autoFocus
                                placeholder="예: 2026년 정기 총회" 
                                value={newEventName}
                                onChange={(e) => setNewEventName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateEventSubmit(); }}
                            />
                            <div className="modal-actions">
                                <button className="btn-cancel" onClick={() => { setIsCreateModalOpen(false); setNewEventName(''); }}>취소</button>
                                <button className="btn-confirm" onClick={handleCreateEventSubmit}>생성하기</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Custom Passcode Change Modal */}
                {isPasscodeModalOpen && (
                    <div className="admin-modal-overlay">
                        <div className="admin-modal">
                            <h3>접속 비밀번호 변경</h3>
                            <p>대의원들이 로그인할 때 사용할 새 비밀번호를 입력해 주세요.</p>
                            <input 
                                type="text" 
                                autoFocus
                                placeholder="예: 4567" 
                                value={newPasscode}
                                onChange={(e) => setNewPasscode(e.target.value)}
                                onKeyDown={(e) => { 
                                    if (e.key === 'Enter' && newPasscode.trim()) {
                                        handleUpdateEvent(activeEvent.id, { passcode: newPasscode.trim() });
                                        setIsPasscodeModalOpen(false);
                                    } 
                                }}
                            />
                            <div className="modal-actions">
                                <button className="btn-cancel" onClick={() => { setIsPasscodeModalOpen(false); setNewPasscode(''); }}>취소</button>
                                <button className="btn-confirm" onClick={() => {
                                    if (newPasscode.trim()) {
                                        handleUpdateEvent(activeEvent.id, { passcode: newPasscode.trim() });
                                        setIsPasscodeModalOpen(false);
                                    }
                                }}>변경하기</button>
                            </div>
                        </div>
                    </div>
                )}

                <style>{dashboardStyles}</style>
            </div>
        );
    }

    // ==========================================
    // Management View Helpers
    // ==========================================
    const warmupFile = async (url: string, fileId: string) => {
        setIsWarmingUp(fileId);
        try {
            // Perform 5 concurrent fetches to "pull" the file into local edge nodes
            const warmups = Array.from({ length: 5 }).map(() => 
                fetch(url, { mode: 'no-cors', cache: 'reload' })
            );
            await Promise.all(warmups);
            alert('🔥 CDN 웜업 완료! 이제 모든 대의원이 순식간에 다운로드할 수 있습니다.');
        } catch (error) {
            console.error('Warmup failed:', error);
        } finally {
            setIsWarmingUp(null);
        }
    };

    const joinUrl = getJoinUrl();

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
                        <div className="status-pill connected">
                           ☁️ Firebase 실시간 연결됨
                        </div>
                        <p>토큰: <strong>{activeEvent?.token || 'N/A'}</strong></p>
                    </section>

                    <section className="share-tool">
                        <h3>🔗 접속 및 공유</h3>
                        <div className="test-url">
                            <label>대의원 접속 URL</label>
                            <input readOnly value={joinUrl} />
                            <div style={{ display: 'flex', gap: 5 }}>
                                <button onClick={() => {
                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                        navigator.clipboard.writeText(joinUrl)
                                            .then(() => alert('주소가 복사되었습니다.'))
                                            .catch(() => alert('복사 실패. 직접 복사해 주세요.'));
                                    }
                                }}>주소 복사</button>
                                <button onClick={() => window.open(joinUrl, '_blank')}>열기</button>
                            </div>
                        </div>
                        <div className="test-url" style={{ marginTop: '20px' }}>
                            <label>현재 접속 비밀번호 (패스코드)</label>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <input readOnly value={activeEvent?.passcode || '설정안됨'} style={{ flex: 1, fontWeight: '800', letterSpacing: '2px', textAlign: 'center', color: '#1e3a8a', fontSize: '1.2rem' }} />
                                <button onClick={() => {
                                    setNewPasscode(activeEvent?.passcode || '');
                                    setIsPasscodeModalOpen(true);
                                }} style={{ padding: '12px 20px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}>비밀번호 변경</button>
                            </div>
                        </div>
                    </section>
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

                        {/* Firebase Storage File Uploader */}
                        <div
                            className={`upload-zone`}
                            onDragOver={(e) => { e.preventDefault(); }}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                            }}
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.pdf';
                                input.onchange = (ev: any) => {
                                    if (ev.target.files?.[0]) handleFileUpload(ev.target.files[0]);
                                };
                                input.click();
                            }}
                        >
                            {isUploading ? (
                                <div className="progress-container">
                                    <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                                    <span>{uploadProgress}% 업로드 중... (Firebase Storage CDN)</span>
                                </div>
                            ) : (
                                <div className="upload-prompt">
                                    <span className="icon">📁</span>
                                    <p>여기에 파일을 드래그하여 올리거나 클릭하여 선택하세요.</p>
                                    <span className="sub">PDF 파일만 가능합니다. (Firebase Storage CDN으로 빠른 전송)</span>
                                </div>
                            )}
                        </div>

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
                                                <button onClick={() => renameFile(f.id, f.title)} title="이름 변경">✏️</button>
                                                <button 
                                                    onClick={() => toggleFile(f.id, f.is_public)}
                                                    className={f.is_public ? 'active' : ''}
                                                >
                                                    {f.is_public ? '중지' : '공개'}
                                                </button>
                                                <button 
                                                    className={`btn-warmup ${isWarmingUp === f.id ? 'pulsing' : ''}`}
                                                    onClick={() => warmupFile(f.url, f.id)}
                                                    disabled={isWarmingUp === f.id}
                                                    title="CDN 웜업 (에지 서버에 파일 미리 복사)"
                                                >
                                                    {isWarmingUp === f.id ? '⏳' : '🔥 웜업'}
                                                </button>
                                                <button className="del" onClick={() => deleteFile(f.id, f.storage_path)}>삭제</button>
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
                                                <button onClick={() => toggleLink(l.id, l.is_public)}>{l.is_public ? '중지' : '공개'}</button>
                                                <button className="del" onClick={() => deleteLink(l.id)}>삭제</button>
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
    .admin-dashboard { padding: 60px 20px; max-width: 1400px; margin: 0 auto; color: var(--text-main); }
    .admin-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 60px; animation: fadeInDown 0.6s ease-out; }
    @keyframes fadeInDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
    .admin-header h1 { font-size: 2.8rem; margin: 0; letter-spacing: -1px; }
    
    .stats-badge { 
      background: #1e3a8a !important; color: #ffffff !important; padding: 12px 24px; border-radius: 40px; 
      font-size: 0.95rem; font-weight: 800; display: flex; align-items: center; gap: 8px;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
      border: 2px solid #0f172a;
    }

    .event-section { margin-bottom: 60px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
    .section-header h2 { font-size: 1.8rem; margin: 0; position: relative; }
    .section-header h2::after { content: ''; display: block; width: 40px; height: 4px; background: #2563eb; margin-top: 8px; border-radius: 2px; }
    
    .btn-add { 
      background: #1e3a8a; color: #ffffff !important; border: none; padding: 14px 28px; border-radius: 12px; 
      font-weight: 700; cursor: pointer; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      box-shadow: 0 4px 15px rgba(30, 58, 138, 0.3);
    }
    .btn-add:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(30, 58, 138, 0.4); background: #1e40af; }

    .event-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 30px; }
    .event-card { 
      background: #ffffff; border-radius: 24px; border: 3px solid #0f172a; overflow: hidden; 
      box-shadow: 0 10px 30px rgba(0,0,0,0.1); transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      animation: fadeInUp 0.6s ease-out both;
    }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
    .event-card:hover { transform: translateY(-10px); box-shadow: 0 20px 40px rgba(0,0,0,0.15); border-color: #2563eb; }
    
    .card-main { padding: 35px; cursor: pointer; position: relative; background: #ffffff; }
    .event-tag { 
      font-size: 11px; font-weight: 800; color: #ffffff !important; background: #2563eb; 
      padding: 4px 12px; border-radius: 20px; margin-bottom: 20px; display: inline-block;
      text-transform: uppercase; letter-spacing: 1px;
    }
    .event-card h3 { margin: 0 0 12px; font-size: 1.5rem; line-height: 1.2; color: #0f172a; }
    .event-card p { margin: 0; color: #475569; font-size: 0.95rem; display: flex; align-items: center; gap: 6px; }
    
    .card-actions { 
      background: #f1f5f9; padding: 15px 25px; display: flex; gap: 12px; border-top: 2px solid #334155;
      justify-content: flex-end;
    }
    .card-actions button { 
      background: #ffffff; border: 2px solid #334155; border-radius: 10px; width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.2rem;
      transition: all 0.2s; color: #0f172a;
    }
    .card-actions button:hover { border-color: #1e3a8a; background: #1e3a8a; color: #ffffff !important; transform: scale(1.1); }
    .btn-card-del:hover { background: #be123c !important; border-color: #be123c !important; color: #ffffff !important; }

    .event-grid.past { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
    .event-card.mini { 
      padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; 
      cursor: pointer; border-radius: 16px; border: 2px solid #94a3b8; background: #ffffff; color: #0f172a;
    }
    .event-card.mini h3 { font-size: 1.1rem; margin: 0; }
    .btn-past-del { background: none; border: none; color: #94a3b8; font-size: 1.4rem; cursor: pointer; transition: color 0.2s; }
    .btn-past-del:hover { color: #be123c; }

    /* Modal Styles */
    .admin-modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999;
      background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.2s ease-out;
    }
    .admin-modal {
      background: #ffffff; width: 100%; max-width: 420px; border-radius: 24px; padding: 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 2px solid #1e3a8a;
      animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    
    .admin-modal h3 { margin: 0 0 10px; font-size: 1.4rem; color: #0f172a; }
    .admin-modal p { margin: 0 0 20px; font-size: 0.95rem; color: #475569; }
    .admin-modal input {
      width: 100%; padding: 14px 16px; border: 2px solid #cbd5e1; border-radius: 12px;
      font-size: 1.05rem; margin-bottom: 24px; box-sizing: border-box; outline: none; transition: 0.2s;
    }
    .admin-modal input:focus { border-color: #1e3a8a; box-shadow: 0 0 0 4px rgba(30, 58, 138, 0.1); }
    .modal-actions { display: flex; gap: 12px; justify-content: flex-end; }
    .modal-actions button { padding: 12px 24px; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 1rem; border: none; transition: 0.2s; }
    .btn-cancel { background: #f1f5f9; color: #475569; }
    .btn-cancel:hover { background: #e2e8f0; color: #0f172a; }
    .btn-confirm { background: #1e3a8a; color: #ffffff; }
    .btn-confirm:hover { background: #1e40af; }
`;

const managementStyles = `
    .admin-management { padding: 0; height: 100vh; display: flex; flex-direction: column; background: #f0f2f5; }
    .admin-header-nav { 
      background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(15px); padding: 20px 40px; 
      display: flex; align-items: center; border-bottom: 2px solid #334155; gap: 20px;
      z-index: 10; sticky top: 0;
    }
    .btn-back { background: #ffffff; border: 2px solid #334155; padding: 10px 20px; border-radius: 12px; font-weight: 600; color: #0f172a; cursor: pointer; transition: all 0.2s; }
    .btn-back:hover { background: #f1f5f9; }
    .admin-header-nav h1 { font-size: 1.6rem; margin: 0; flex: 1; letter-spacing: -0.5px; color: #0f172a; }
    .admin-header-nav h1 small { font-size: 0.9rem; color: #475569; font-weight: 500; margin-left: 15px; }
    .live-badge { background: #be123c; color: #ffffff; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px; letter-spacing: 1px; animation: pulse 2s infinite; }

    .management-grid { display: grid; grid-template-columns: 360px 1fr; flex: 1; overflow: hidden; }
    .mgmt-sidebar { background: #ffffff; border-right: 2px solid #334155; padding: 35px; overflow-y: auto; }
    .mgmt-content { padding: 40px 60px; overflow-y: auto; background: #f1f5f9; }

    .announcement-tool h3, .share-tool h3, .content-area h3 { font-size: 1.1rem; margin: 0 0 20px; font-weight: 800; color: #0f172a; }
    .announcement-tool textarea { 
      width: 100%; height: 140px; border: 2px solid #cbd5e1; border-radius: 16px; padding: 18px; 
      font-family: inherit; margin-bottom: 15px; box-sizing: border-box; font-size: 0.95rem;
      transition: border-color 0.2s; color: #0f172a; background: #ffffff;
    }
    .announcement-tool textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
    .btn-send { background: #1e3a8a; color: #ffffff; border: none; padding: 12px 20px; border-radius: 10px; font-weight: 700; width: 100%; cursor: pointer; transition: 0.2s; }
    .btn-send:hover { background: #1e40af; }
    
    .connection-integrity-card { 
      background: #f8fafc; border-radius: 20px; padding: 25px; margin-top: 30px; 
      border: 2px solid #cbd5e1; color: #0f172a;
    }
    .status-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 30px; font-weight: 800; font-size: 0.8rem; margin-bottom: 12px; }
    .status-pill.connected { background: #047857; color: #ffffff; }

    .share-tool { border-top: 2px solid #cbd5e1; margin-top: 30px; padding-top: 30px; }
    .test-url label { font-size: 0.85rem; color: #475569; display: block; margin-bottom: 8px; font-weight: 600; }
    .test-url input { 
      padding: 12px 16px; border: 2px solid #cbd5e1; border-radius: 12px; 
      font-size: 0.9rem; background: #e2e8f0; color: #0f172a; font-family: monospace; width: 100%; box-sizing: border-box;
    }
    .test-url .btn-group { display: flex; gap: 8px; margin-top: 10px; }
    .test-url .btn-group button { flex: 1; padding: 10px; background: #0f172a; color: #ffffff; border: none; border-radius: 10px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: 0.2s; }
    .test-url .btn-group button:hover { background: #334155; }

    .content-area { margin-bottom: 50px; }
    .area-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
    .area-header h3 { margin: 0; }
    .btn-vote, .btn-link { background: #1e3a8a; color: #ffffff; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; }
    .btn-vote:hover, .btn-link:hover { background: #1e40af; box-shadow: 0 4px 12px rgba(30,58,138,0.3); }
    
    /* Table Styling */
    .management-list { 
      background: #ffffff; border-radius: 20px; border: 2px solid #334155; 
      overflow: hidden; box-shadow: 0 8px 25px rgba(0,0,0,0.08);
    }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 20px 25px; background: #e2e8f0; border-bottom: 2px solid #334155; font-size: 0.85rem; color: #0f172a; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
    td { padding: 20px 25px; border-bottom: 1px solid #cbd5e1; vertical-align: middle; color: #0f172a; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #f8fafc; }
    tr:hover td { background: #f1f5f9; }

    .tag { padding: 6px 14px; border-radius: 30px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
    .tag.on { background: #dcfce7; color: #166534; }
    .tag.off { background: #e2e8f0; color: #475569; }
    
    .btn-group button { 
      background: #ffffff; border: 2px solid #cbd5e1; padding: 8px 16px; border-radius: 10px; 
      cursor: pointer; margin-right: 8px; font-size: 0.85rem; font-weight: 700; color: #0f172a;
      transition: all 0.2s;
    }
    .btn-group button:hover { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
    .btn-group button.del { color: #be123c; border-color: #fecdd3; }
    .btn-group button.del:hover { background: #be123c; color: #ffffff; border-color: #be123c; }

    .btn-warmup { 
        background: #fff7ed !important; color: #ea580c !important; border: 1px solid #fdba74 !important; 
        padding: 6px 12px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; margin-right: 8px;
    }
    .btn-warmup:hover { background: #ffedd5 !important; }
    .btn-warmup.pulsing { animation: pulseOrange 1s infinite alternate; }
    @keyframes pulseOrange { from { opacity: 0.6; } to { opacity: 1; } }


    .upload-zone {
        border: 3px dashed #3b82f6; border-radius: 20px; padding: 60px 40px; text-align: center;
        background: #ffffff; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); margin-bottom: 40px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.06); color: #0f172a;
    }
    .upload-zone:hover { border-color: #1e3a8a; background: #eff6ff; transform: scale(1.01); }
    .upload-prompt .icon { font-size: 48px; display: block; margin-bottom: 15px; }
    .upload-prompt p { margin: 0 0 8px; font-size: 1.15rem; font-weight: 800; color: #0f172a; }
    .upload-prompt .sub { font-size: 0.95rem; color: #475569; font-weight: 600; }
    
    .btn-toggle { background: #ffffff; border: 2px solid #cbd5e1; padding: 8px 16px; border-radius: 10px; cursor: pointer; margin-right: 8px; font-size: 0.85rem; font-weight: 700; color: #0f172a; transition: all 0.2s; }
    .btn-toggle:hover { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
    .active, .btn-toggle.active { background: #047857 !important; color: #ffffff !important; border-color: #047857 !important; padding: 8px 16px; border-radius: 10px; cursor: pointer; margin-right: 8px; font-weight: 700;}

`;
