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
        
        setConnectionStatus('connecting');
        const currentToken = new URL(url, window.location.origin).searchParams.get('token');
        const eventSource = new EventSource(url, { withCredentials: true });

        eventSource.onopen = () => {
            setConnectionStatus('connected');
            if (errorCount > 0) {
                console.log('[SSE] 🔄 Reconnected! Triggering data refresh...');
                window.dispatchEvent(new CustomEvent('sse-refresh-data'));
            }
            setErrorCount(0);
            if (currentToken) console.log(`[SSE] ✅ Connection Open (Token: ${currentToken}, ReadyState: ${eventSource.readyState})`);
        };

        eventSource.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                console.error('[SSE] ❌ Failed to parse message data. RAW:', event.data);
                return;
            }

            // Process keep-alive for visibility
            if (data.event === 'keep-alive') {
                // Heartbeat received
                // console.log(`[SSE] 💓 Heartbeat (${new Date().toLocaleTimeString()})`);
                return;
            }

            if (data.event === 'welcome') {
                console.log(`[SSE] 🚀 Welcome: "${data.message}" (Padding: ${data.padding?.length || 0} bytes)`);
                return;
            }

            console.log(`[SSE] 📥 Received '${data.event}' event:`, data);

            // Filter by token
            if (currentToken && data.token) {
                if (data.token !== currentToken) {
                    return; // Ignore other meeting's events
                }
            }

            if (data.event === 'file_published') {
                const payload = data.data;
                setFiles((prev) => {
                    if (prev.find(f => f.id === payload.id)) return prev;
                    return [payload, ...prev];
                });
                setLastPublishedFile(payload);
                if (options?.onFileUpdate) options.onFileUpdate();
            } else if (data.event === 'file_hidden') {
                setFiles((prev) => prev.filter(f => f.id !== data.data.id));
                if (options?.onFileUpdate) options.onFileUpdate();
            } else if (data.event === 'link_published') {
                const payload = data.data;
                setLinks((prev) => {
                    if (prev.find(l => l.id === payload.id)) return prev;
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
                // Pass all vote events to specialized handlers
                if (data.event === 'vote_status_changed' && options?.onVoteStatusChange) options.onVoteStatusChange(data.data);
                if (data.event === 'vote_deleted' && options?.onVoteDeleted) options.onVoteDeleted(data.data.id);
                if (data.event === 'vote_cast_count' && options?.onVoteCountUpdate) options.onVoteCountUpdate(data.data);
                if (data.event === 'vote_results_published' && options?.onVoteResults) options.onVoteResults(data.data);
            }
        };

        eventSource.onerror = () => {
            console.error(`[SSE] ❌ Connection Error (ReadyState: ${eventSource.readyState})`);
            setConnectionStatus('error');
            setErrorCount(prev => prev + 1);
        };

        return () => {
            eventSource.close();
        };
    }, [url, options]);

    return { files, setFiles, links, setLinks, connectionCount, lastPublishedFile, connectionStatus, errorCount };
};
