import { useState, useEffect } from 'react';
import { db } from './lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import './styles/global.css';
import './styles/components.css';
import './styles/admin.css';

interface AdminLoginProps {
    onLogin: (username: string) => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkSeeding = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'admins'));
                if (snapshot.empty) {
                    await addDoc(collection(db, 'admins'), {
                        username: 'admin',
                        password: '1234',
                        role: 'super_admin',
                        created_at: serverTimestamp(),
                    });
                    console.log('Seeded default admin account.');
                }
            } catch (err) {
                console.error('Failed to check/seed admins:', err);
            } finally {
                setIsLoading(false);
            }
        };
        checkSeeding();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!username || !password) {
            setError('아이디와 비밀번호를 모두 입력해주세요.');
            return;
        }

        setIsLoading(true);
        try {
            const q = query(
                collection(db, 'admins'), 
                where('username', '==', username),
                where('password', '==', password)
            );
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                onLogin(username);
            } else {
                setError('아이디 또는 비밀번호가 올바르지 않습니다.');
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('로그인 중 시스템 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading && !username) {
         return <div className="loading-container">시스템 연결 중...</div>;
    }

    return (
        <div className="admin-login-screen">
            <div className="admin-login-card">
                <div className="admin-login-header">
                    <h1>디지털 총회 관제 로그</h1>
                    <p>관리자 전용 접근 채널입니다.</p>
                </div>

                <form onSubmit={handleLogin} className="admin-login-form">
                    <div className="input-group">
                        <input
                            type="text"
                            placeholder="관리자 아이디 (예: admin)"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                    <div className="input-group">
                        <input
                            type="password"
                            placeholder="접속 비밀번호"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                    {error && <div className="error-msg">{error}</div>}
                    <button type="submit" className="btn-login" disabled={isLoading}>
                        {isLoading ? '인증 확인 중...' : '관리자 접속'}
                    </button>
                    <p className="admin-login-hint">초기 아이디: admin / 비밀번호: 1234</p>
                </form>
            </div>
        </div>
    );
}
