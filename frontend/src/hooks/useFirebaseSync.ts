import { useState, useEffect, useRef } from 'react';
import { firebaseService, type EventData } from '../services/firebaseService';

export interface FirebaseSyncOptions {
  onAnnouncement?: (msg: string) => void;
  onNewFilePublished?: (url: string) => void;
  onFileUpdate?: () => void;
  onLinkUpdate?: () => void;
  onVoteUpdate?: (vote: any) => void;
  onScheduleUpdate?: (schedules: any[]) => void;
  onEventUpdate?: (event: EventData) => void;
}

export const useFirebaseSync = (token: string | null, options?: FirebaseSyncOptions) => {
  const [event, setEvent] = useState<EventData | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [lastPublishedFile, setLastPublishedFile] = useState<any>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    console.log(`[Firebase] 📡 Starting stable sync for token: ${token || 'active-auto'}`);

    // 1. Subscribe to Event metadata (Announcements, Passcode changes, etc.)
    const unsubscribeEvent = firebaseService.subscribeToEvent(token, (data) => {
      setEvent(data);
      if (data.current_announcement && optionsRef.current?.onAnnouncement) {
        optionsRef.current.onAnnouncement(data.current_announcement);
      }
      if (optionsRef.current?.onEventUpdate) {
        optionsRef.current.onEventUpdate(data);
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
          if (optionsRef.current?.onNewFilePublished && newest.url) {
            optionsRef.current.onNewFilePublished(newest.url);
          }
        }
      }
      if (optionsRef.current?.onFileUpdate) optionsRef.current.onFileUpdate();
    });

    // 3. Subscribe to Links
    const unsubscribeLinks = firebaseService.subscribeToLinks(event.id, (newLinks) => {
      setLinks(newLinks);
      if (optionsRef.current?.onLinkUpdate) optionsRef.current.onLinkUpdate();
    });

    // 4. Subscribe to Votes
    const unsubscribeVotes = firebaseService.subscribeToVotes(event.id, (vote) => {
      if (optionsRef.current?.onVoteUpdate) optionsRef.current.onVoteUpdate(vote);
    });

    // 5. Subscribe to Schedules
    const unsubscribeSchedules = firebaseService.subscribeToSchedules(event.id, (newSchedules) => {
      setSchedules(newSchedules);
      if (optionsRef.current?.onScheduleUpdate) optionsRef.current.onScheduleUpdate(newSchedules);
    });

    return () => {
      unsubscribeFiles();
      unsubscribeLinks();
      unsubscribeVotes();
      unsubscribeSchedules();
    };
  }, [event?.id]);

  return {
    event,
    files,
    links,
    schedules,
    setFiles,
    setLinks,
    setSchedules
  };
};
