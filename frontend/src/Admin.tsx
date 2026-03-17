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

    const handleCreateEvent = async () => {
        const name = prompt('새 행사 이름을 입력하세요');
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
        } catch (err) {
            console.error('Failed to create event:', err);
            alert('행사 생성에 실패했습니다.');
        }
    };

    const handleUpdateEvent = async (id: string, data: any) => {
        try {
            await updateDoc(doc(db, 'events', id), data);
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
        const uploadTask = uploadBytesResumable(storageRef, file);

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
                        <h1>디지털 총회 관제 센터</h1>
                        <p style={{ fontSize: '0.8rem', color: '#1a237e', opacity: 0.7, marginTop: '-5px', marginBottom: '10px' }}>
                            v2.5.0-FIREBASE 마이그레이션 완료 (2026.03.17)
                        </p>
                        <p>반갑습니다, 관리자님. 운영할 행사를 선택하거나 새로 추가해 주세요.</p>
                    </div>
                    <div className="stats-badge">
                        ☁️ Firebase 온라인 서비스
                    </div>
                </header>

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
                <style>{dashboardStyles}</style>
            </div>
        );
    }

    // ==========================================
    // Management View
    // ==========================================
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
                                                <button onClick={() => renameFile(f.id, f.title)}>✏️</button>
                                                <button onClick={() => toggleFile(f.id, f.is_public)}>{f.is_public ? '중지' : '공개'}</button>
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

    .share-tool { border-top: 1px solid #eee; margin-top: 20px; padding-top: 20px; }
    .test-url label { font-size: 0.8rem; color: #666; display: block; margin-bottom: 5px; }
    .test-url { display: flex; flex-direction: column; gap: 5px; }
    .test-url input { padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.8rem; background: #f8f9fa; }
    .test-url button { padding: 8px; background: #333; color: white; border: none; border-radius: 6px; cursor: pointer; }

    .area-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .btn-vote { background: #1a237e; color: white; border: none; padding: 8px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; }
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

    .upload-zone {
        border: 2px dashed #ccc; border-radius: 12px; padding: 40px; text-align: center;
        background: #f8f9fa; cursor: pointer; transition: all 0.3s ease; margin-bottom: 30px;
        position: relative; overflow: hidden;
    }
    .upload-zone:hover { border-color: #1a237e; background: #e8eaf6; }
    .upload-prompt .icon { font-size: 40px; display: block; margin-bottom: 10px; }
    .upload-prompt p { margin: 0; font-weight: 500; color: #333; }
    .upload-prompt .sub { font-size: 12px; color: #888; }
    .progress-container { width: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; }
    .progress-bar { height: 4px; background: #1a237e; position: absolute; bottom: 0; left: 0; transition: width 0.2s; }
`;
