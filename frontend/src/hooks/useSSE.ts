import { useState, useEffect } from 'react';

export interface FileData {
    id: number;
    title: string;
    url: string;
    file_size?: string;
    published_at: string;
}

export interface LinkData {
    id: number;
    title: string;
    url: string;
    published_at: string;
}

interface SSEOptions {
    onAnnouncement?: (message: string) => void;
}

export const useSSE = (url: string | null, options?: SSEOptions) => {
    const [files, setFiles] = useState<FileData[]>([]);
    const [links, setLinks] = useState<LinkData[]>([]);
    const [connectionCount, setConnectionCount] = useState<number>(0);
    const [lastPublishedFile, setLastPublishedFile] = useState<FileData | null>(null);

    useEffect(() => {
        if (!url) return;
        const eventSource = new EventSource(url);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.event === 'file_published') {
                setFiles((prev) => {
                    if (prev.find(f => f.id === data.data.id)) return prev;
                    return [data.data, ...prev];
                });
                setLastPublishedFile(data.data);
                if (Notification.permission === 'granted') {
                    new Notification('신규 문서가 공개되었습니다!', { body: data.data.title });
                }
            } else if (data.event === 'file_hidden') {
                setFiles((prev) => prev.filter(f => f.id !== data.data.id));
            } else if (data.event === 'link_published') {
                setLinks((prev) => {
                    if (prev.find(l => l.id === data.data.id)) return prev;
                    return [data.data, ...prev];
                });
            } else if (data.event === 'link_hidden') {
                setLinks((prev) => prev.filter(l => l.id !== data.data.id));
            } else if (data.event === 'announcement_broadcast') {
                if (options?.onAnnouncement) {
                    options.onAnnouncement(data.data.message);
                }
                // 실시간 공지 푸시 알림 추가
                if (Notification.permission === 'granted' && data.data.message) {
                    new Notification('📢 실시간 공지 알림', {
                        body: data.data.message,
                        icon: '/favicon.ico' // 아이콘이 있다면 설정
                    });
                }
            } else if (data.event === 'connection_count') {
                setConnectionCount(data.count);
            }
        };

        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        eventSource.onerror = (err) => {
            console.error('SSE Error:', err);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [url, options]);

    return { files, setFiles, links, setLinks, connectionCount, lastPublishedFile };
};
