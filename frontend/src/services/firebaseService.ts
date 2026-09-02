import { 
  collection, 
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  writeBatch,
  orderBy,
  serverTimestamp,
  onSnapshot, 
  query, 
  where, 
  type DocumentData,
  type QuerySnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface EventData {
  id: string;
  name: string;
  token: string;
  passcode?: string | boolean;
  current_announcement?: string;
  files?: any[];
  links?: any[];
}

/**
 * Firebase Service for real-time synchronization
 */
export const firebaseService = {
  /**
   * Listen to a specific event and its metadata in real-time
   */
  subscribeToEvent: (token: string | null, onUpdate: (data: EventData) => void) => {
    const q = token && token !== 'auto'
      ? query(collection(db, 'events'), where('token', '==', token))
      : query(collection(db, 'events'), where('is_active', '==', true));
    
    return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      if (!snapshot.empty) {
        const eventDoc = snapshot.docs[0];
        const data = { id: eventDoc.id, ...eventDoc.data() } as EventData;
        onUpdate(data);
      }
    }, (error) => {
      console.error('[Firebase] Subscription error:', error);
    });
  },

  /**
   * Listen to public files for an event
   */
  subscribeToFiles: (eventId: string, onUpdate: (files: any[]) => void) => {
    const q = query(
      collection(db, 'files'), 
      where('eventId', '==', eventId),
      where('is_public', '==', true)
    );
    
    return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const files = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        published_at: doc.data().published_at?.toDate() || new Date() 
      }));
      // Sort by publication time (desc)
      files.sort((a, b) => b.published_at.getTime() - a.published_at.getTime());
      onUpdate(files);
    });
  },

  /**
   * Listen to public links for an event
   */
  subscribeToLinks: (eventId: string, onUpdate: (links: any[]) => void) => {
    const q = query(
      collection(db, 'links'), 
      where('eventId', '==', eventId),
      where('is_public', '==', true)
    );
    
    return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const links = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      onUpdate(links);
    });
  },

  /**
   * Listen to active votes for an event
   */
  subscribeToVotes: (eventId: string, onUpdate: (vote: any) => void) => {
    const q = query(
      collection(db, 'votes'), 
      where('eventId', '==', eventId),
      where('status', '==', 'OPEN')
    );
    
    return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      if (!snapshot.empty) {
        const voteDoc = snapshot.docs[0];
        onUpdate({ id: voteDoc.id, ...voteDoc.data() });
      } else {
        onUpdate(null);
      }
    });
  },

  /**
   * Listen to schedules for an event in real-time
   */
  subscribeToSchedules: (eventId: string, onUpdate: (schedules: any[]) => void) => {
    const q = query(
      collection(db, 'schedules'),
      where('eventId', '==', eventId)
    );

    return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort by order or day + time
      items.sort((a: any, b: any) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        return (a.day || '').localeCompare(b.day || '') || (a.time || '').localeCompare(b.time || '');
      });
      onUpdate(items);
    });
  },

  /**
   * Listen to all announcements for an event in real-time
   */
  subscribeToAnnouncements: (eventId: string, onUpdate: (announcements: any[]) => void) => {
    const q = query(
      collection(db, 'events', eventId, 'announcements'),
      orderBy('created_at', 'desc')
    );

    return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      onUpdate(items);
    }, (err) => {
      console.warn('[Firebase] Announcements fallback order without index:', err);
      // Fallback query if index is building
      const fallbackQ = collection(db, 'events', eventId, 'announcements');
      return onSnapshot(fallbackQ, (fallbackSnap) => {
        const fallbackItems = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fallbackItems.sort((a: any, b: any) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        onUpdate(fallbackItems);
      });
    });
  },

  /**
   * Broadcast an announcement and persist in event's announcements subcollection
   */
  sendAnnouncement: async (eventId: string, message: string) => {
    const cleanMsg = message.trim();
    if (!cleanMsg) return;

    // 1. Update active event current announcement
    await updateDoc(doc(db, 'events', eventId), {
      current_announcement: cleanMsg,
      current_announcement_ts: Date.now(),
    });

    // 2. Persist in announcements history
    await addDoc(collection(db, 'events', eventId, 'announcements'), {
      message: cleanMsg,
      timestamp: new Date().toISOString(),
      created_at: serverTimestamp()
    });
  },

  /**
   * Clear active announcement broadcast banner
   */
  clearCurrentAnnouncement: async (eventId: string) => {
    await updateDoc(doc(db, 'events', eventId), {
      current_announcement: '',
      current_announcement_ts: Date.now(),
    });
  },

  /**
   * Delete a single announcement from history
   */
  deleteAnnouncement: async (eventId: string, announcementId: string, message?: string, currentAnnouncement?: string) => {
    await deleteDoc(doc(db, 'events', eventId, 'announcements', announcementId));
    if (message && currentAnnouncement && message.trim() === currentAnnouncement.trim()) {
      await updateDoc(doc(db, 'events', eventId), {
        current_announcement: '',
        current_announcement_ts: Date.now(),
      });
    }
  },

  /**
   * Clear all announcements history and active broadcast
   */
  clearAllAnnouncements: async (eventId: string) => {
    await updateDoc(doc(db, 'events', eventId), {
      current_announcement: '',
      current_announcement_ts: Date.now(),
    });

    const snap = await getDocs(collection(db, 'events', eventId, 'announcements'));
    const deletePromises = snap.docs.map(d => deleteDoc(doc(db, 'events', eventId, 'announcements', d.id)));
    await Promise.all(deletePromises);
  },

  /**
   * Record or update registered attendee when logged in
   */
  recordAttendeeLogin: async (eventId: string, voterId: string, isStandalone: boolean) => {
    try {
      await setDoc(doc(db, 'events', eventId, 'attendees', voterId), {
        voter_id: voterId,
        is_standalone: isStandalone,
        logged_in_at: serverTimestamp(),
        last_seen: serverTimestamp(),
        user_agent: navigator.userAgent
      }, { merge: true });
    } catch (e) {
      console.error('[Firebase] Record attendee login error:', e);
    }
  },

  /**
   * Send heartbeat to track live active presence
   */
  sendPresenceHeartbeat: async (eventId: string, voterId: string, isStandalone: boolean, isLoggedIn: boolean) => {
    try {
      await setDoc(doc(db, 'events', eventId, 'presence', voterId), {
        voter_id: voterId,
        is_logged_in: isLoggedIn,
        is_standalone: isStandalone,
        last_seen: serverTimestamp(),
        last_seen_ts: Date.now()
      }, { merge: true });
    } catch (e) {
      console.error('[Firebase] Presence heartbeat error:', e);
    }
  },

  /**
   * Subscribe to live presence and registered attendee stats for Admin
   */
  subscribeToLiveStats: (
    eventId: string, 
    onUpdate: (stats: { liveCount: number; registeredCount: number; standaloneCount: number }) => void
  ) => {
    let registeredCount = 0;
    let standaloneCount = 0;
    let presenceDocs: any[] = [];

    const computeAndEmit = () => {
      const activeThreshold = Date.now() - 65000; // active within last 65 seconds
      const liveCount = presenceDocs.filter(docData => {
        const ts = docData.last_seen_ts || (docData.last_seen?.toMillis ? docData.last_seen.toMillis() : 0);
        return ts >= activeThreshold;
      }).length;

      onUpdate({
        liveCount,
        registeredCount,
        standaloneCount
      });
    };

    // 1. Listen to registered attendees
    const unsubscribeAttendees = onSnapshot(
      collection(db, 'events', eventId, 'attendees'),
      (snap) => {
        registeredCount = snap.size;
        standaloneCount = snap.docs.filter(d => d.data().is_standalone).length;
        computeAndEmit();
      },
      (err) => console.error('[Firebase] Attendees stats error:', err)
    );

    // 2. Listen to active presence
    const unsubscribePresence = onSnapshot(
      collection(db, 'events', eventId, 'presence'),
      (snap) => {
        presenceDocs = snap.docs.map(d => d.data());
        computeAndEmit();
      },
      (err) => console.error('[Firebase] Presence stats error:', err)
    );

    // Interval to refresh liveCount every 5s even without Firestore events
    const intervalId = setInterval(computeAndEmit, 5000);

    return () => {
      unsubscribeAttendees();
      unsubscribePresence();
      clearInterval(intervalId);
    };
  },

  /**
   * Subscribe to full attendee details with live presence status
   */
  subscribeToAttendeeList: (
    eventId: string,
    onUpdate: (attendees: any[]) => void
  ) => {
    let attendeeMap: Record<string, any> = {};
    let presenceDocs: Record<string, any> = {};

    const emit = () => {
      const activeThreshold = Date.now() - 65000;
      const list = Object.values(attendeeMap).map((att: any) => {
        const presence = presenceDocs[att.voter_id || att.id];
        const lastSeenTs = presence?.last_seen_ts || 
          (presence?.last_seen?.toMillis ? presence.last_seen.toMillis() : 
          (att.last_seen?.toMillis ? att.last_seen.toMillis() : 
          (att.logged_in_at?.toMillis ? att.logged_in_at.toMillis() : 0)));
        
        const isLive = lastSeenTs >= activeThreshold;
        return {
          ...att,
          is_live: isLive,
          last_active_ts: lastSeenTs
        };
      });

      // Sort by last_active_ts desc (most recent activity first)
      list.sort((a, b) => (b.last_active_ts || 0) - (a.last_active_ts || 0));
      onUpdate(list);
    };

    const unsubAttendees = onSnapshot(collection(db, 'events', eventId, 'attendees'), (snap) => {
      attendeeMap = {};
      snap.docs.forEach(d => {
        attendeeMap[d.id] = { id: d.id, ...d.data() };
      });
      emit();
    });

    const unsubPresence = onSnapshot(collection(db, 'events', eventId, 'presence'), (snap) => {
      presenceDocs = {};
      snap.docs.forEach(d => {
        presenceDocs[d.id] = d.data();
      });
      emit();
    });

    const intervalId = setInterval(emit, 5000);

    return () => {
      unsubAttendees();
      unsubPresence();
      clearInterval(intervalId);
    };
  },

  /**
   * Clear all attendees and presence records for an event (e.g. before live conference)
   */
  clearAllAttendees: async (eventId: string) => {
    const attendeesSnap = await getDocs(collection(db, 'events', eventId, 'attendees'));
    const presenceSnap = await getDocs(collection(db, 'events', eventId, 'presence'));
    
    const batch = writeBatch(db);
    attendeesSnap.docs.forEach(d => batch.delete(d.ref));
    presenceSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
};

