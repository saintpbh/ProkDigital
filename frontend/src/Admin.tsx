import { useState, useEffect } from 'react';
import { db, storage } from './lib/firebase';
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, 
    query, orderBy, where, serverTimestamp, Timestamp, getDocs
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useModal, ModalDialog } from './components/ModalDialog';
import './styles/global.css';
import './styles/components.css';
import './styles/admin.css';

type ViewMode = 'dashboard' | 'management';

import AdminLogin from './AdminLogin';
import { firebaseService } from './services/firebaseService';

export default function Admin() {
    // Auth State
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loggedInAdminId, setLoggedInAdminId] = useState('');

    const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
    const [events, setEvents] = useState<any[]>([]);
    const [activeEvent, setActiveEvent] = useState<any>(null);
    const [allFiles, setAllFiles] = useState<any[]>([]);

    // Live Presence & Attendee Stats
    const [liveStats, setLiveStats] = useState({
        liveCount: 0,
        registeredCount: 0,
        standaloneCount: 0
    });
    const [allLinks, setAllLinks] = useState<any[]>([]);
    const [_votes, _setVotes] = useState<any[]>([]);
    const [schedules, setSchedules] = useState<any[]>([]);
    const [announcement, setAnnouncement] = useState('');
    
    // File upload state
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isWarmingUp, setIsWarmingUp] = useState<string | null>(null);

    // Modal state for Add Event
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newEventName, setNewEventName] = useState('');

    // Schedule Modals & Forms
    const [isScheduleListModalOpen, setIsScheduleListModalOpen] = useState(false);
    const [isScheduleFormModalOpen, setIsScheduleFormModalOpen] = useState(false);
    const [isBatchScheduleModalOpen, setIsBatchScheduleModalOpen] = useState(false);
    const [scheduleModalDayFilter, setScheduleModalDayFilter] = useState('ALL');
    const [batchScheduleText, setBatchScheduleText] = useState('');
    const [editingSchedule, setEditingSchedule] = useState<any>(null);
    const [scheduleForm, setScheduleForm] = useState({
        day: '1일차',
        time: '',
        title: '',
        location: '',
        description: ''
    });

    // Admin Auth & Account Modals
    const [isCreateAdminModalOpen, setIsCreateAdminModalOpen] = useState(false);
    const [newAdminUsername, setNewAdminUsername] = useState('');
    const [newAdminPassword, setNewAdminPassword] = useState('');

    // Generic Modal Hook
    const { modal, showAlert, showConfirm, showPrompt, close: closeModal } = useModal();

    // Restore saved view mode and auth session on mount
    useEffect(() => {
        const savedMode = localStorage.getItem('admin_viewMode') as ViewMode;
        if (savedMode) setViewMode(savedMode);
        
        const savedEventStr = localStorage.getItem('admin_activeEvent');
        if (savedEventStr) setActiveEvent(JSON.parse(savedEventStr));

        const savedAdmin = sessionStorage.getItem('digital_assembly_admin_id');
        if (savedAdmin) {
            setIsAuthenticated(true);
            setLoggedInAdminId(savedAdmin);
        }

        // [PWA Start URL Fix] Save admin path
        localStorage.setItem('pwa_start_path', '/admin');
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
        if (!isAuthenticated) return;
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
    }, [isAuthenticated, activeEvent]);

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

    // Listen to schedules for active event (real-time)
    useEffect(() => {
        if (!activeEvent) return;
        const q = query(collection(db, 'schedules'), where('eventId', '==', activeEvent.id));
        const unsub = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            items.sort((a: any, b: any) => {
                if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
                return (a.day || '').localeCompare(b.day || '') || (a.time || '').localeCompare(b.time || '');
            });
            setSchedules(items);
        });
        return () => unsub();
    }, [activeEvent?.id]);

    // Listen to live presence and registered attendee stats for active event (real-time)
    useEffect(() => {
        if (!activeEvent?.id) return;
        const unsub = firebaseService.subscribeToLiveStats(activeEvent.id, (stats) => {
            setLiveStats(stats);
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
            showAlert('행사 생성에 실패했습니다.');
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
            showAlert('행사 업데이트에 실패했습니다.');
        }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!(await showConfirm('행사 삭제', '정말로 이 행사를 영구적으로 삭제하시겠습니까? 관련된 모든 데이터가 사라집니다.'))) return;
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
            await updateDoc(doc(db, 'events', activeEvent.id), {
                current_announcement: announcement.trim(),
                current_announcement_ts: Date.now(),
            });
            showAlert('공지가 발송되었습니다.');
            setAnnouncement('');
        } catch (err) {
            console.error('Failed to send announcement:', err);
            showAlert('공지 발송에 실패했습니다.');
        }
    };

    // ==========================================
    // File Operations & CDN Warmup
    // ==========================================

    const warmupFile = async (url: string, fileId: string, silent = false) => {
        setIsWarmingUp(fileId);
        try {
            // Perform concurrent fetches to pull file into edge caches
            const warmups = Array.from({ length: 5 }).map(() => 
                fetch(url, { mode: 'no-cors', cache: 'reload' })
            );
            await Promise.all(warmups);
            if (!silent) {
                showAlert('🔥 CDN 웜업 완료!', '에지 서버 캐싱이 완료되어 모든 대의원이 지연 없이 즉시 열람할 수 있습니다.');
            }
        } catch (error) {
            console.error('Warmup failed:', error);
        } finally {
            setIsWarmingUp(null);
        }
    };

    const handleFileUpload = (file: File) => {
        if (!activeEvent) return;
        if (file.type !== 'application/pdf') {
            showAlert('PDF 파일만 업로드 가능합니다.');
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
                showAlert('파일 업로드에 실패했습니다.');
                setIsUploading(false);
            },
            async () => {
                // Upload complete → get CDN download URL
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                
                // Store file metadata in Firestore
                const newDocRef = await addDoc(collection(db, 'files'), {
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

                // Auto-warmup CDN immediately upon upload
                warmupFile(downloadURL, newDocRef.id, true);
                showAlert('업로드 완료 (자동 웜업됨)', `[${file.name}] 업로드가 완료되었습니다.\n기본 [공유 대기] 상태이며, [공유하기] 버튼을 누르면 총대들에게 즉시 공유됩니다.`);
            }
        );
    };

    // ==========================================
    // Schedule Operations (Firestore)
    // ==========================================

    const openAddScheduleModal = () => {
        setEditingSchedule(null);
        setScheduleForm({ day: '1일차', time: '', title: '', location: '', description: '' });
        setIsScheduleFormModalOpen(true);
    };

    const openEditScheduleModal = (item: any) => {
        setEditingSchedule(item);
        setScheduleForm({
            day: item.day || '1일차',
            time: item.time || '',
            title: item.title || '',
            location: item.location || '',
            description: item.description || ''
        });
        setIsScheduleFormModalOpen(true);
    };

    const handleSaveScheduleSubmit = async () => {
        if (!activeEvent?.id) return;
        if (!scheduleForm.title.trim()) {
            showAlert('일정명을 입력해 주세요.');
            return;
        }
        try {
            if (editingSchedule) {
                await updateDoc(doc(db, 'schedules', editingSchedule.id), {
                    day: scheduleForm.day.trim(),
                    time: scheduleForm.time.trim(),
                    title: scheduleForm.title.trim(),
                    location: scheduleForm.location.trim(),
                    description: scheduleForm.description.trim(),
                    updated_at: serverTimestamp()
                });
                showAlert('일정 수정 완료', '일정이 성공적으로 수정되었습니다.');
            } else {
                await addDoc(collection(db, 'schedules'), {
                    eventId: activeEvent.id,
                    day: scheduleForm.day.trim(),
                    time: scheduleForm.time.trim(),
                    title: scheduleForm.title.trim(),
                    location: scheduleForm.location.trim(),
                    description: scheduleForm.description.trim(),
                    is_current: false,
                    order: schedules.length + 1,
                    created_at: serverTimestamp()
                });
                showAlert('일정 등록 완료', '새 일정이 등록되었습니다.');
            }
            setIsScheduleFormModalOpen(false);
        } catch (err) {
            console.error('Failed to save schedule:', err);
            showAlert('일정 저장에 실패했습니다.');
        }
    };

    const toggleCurrentSchedule = async (id: string, currentStatus: boolean) => {
        if (!activeEvent?.id) return;
        try {
            if (!currentStatus) {
                for (const s of schedules) {
                    if (s.is_current && s.id !== id) {
                        await updateDoc(doc(db, 'schedules', s.id), { is_current: false });
                    }
                }
            }
            await updateDoc(doc(db, 'schedules', id), { is_current: !currentStatus });
            showAlert(
                !currentStatus ? '현재 진행 일정 설정' : '현재 진행 일정 해제',
                !currentStatus ? '해당 일정이 대의원 화면에 [진행 중(NOW)]으로 강조 표시됩니다.' : '진행 중 표시가 해제되었습니다.'
            );
        } catch (err) {
            console.error('Failed to toggle current schedule:', err);
        }
    };

    const deleteSchedule = async (id: string) => {
        if (!(await showConfirm('일정 삭제', '이 일정을 삭제하시겠습니까?'))) return;
        try {
            await deleteDoc(doc(db, 'schedules', id));
        } catch (err) {
            console.error('Failed to delete schedule:', err);
            showAlert('일정 삭제에 실패했습니다.');
        }
    };

    const handleBatchScheduleSubmit = async () => {
        if (!activeEvent?.id || !batchScheduleText.trim()) return;
        const lines = batchScheduleText.trim().split('\n');
        let count = 0;
        try {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                let parts: string[] = [];
                if (line.includes('|')) parts = line.split('|').map(s => s.trim());
                else if (line.includes('\t')) parts = line.split('\t').map(s => s.trim());
                else if (line.includes(',')) parts = line.split(',').map(s => s.trim());
                else parts = [line];

                const day = parts[0] || '1일차';
                const time = parts[1] || '';
                const title = parts[2] || parts[0];
                const location = parts[3] || '';
                const description = parts[4] || '';

                await addDoc(collection(db, 'schedules'), {
                    eventId: activeEvent.id,
                    day,
                    time,
                    title,
                    location,
                    description,
                    is_current: false,
                    order: schedules.length + count + 1,
                    created_at: serverTimestamp()
                });
                count++;
            }
            setIsBatchScheduleModalOpen(false);
            setBatchScheduleText('');
            showAlert('일괄 등록 완료', `${count}개의 일정이 성공적으로 등록되었습니다.`);
        } catch (err) {
            console.error('Batch schedule error:', err);
            showAlert('일정 일괄 등록 중 오류가 발생했습니다.');
        }
    };

    const toggleFile = async (id: string, currentPublic: boolean) => {
        try {
            const nextPublic = !currentPublic;
            await updateDoc(doc(db, 'files', id), { 
                is_public: nextPublic,
                published_at: serverTimestamp() 
            });
            if (nextPublic) {
                showAlert('문서 공유 시작', '문서가 모든 대의원의 모바일 화면에 실시간으로 공유되었습니다.');
            } else {
                showAlert('문서 공유 중지', '문서 공유가 중지되었습니다. 대의원 화면에서 숨겨집니다.');
            }
        } catch (err) {
            console.error('Failed to toggle file sharing:', err);
            showAlert('공유 상태 변경에 실패했습니다.');
        }
    };

    const renameFile = async (id: string, oldTitle: string) => {
        const newTitle = await showPrompt('새 파일 이름을 입력하세요', oldTitle);
        if (!newTitle || newTitle === oldTitle) return;
        await updateDoc(doc(db, 'files', id), { title: newTitle });
    };

    const deleteFile = async (id: string, storagePath?: string) => {
        if (!(await showConfirm('파일 삭제', '정말로 삭제하시겠습니까?'))) return;
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
        const title = await showPrompt('링크 제목을 입력하세요');
        if (!title) return;
        const url = await showPrompt('URL 주소를 입력하세요');
        if (!url) return;
        await addDoc(collection(db, 'links'), {
            eventId: activeEvent.id,
            title,
            url,
            is_public: false,
            published_at: serverTimestamp(),
        });
        showAlert('링크 추가 완료', '새 링크가 [공유 대기] 상태로 추가되었습니다. [공유하기] 버튼을 누르면 대의원 화면에 즉시 노출됩니다.');
    };

    const toggleLink = async (id: string, currentPublic: boolean) => {
        try {
            const nextPublic = !currentPublic;
            await updateDoc(doc(db, 'links', id), { 
                is_public: nextPublic,
                published_at: serverTimestamp() 
            });
            if (nextPublic) {
                showAlert('링크 공유 시작', '링크가 모든 대의원 화면에 실시간으로 노출됩니다.');
            } else {
                showAlert('링크 공유 중지', '링크 공유가 중지되었습니다.');
            }
        } catch (err) {
            console.error('Failed to toggle link sharing:', err);
            showAlert('공유 상태 변경에 실패했습니다.');
        }
    };

    const renameLink = async (id: string, oldTitle: string) => {
        const newTitle = await showPrompt('새 링크 이름을 입력하세요', oldTitle);
        if (!newTitle || newTitle === oldTitle) return;
        await updateDoc(doc(db, 'links', id), { title: newTitle });
    };

    const deleteLink = async (id: string) => {
        if (!(await showConfirm('링크 삭제', '삭제할까요?'))) return;
        await deleteDoc(doc(db, 'links', id));
    };

    // ==========================================
    // Vote Operations (Firestore) - Commented out
    // ==========================================
    /*
    const addVote = async () => { ... };
    const updateVoteStatus = async (id: string, status: string) => { ... };
    const toggleVoteResults = async (id: string, show: boolean) => { ... };
    const deleteVote = async (id: string) => { ... };
    */

    // ==========================================
    // QR Code / Share URL Generation (Client-side)
    // ==========================================
    
    const CUSTOM_DOMAIN = 'https://digital.prok.or.kr';

    const getJoinUrl = () => {
        return CUSTOM_DOMAIN;
    };

    const getFallbackJoinUrl = () => {
        if (!activeEvent?.token) return '';
        return `${window.location.origin}/join/${activeEvent.token}`;
    };

    const getQrCodeUrl = (url: string, size = 280) => {
        return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&margin=8&format=svg`;
    };

    // ==========================================
    // Dashboard View
    // ==========================================

    const handleLoginSuccess = (username: string) => {
        sessionStorage.setItem('digital_assembly_admin_id', username);
        setLoggedInAdminId(username);
        setIsAuthenticated(true);
    };

    const handleLogout = () => {
        sessionStorage.removeItem('digital_assembly_admin_id');
        setIsAuthenticated(false);
        setLoggedInAdminId('');
    };

    const handleUpdateAdminPassword = async (username: string) => {
        const newPass = await showPrompt('비밀번호 변경', '', `[${username}] 계정의 새 비밀번호를 입력하세요:`);
        if (newPass !== null && newPass.trim()) {
            try {
                const q = query(collection(db, 'admins'), where('username', '==', username));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const docId = snap.docs[0].id;
                    await updateDoc(doc(db, 'admins', docId), { password: newPass.trim() });
                    showAlert('비밀번호가 성공적으로 변경되었습니다.');
                }
            } catch (e) {
                console.error(e);
                showAlert('비밀번호 변경 중 오류가 발생했습니다.');
            }
        }
    };

    const handleCreateNewAdminSubmit = async () => {
        if (!newAdminUsername.trim() || !newAdminPassword.trim()) return;
        try {
            const q = query(collection(db, 'admins'), where('username', '==', newAdminUsername.trim()));
            const snap = await getDocs(q);
            if (!snap.empty) {
                showAlert('이미 존재하는 관리자 아이디입니다.');
                return;
            }
            await addDoc(collection(db, 'admins'), {
                username: newAdminUsername.trim(),
                password: newAdminPassword.trim(),
                role: 'manager',
                created_at: serverTimestamp(),
            });
            showAlert(`새 관리자 계정(${newAdminUsername.trim()})이 발급되었습니다.`);
            setIsCreateAdminModalOpen(false);
            setNewAdminUsername('');
            setNewAdminPassword('');
        } catch(e) {
            console.error(e);
            showAlert('관리자 생성 실패');
        }
    };

    if (!isAuthenticated) {
        return <AdminLogin onLogin={handleLoginSuccess} />;
    }

    if (viewMode === 'dashboard') {
        const recentEvents = events.slice(0, 6);
        const pastEvents = events.slice(6);

        return (
            <>
            <div className="admin-dashboard">
                <header className="admin-header">
                    <div className="admin-brand-group">
                        <img src="/prok-logo.png" alt="기장 로고" className="admin-logo-img" />
                        <div>
                            <h1>디지털 총회 관제 센터</h1>
                            <p className="version-tag">
                                한국기독교장로회 총회 관리 시스템
                            </p>
                            <p className="welcome-text">반갑습니다, 관리자님. 운영할 행사를 선택하거나 새로 추가해 주세요.</p>
                        </div>
                    </div>
                    <div className="stats-badge">
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
                                        <button title="제목 변경" onClick={async () => {
                                            const n = await showPrompt('새 행사 이름을 입력하세요', ev.name);
                                            if (n && n !== ev.name) handleUpdateEvent(ev.id, { name: n });
                                        }}>✏️</button>
                                        <button title="비밀번호 변경" onClick={async () => {
                                            const p = await showPrompt('접속 비밀번호 변경', ev.passcode || '', '새 접속 비밀번호를 입력해 주세요. 변경 즉시 접속 중인 모든 대의원이 실시간으로 원격 로그아웃됩니다.');
                                            if (p !== null && p.trim()) {
                                                const trimmed = p.trim();
                                                const newVersion = Date.now();
                                                await handleUpdateEvent(ev.id, { 
                                                    passcode: trimmed,
                                                    session_version: newVersion,
                                                    passcode_updated_at: newVersion 
                                                });
                                                showAlert('비밀번호 변경 완료', `[${ev.name}] 행사의 접속 비밀번호가 [${trimmed}](으)로 변경되었습니다.\n접속 중인 모든 대의원이 실시간으로 원격 로그아웃되었습니다.`);
                                            }
                                        }}>🔑</button>
                                        <button title="삭제" className="btn-card-del" onClick={() => handleDeleteEvent(ev.id)}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                            {events.length === 0 && (
                                <div className="empty-state">
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

                    <section className="event-section security-section">
                        <div className="section-header">
                            <h2>보안 및 계정 관리</h2>
                        </div>
                        <div className="admin-account-panel">
                            <div>
                                <h3>접속 중인 계정: <span className="account-highlight">{loggedInAdminId}</span></h3>
                                <p>주기적으로 비밀번호를 변경하여 시스템 보안을 철저히 유지하세요.</p>
                            </div>
                            <div className="account-actions">
                                <button className="btn-primary" onClick={() => handleUpdateAdminPassword(loggedInAdminId)}>내 비밀번호 변경</button>
                                <button className="btn-secondary" onClick={() => setIsCreateAdminModalOpen(true)}>새 관리자 발급</button>
                                <button className="btn-danger" onClick={handleLogout}>시스템 로그아웃</button>
                            </div>
                        </div>
                    </section>
                </main>

                {/* Custom Create Event Modal */}
                {isCreateModalOpen && (
                    <div className="admin-modal-overlay">
                        <div className="admin-modal">
                            <h3>새 행사 생성</h3>
                            <p>생성할 행사의 공식 명칭을 입력하세요.</p>
                            <input 
                                type="text" 
                                autoFocus
                                placeholder="예: 제111회 기장 총회" 
                                value={newEventName}
                                onChange={(e) => setNewEventName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateEventSubmit(); }}
                            />
                            <div className="modal-actions">
                                <button className="btn-cancel" onClick={() => setIsCreateModalOpen(false)}>취소</button>
                                <button className="btn-confirm" onClick={handleCreateEventSubmit}>생성하기</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Create Sub-Admin Modal */}
                {isCreateAdminModalOpen && (
                    <div className="admin-modal-overlay">
                        <div className="admin-modal">
                            <h3>서브 관리자 계정 발급</h3>
                            <p>발급할 서브 관리자의 접속 아이디와 초기 비밀번호를 설정하세요.</p>
                            <input 
                                type="text" 
                                autoFocus
                                placeholder="[새 일회용 아이디] 예: sub_admin" 
                                value={newAdminUsername}
                                onChange={(e) => setNewAdminUsername(e.target.value)}
                            />
                            <input 
                                type="text" 
                                placeholder="[초기 접속 비밀번호] 예: 0000" 
                                value={newAdminPassword}
                                onChange={(e) => setNewAdminPassword(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNewAdminSubmit(); }}
                            />
                            <div className="modal-actions">
                                <button className="btn-cancel" onClick={() => { setIsCreateAdminModalOpen(false); setNewAdminUsername(''); setNewAdminPassword(''); }}>취소</button>
                                <button className="btn-confirm" onClick={handleCreateNewAdminSubmit}>즉시 발급하기</button>
                            </div>
                        </div>
                    </div>
                )}


            </div>
            <ModalDialog modal={modal} onClose={closeModal} />
            </>
        );
    }

    const joinUrl = getJoinUrl();

    return (
        <>
        <div className="admin-management">
            <header className="admin-header-nav">
                <div className="header-nav-left">
                    <button className="btn-back" onClick={() => setViewMode('dashboard')}>← 대시보드로</button>
                    <h1>{activeEvent.name} <small>관리 모드</small></h1>
                </div>

                <div className="header-live-stats-bar">
                    <div className="stat-pill live" title="최근 60초 이내 활동 중인 실시간 접속자 수">
                        <span className="live-dot-pulse"></span>
                        <span className="stat-label">현재 실시간 접속</span>
                        <strong className="stat-val">{liveStats.liveCount}명</strong>
                    </div>

                    <div className="stat-pill registered" title="비밀번호를 입력하고 입장한 총 로그인(등록) 인원">
                        <span className="stat-icon">👥</span>
                        <span className="stat-label">로그인 완료(등록)</span>
                        <strong className="stat-val">{liveStats.registeredCount}명</strong>
                        {liveStats.standaloneCount > 0 && (
                            <span className="stat-sub">(앱설치 {liveStats.standaloneCount}명)</span>
                        )}
                    </div>

                    <div className="live-badge">LIVE</div>
                </div>
            </header>

            <div className="management-grid">
                <aside className="mgmt-sidebar">
                    <section className="announcement-tool">
                        <h3>실시간 공지 발송</h3>
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

                        <div className="qr-code-area">
                            <img 
                                src={getQrCodeUrl(joinUrl)} 
                                alt="QR Code" 
                                className="qr-code-img"
                            />
                            <p className="qr-caption">대의원 접속용 QR 코드</p>
                        </div>

                        <div className="test-url">
                            <label>대의원 접속 URL (고정 도메인)</label>
                            <input readOnly value={joinUrl} />
                            <div className="btn-group">
                                <button onClick={() => {
                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                        navigator.clipboard.writeText(joinUrl)
                                            .then(() => showAlert('주소가 복사되었습니다.'))
                                            .catch(() => showAlert('복사 실패. 직접 복사해 주세요.'));
                                    }
                                }}>주소 복사</button>
                                <button onClick={() => window.open(joinUrl, '_blank')}>열기</button>
                            </div>
                        </div>
                        <div className="test-url fallback-url">
                            <label>직접 접속 URL (토큰 기반)</label>
                            <input readOnly value={getFallbackJoinUrl()} />
                        </div>
                        <div className="test-url passcode-section">
                            <label>현재 접속 비밀번호 (패스코드)</label>
                            <div className="passcode-display">
                                <input className="passcode-input" readOnly value={activeEvent?.passcode || '설정안됨'} />
                                <button className="btn-primary" onClick={async () => {
                                    if (!activeEvent?.id) return;
                                    const p = await showPrompt(
                                        '접속 비밀번호 변경', 
                                        activeEvent.passcode || '', 
                                        '새 접속 비밀번호를 입력해 주세요. [확인]을 누르면 접속 중인 모든 대의원이 화면 새로고침 없이 즉시 원격 로그아웃됩니다.'
                                    );
                                    if (p !== null && p.trim()) {
                                        const trimmed = p.trim();
                                        const newVersion = Date.now();
                                        await handleUpdateEvent(activeEvent.id, { 
                                            passcode: trimmed, 
                                            session_version: newVersion,
                                            passcode_updated_at: newVersion 
                                        });
                                        showAlert('비밀번호 변경 완료', `접속 비밀번호가 [${trimmed}](으)로 변경되었습니다.\n접속 중인 모든 대의원 화면이 실시간으로 원격 로그아웃되었습니다.`);
                                    }
                                }}>비밀번호 변경</button>
                                <button className="btn-force-logout" onClick={async () => {
                                    if (!activeEvent?.id) return;
                                    if (await showConfirm('전체 원격 로그아웃', '접속 중인 모든 대의원을 화면 새로고침 없이 즉시 원격 로그아웃시키겠습니까?')) {
                                        const newVersion = Date.now();
                                        await handleUpdateEvent(activeEvent.id, { 
                                            session_version: newVersion,
                                            passcode_updated_at: newVersion 
                                        });
                                        showAlert('원격 로그아웃 완료', '모든 대의원 화면이 즉시 원격 로그아웃되었습니다. 다시 접속하려면 비밀번호를 다시 입력해야 합니다.');
                                    }
                                }} title="모든 대의원 화면 즉시 원격 로그아웃">⚡ 전체 원격 로그아웃</button>
                            </div>
                        </div>
                    </section>
                </aside>

                <main className="mgmt-content">
                    {/* 📅 Compact Schedule Management Summary Card (Opens Modal) */}
                    <section className="content-area schedule-summary-area">
                        <div className="schedule-summary-card">
                            <div className="summary-left">
                                <div className="summary-icon-wrap">📅</div>
                                <div className="summary-text-group">
                                    <div className="summary-title-row">
                                        <h4>총회 회무 일정 관리</h4>
                                        <span className="summary-count-badge">총 {schedules.length}개 등록됨</span>
                                    </div>
                                    <div className="summary-status-text">
                                        {(() => {
                                            const currentItem = schedules.find(s => s.is_current);
                                            if (currentItem) {
                                                return (
                                                    <span className="status-item-live">
                                                        현재 진행 중: <strong className="now-title-tag">🟢 [{currentItem.day}] {currentItem.title}</strong>
                                                        {currentItem.time && <span className="now-time-tag">({currentItem.time})</span>}
                                                    </span>
                                                );
                                            }
                                            return <span className="text-muted">현재 진행 중(NOW)으로 설정된 일정이 없습니다.</span>;
                                        })()}
                                    </div>
                                </div>
                            </div>
                            <div className="summary-actions">
                                <button className="btn-secondary" onClick={() => setIsBatchScheduleModalOpen(true)}>⚡ 간편 일괄 등록</button>
                                <button className="btn-secondary" onClick={openAddScheduleModal}>+ 새 일정 추가</button>
                                <button className="btn-primary btn-open-schedule-modal" onClick={() => setIsScheduleListModalOpen(true)}>
                                    📅 일정 전체 관리 / 수정 (팝업) 〉
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Vote Management - Currently Hidden as requested */}
                    {/*
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
                                    {votes.length === 0 && <tr><td colSpan={4} className="empty-state">생성된 투표가 없습니다.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>
                    */}

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
                                    <span className="sub">PDF 파일만 가능합니다. (업로드 시 자동으로 에지 CDN 웜업이 실행됩니다)</span>
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
                                            <td><strong>{f.title}</strong></td>
                                            <td><span className="file-type-badge">PDF</span></td>
                                            <td>
                                                <span className={`tag ${f.is_public ? 'on' : 'off'}`}>
                                                    {f.is_public ? '공유중' : '공유 대기'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="btn-group">
                                                    <button onClick={() => renameFile(f.id, f.title)} title="이름 변경">✏️</button>
                                                    {f.is_public ? (
                                                        <button 
                                                            onClick={() => toggleFile(f.id, true)}
                                                            className="btn-share-stop"
                                                            title="모바일 공유 중지 (대의원 화면에서 숨김)"
                                                        >
                                                            공유 중지
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => toggleFile(f.id, false)}
                                                            className="btn-share-start"
                                                            title="모바일 즉시 공유 (대의원 화면에 노출)"
                                                        >
                                                            공유하기
                                                        </button>
                                                    )}
                                                    <button 
                                                        className={`btn-warmup ${isWarmingUp === f.id ? 'pulsing' : ''}`}
                                                        onClick={() => warmupFile(f.url, f.id)}
                                                        disabled={isWarmingUp === f.id}
                                                        title="CDN 웜업 (에지 서버에 파일 미리 복사)"
                                                    >
                                                        {isWarmingUp === f.id ? '⏳' : '🔥 웜업'}
                                                    </button>
                                                    <button className="del" onClick={() => deleteFile(f.id, f.storage_path)}>삭제</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {allLinks.map(l => (
                                        <tr key={l.id}>
                                            <td><strong>{l.title}</strong></td>
                                            <td><span className="file-type-badge link">LINK</span></td>
                                            <td>
                                                <span className={`tag ${l.is_public ? 'on' : 'off'}`}>
                                                    {l.is_public ? '공유중' : '공유 대기'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="btn-group">
                                                    <button onClick={() => renameLink(l.id, l.title)}>✏️</button>
                                                    {l.is_public ? (
                                                        <button 
                                                            onClick={() => toggleLink(l.id, true)}
                                                            className="btn-share-stop"
                                                            title="공유 중지 (대의원 화면에서 숨김)"
                                                        >
                                                            공유 중지
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => toggleLink(l.id, false)}
                                                            className="btn-share-start"
                                                            title="대의원 화면에 즉시 공유"
                                                        >
                                                            공유하기
                                                        </button>
                                                    )}
                                                    <button className="del" onClick={() => deleteLink(l.id)}>삭제</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
        </div>

        {/* 📅 Schedule Management List Popup Modal (Full Schedule Table) */}
        {isScheduleListModalOpen && (
            <div className="admin-modal-overlay schedule-list-modal-overlay" onClick={() => setIsScheduleListModalOpen(false)}>
                <div className="admin-modal schedule-list-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="schedule-modal-header">
                        <div>
                            <h3>📅 총회 회무 일정 관리 (전체 목록)</h3>
                            <p className="modal-subtitle">
                                각 일정의 <strong>[진행 중 (NOW)]</strong> 버튼을 누르면 대의원 모바일 화면에 실시간으로 강조 배지가 표시됩니다.
                            </p>
                        </div>
                        <div className="modal-header-actions">
                            <button className="btn-secondary" onClick={() => setIsBatchScheduleModalOpen(true)}>⚡ 간편 일괄 등록</button>
                            <button className="btn-primary" onClick={openAddScheduleModal}>+ 새 일정 추가</button>
                            <button className="btn-close-modal-x" onClick={() => setIsScheduleListModalOpen(false)}>✕</button>
                        </div>
                    </div>

                    {/* Day Filter Pills */}
                    <div className="schedule-filter-tabs">
                        {['ALL', '1일차', '2일차', '3일차'].map(day => (
                            <button 
                                key={day} 
                                className={`filter-tab-btn ${scheduleModalDayFilter === day ? 'active' : ''}`}
                                onClick={() => setScheduleModalDayFilter(day)}
                            >
                                {day === 'ALL' ? `전체 일정 (${schedules.length})` : `${day} (${schedules.filter(s => s.day === day).length})`}
                            </button>
                        ))}
                    </div>

                    {/* Schedule List Table */}
                    <div className="schedule-modal-table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>일차</th>
                                    <th>시간</th>
                                    <th>일정명 및 비고</th>
                                    <th>장소</th>
                                    <th>진행 상태 (대의원 실시간 연동)</th>
                                    <th>제어</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(scheduleModalDayFilter === 'ALL' ? schedules : schedules.filter(s => s.day === scheduleModalDayFilter)).map(s => (
                                    <tr key={s.id} className={s.is_current ? 'row-current-highlight' : ''}>
                                        <td><span className="day-badge">{s.day}</span></td>
                                        <td><span className="time-badge">{s.time || '-'}</span></td>
                                        <td>
                                            <strong>{s.title}</strong>
                                            {s.description && <div className="sub-desc">{s.description}</div>}
                                        </td>
                                        <td><span className="loc-badge">{s.location || '-'}</span></td>
                                        <td>
                                            <button 
                                                className={`btn-status-toggle ${s.is_current ? 'is-now' : ''}`}
                                                onClick={() => toggleCurrentSchedule(s.id, s.is_current)}
                                                title="클릭 시 대의원 화면에 현재 진행 중(NOW)으로 강조 표시"
                                            >
                                                {s.is_current ? '🟢 진행 중 (NOW)' : '대기'}
                                            </button>
                                        </td>
                                        <td>
                                            <div className="btn-group">
                                                <button onClick={() => openEditScheduleModal(s)} title="수정">✏️</button>
                                                <button className="del" onClick={() => deleteSchedule(s.id)}>삭제</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {schedules.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="empty-state">
                                            등록된 일정이 없습니다. [+ 새 일정 추가] 또는 [⚡ 간편 일괄 등록] 버튼을 눌러 일정을 등록하세요.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="schedule-modal-footer">
                        <span className="footer-count-text">총 {schedules.length}건 등록됨</span>
                        <button className="btn-confirm" onClick={() => setIsScheduleListModalOpen(false)}>완료 / 닫기</button>
                    </div>
                </div>
            </div>
        )}

        {/* Schedule Add / Edit Modal (Single Item Form) */}
        {isScheduleFormModalOpen && (
            <div className="admin-modal-overlay">
                <div className="admin-modal schedule-modal">
                    <h3>{editingSchedule ? '일정 수정' : '새 일정 추가'}</h3>
                    <div className="modal-form-group">
                        <label>일차 / 날짜</label>
                        <input 
                            type="text" 
                            placeholder="예: 1일차, 2일차 또는 9/22(화)" 
                            value={scheduleForm.day} 
                            onChange={(e) => setScheduleForm(prev => ({ ...prev, day: e.target.value }))}
                        />
                    </div>
                    <div className="modal-form-group">
                        <label>시간</label>
                        <input 
                            type="text" 
                            placeholder="예: 14:00 - 15:30" 
                            value={scheduleForm.time} 
                            onChange={(e) => setScheduleForm(prev => ({ ...prev, time: e.target.value }))}
                        />
                    </div>
                    <div className="modal-form-group">
                        <label>일정명 *</label>
                        <input 
                            type="text" 
                            autoFocus
                            placeholder="예: 개회예배 및 성찬예식" 
                            value={scheduleForm.title} 
                            onChange={(e) => setScheduleForm(prev => ({ ...prev, title: e.target.value }))}
                        />
                    </div>
                    <div className="modal-form-group">
                        <label>장소</label>
                        <input 
                            type="text" 
                            placeholder="예: 본회의장, 식당, 분과회의실" 
                            value={scheduleForm.location} 
                            onChange={(e) => setScheduleForm(prev => ({ ...prev, location: e.target.value }))}
                        />
                    </div>
                    <div className="modal-form-group">
                        <label>비고 / 설명 (선택)</label>
                        <input 
                            type="text" 
                            placeholder="예: 설교: 총회장, 준비위원 참석 요망" 
                            value={scheduleForm.description} 
                            onChange={(e) => setScheduleForm(prev => ({ ...prev, description: e.target.value }))}
                        />
                    </div>
                    <div className="modal-actions">
                        <button className="btn-cancel" onClick={() => setIsScheduleFormModalOpen(false)}>취소</button>
                        <button className="btn-confirm" onClick={handleSaveScheduleSubmit}>
                            {editingSchedule ? '수정 완료' : '일정 등록'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Batch Schedule Modal */}
        {isBatchScheduleModalOpen && (
            <div className="admin-modal-overlay">
                <div className="admin-modal batch-schedule-modal">
                    <h3>⚡ 일정 간편 일괄 등록</h3>
                    <p className="modal-hint">
                        여러 일정을 한 번에 복사해서 붙여넣으세요.<br />
                        형식: <code>일차 | 시간 | 일정명 | 장소 | 비고</code> (구분자: <code>|</code> 또는 콤마 또는 탭)
                    </p>
                    <textarea 
                        className="batch-textarea"
                        rows={8}
                        placeholder={`1일차 | 14:00 - 15:30 | 개회예배 및 성찬예식 | 본회의장 | 설교: 총회장\n1일차 | 15:30 - 17:00 | 회원점명 및 개회선언 | 본회의장\n1일차 | 18:00 - 19:30 | 저녁식사 | 식당\n2일차 | 09:00 - 12:00 | 회무처리 및 각부 보고 | 본회의장`}
                        value={batchScheduleText}
                        onChange={(e) => setBatchScheduleText(e.target.value)}
                    />
                    <div className="modal-actions">
                        <button className="btn-cancel" onClick={() => { setIsBatchScheduleModalOpen(false); setBatchScheduleText(''); }}>취소</button>
                        <button className="btn-confirm" onClick={handleBatchScheduleSubmit}>일괄 등록하기</button>
                    </div>
                </div>
            </div>
        )}

        <ModalDialog modal={modal} onClose={closeModal} />
        </>
    );
}




