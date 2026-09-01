import { useState, useCallback, useRef, useEffect } from 'react';

// =================================================
// Generic Modal Hook — replaces native prompt/confirm/alert
// =================================================

type ModalType = 'confirm' | 'prompt' | 'alert';

interface ModalState {
    isOpen: boolean;
    type: ModalType;
    title: string;
    message: string;
    defaultValue: string;
    confirmText: string;
    cancelText: string;
    onResolve: ((value: string | boolean | null) => void) | null;
}

const initialState: ModalState = {
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    defaultValue: '',
    confirmText: '확인',
    cancelText: '취소',
    onResolve: null,
};

export function useModal() {
    const [modal, setModal] = useState<ModalState>(initialState);
    const resolveRef = useRef<((value: string | boolean | null) => void) | null>(null);

    const close = useCallback(() => {
        setModal(initialState);
        resolveRef.current = null;
    }, []);

    const showAlert = useCallback((title: string, message = '') => {
        return new Promise<void>((resolve) => {
            resolveRef.current = () => resolve();
            setModal({
                isOpen: true,
                type: 'alert',
                title,
                message,
                defaultValue: '',
                confirmText: '확인',
                cancelText: '',
                onResolve: () => { resolve(); close(); },
            });
        });
    }, [close]);

    const showConfirm = useCallback((title: string, message = '') => {
        return new Promise<boolean>((resolve) => {
            resolveRef.current = (v) => resolve(!!v);
            setModal({
                isOpen: true,
                type: 'confirm',
                title,
                message,
                defaultValue: '',
                confirmText: '확인',
                cancelText: '취소',
                onResolve: (v) => { resolve(!!v); close(); },
            });
        });
    }, [close]);

    const showPrompt = useCallback((title: string, defaultValue = '', message = '') => {
        return new Promise<string | null>((resolve) => {
            resolveRef.current = (v) => resolve(v as string | null);
            setModal({
                isOpen: true,
                type: 'prompt',
                title,
                message,
                defaultValue,
                confirmText: '확인',
                cancelText: '취소',
                onResolve: (v) => { resolve(v as string | null); close(); },
            });
        });
    }, [close]);

    return { modal, showAlert, showConfirm, showPrompt, close };
}

// =================================================
// Modal UI Component
// =================================================

interface ModalDialogProps {
    modal: ModalState;
    onClose?: () => void;
}

export function ModalDialog({ modal }: ModalDialogProps) {
    const [inputValue, setInputValue] = useState(modal.defaultValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setInputValue(modal.defaultValue);
    }, [modal.defaultValue, modal.isOpen]);

    useEffect(() => {
        if (modal.isOpen && modal.type === 'prompt' && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [modal.isOpen, modal.type]);

    if (!modal.isOpen) return null;

    const handleConfirm = () => {
        if (modal.type === 'prompt') {
            modal.onResolve?.(inputValue);
        } else if (modal.type === 'confirm') {
            modal.onResolve?.(true);
        } else {
            modal.onResolve?.(true);
        }
    };

    const handleCancel = () => {
        if (modal.type === 'prompt') {
            modal.onResolve?.(null);
        } else if (modal.type === 'confirm') {
            modal.onResolve?.(false);
        } else {
            modal.onResolve?.(true);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') handleCancel();
    };

    return (
        <div className="admin-modal-overlay" onClick={handleCancel}>
            <div className="admin-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
                <h3>{modal.title}</h3>
                {modal.message && <p>{modal.message}</p>}
                {modal.type === 'prompt' && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                        autoFocus
                    />
                )}
                <div className="modal-actions">
                    {modal.type !== 'alert' && (
                        <button className="btn-cancel" onClick={handleCancel}>
                            {modal.cancelText}
                        </button>
                    )}
                    <button className="btn-confirm" onClick={handleConfirm}>
                        {modal.confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
