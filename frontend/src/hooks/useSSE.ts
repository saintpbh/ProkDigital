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

export interface VoteData {
    id: number;
    question: string;
    type: string;
    status: string;
    show_results: boolean;
    options?: any[];
    results?: any;
    voted_count?: number;
}

interface SSEOptions {
    onAnnouncement?: (message: string) => void;
    onVoteStatusChange?: (vote: VoteData) => void;
    onVoteDeleted?: (id: number) => void;
    onVoteCountUpdate?: (data: { id: number, count: number }) => void;
    onVoteResults?: (data: { id: number, results: any }) => void;
    onFileUpdate?: () => void;
    onLinkUpdate?: () => void;
    onNewFilePublished?: (url: string) => void;
}

export const useSSE = (url: string | null, options?: SSEOptions) => {
    const [files, setFiles] = useState<FileData[]>([]);
    const [links, setLinks] = useState<LinkData[]>([]);
    const [connectionCount, setConnectionCount] = useState<number>(0);
    const [lastPublishedFile, setLastPublishedFile] = useState<FileData | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('disconnected');
    const [errorCount, setErrorCount] = useState(0);

    useEffect(() => {
        if (!url) {
            setConnectionStatus('disconnected');
            return;
        }

        let isMounted = true;
        const controller = new AbortController();
        const rawToken = new URL(url, window.location.origin).searchParams.get('token');
        // Sanitize token: remove trailing '?' or other punctuation and trim
        const currentToken = rawToken ? rawToken.replace(/[?]+$/, '').trim() : null;

        const connect = async () => {
            setConnectionStatus('connecting');
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/event-stream',
                        'bypass-tunnel-reminder': 'true'
                    },
                    signal: controller.signal,
                });

                if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
                if (!response.body) throw new Error('Response body is null');

                setConnectionStatus('connected');
                if (errorCount > 0) {
                    console.log('[SSE] 🔄 Reconnected! Triggering data refresh...');
                    window.dispatchEvent(new CustomEvent('sse-refresh-data'));
                }
                setErrorCount(0);
                if (currentToken) console.log(`[SSE] ✅ Stream Open (Token: ${currentToken})`);

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (isMounted) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            const rawData = line.substring(5).trim();
                            if (!rawData) continue;
                            
                            try {
                                const data = JSON.parse(rawData);
                                
                                // Heartbeat and Welcome
                                if (data.event === 'keep-alive' || data.event === 'welcome') {
                                    if (data.event === 'welcome') console.log(`[SSE] 🚀 Welcome: "${data.message}"`);
                                    continue;
                                }

                                // Filter by token
                                if (currentToken && data.token && data.token !== currentToken) continue;

                                console.log(`[SSE] 📥 Received '${data.event}' event:`, data);

                                if (data.event === 'file_published') {
                                    const payload = data.data;
                                    setFiles((prev) => {
                                        const exists = prev.find(f => f.id === payload.id);
                                        if (exists) return prev.map(f => f.id === payload.id ? payload : f);
                                        return [payload, ...prev];
                                    });
                                    setLastPublishedFile(payload);
                                    if (options?.onFileUpdate) options.onFileUpdate();
                                    if (options?.onNewFilePublished) options.onNewFilePublished(payload.url);
                                } else if (data.event === 'file_hidden') {
                                    setFiles((prev) => prev.filter(f => f.id !== data.data.id));
                                    if (options?.onFileUpdate) options.onFileUpdate();
                                } else if (data.event === 'link_published') {
                                    const payload = data.data;
                                    setLinks((prev) => {
                                        const exists = prev.find(l => l.id === payload.id);
                                        if (exists) return prev.map(l => l.id === payload.id ? payload : l);
                                        return [payload, ...prev];
                                    });
                                    if (options?.onLinkUpdate) options.onLinkUpdate();
                                } else if (data.event === 'link_hidden') {
                                    setLinks((prev) => prev.filter(l => l.id !== data.data.id));
                                    if (options?.onLinkUpdate) options.onLinkUpdate();
                                } else if (data.event === 'announcement_broadcast') {
                                    if (options?.onAnnouncement) options.onAnnouncement(data.data.message);
                                } else if (data.event === 'connection_count') {
                                    setConnectionCount(data.count);
                                } else if (data.event.startsWith('vote')) {
                                    if (data.event === 'vote_status_changed' && options?.onVoteStatusChange) options.onVoteStatusChange(data.data);
                                    if (data.event === 'vote_deleted' && options?.onVoteDeleted) options.onVoteDeleted(data.data.id);
                                    if (data.event === 'vote_cast_count' && options?.onVoteCountUpdate) options.onVoteCountUpdate(data.data);
                                    if (data.event === 'vote_results_published' && options?.onVoteResults) options.onVoteResults(data.data);
                                }
                            } catch (e) {
                                // console.warn('[SSE] Failed to parse message:', rawData);
                            }
                        }
                    }
                }
            } catch (err: any) {
                if (err.name === 'AbortError') return;
                console.error(`[SSE] ❌ Stream Error:`, err.message);
                setConnectionStatus('error');
                setErrorCount(prev => prev + 1);
                
                // Retry after 5 seconds if still mounted
                if (isMounted) {
                    setTimeout(() => {
                        if (isMounted) connect();
                    }, 5000);
                }
            }
        };

        connect();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [url, options]);

    return { files, setFiles, links, setLinks, connectionCount, lastPublishedFile, connectionStatus, errorCount };
};
