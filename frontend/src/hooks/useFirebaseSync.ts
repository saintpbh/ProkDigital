import { useState, useEffect } from 'react';
import { firebaseService, type EventData } from '../services/firebaseService';

export interface FirebaseSyncOptions {
  onAnnouncement?: (msg: string) => void;
  onNewFilePublished?: (url: string) => void;
  onFileUpdate?: () => void;
  onLinkUpdate?: () => void;
  onVoteUpdate?: (vote: any) => void;
}

export const useFirebaseSync = (token: string | null, options?: FirebaseSyncOptions) => {
  const [event, setEvent] = useState<EventData | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [lastPublishedFile, setLastPublishedFile] = useState<any>(null);

  useEffect(() => {
    if (!token) return;

    console.log(`[Firebase] 📡 Starting stable sync for token: ${token}`);

    // 1. Subscribe to Event metadata (Announcements, etc.)
    const unsubscribeEvent = firebaseService.subscribeToEvent(token, (data) => {
      setEvent(data);
      if (data.current_announcement && options?.onAnnouncement) {
        options.onAnnouncement(data.current_announcement);
      }
    });

    return () => {
      unsubscribeEvent();
    };
  }, [token]);

  useEffect(() => {
    if (!event?.id) return;

    // 2. Subscribe to Files
    const unsubscribeFiles = firebaseService.subscribeToFiles(event.id, (newFiles) => {
      setFiles(newFiles);
      if (newFiles.length > 0) {
        const newest = newFiles[0];
        // If it's a new file (not just an update), trigger callback
        if (!lastPublishedFile || newest.id !== lastPublishedFile.id) {
          setLastPublishedFile(newest);
          if (options?.onNewFilePublished && newest.url) {
            options.onNewFilePublished(newest.url);
          }
        }
      }
      if (options?.onFileUpdate) options.onFileUpdate();
    });

    // 3. Subscribe to Links
    const unsubscribeLinks = firebaseService.subscribeToLinks(event.id, (newLinks) => {
      setLinks(newLinks);
      if (options?.onLinkUpdate) options.onLinkUpdate();
    });

    // 4. Subscribe to Votes
    const unsubscribeVotes = firebaseService.subscribeToVotes(event.id, (vote) => {
      if (options?.onVoteUpdate) options.onVoteUpdate(vote);
    });

    return () => {
      unsubscribeFiles();
      unsubscribeLinks();
      unsubscribeVotes();
    };
  }, [event?.id]);

  return {
    event,
    files,
    links,
    setFiles,
    setLinks
  };
};
