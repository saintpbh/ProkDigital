import { useState } from 'react';
import './EventLogin.css';

interface EventLoginProps {
    eventName: string;
    onLogin: (passcode: string) => void;
    error?: string;
}

export const EventLogin = ({ eventName, onLogin, error }: EventLoginProps) => {
    const [passcode, setPasscode] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onLogin(passcode);
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h1>{eventName}</h1>
                <p>참석을 위해 암호를 입력해주세요.</p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        placeholder="숫자 암호 입력"
                        autoFocus
                    />
                    {error && <div className="error-msg">{error}</div>}
                    <button type="submit" className="btn-login">입장하기</button>
                </form>
            </div>
        </div>
    );
};
