import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  type DocumentData,
  type QuerySnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface EventData {
  id: number;
  title: string;
  token: string;
  is_active: boolean;
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
  subscribeToEvent: (token: string, onUpdate: (data: EventData) => void) => {
    const q = query(collection(db, 'events'), where('token', '==', token));
    
    return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      if (!snapshot.empty) {
        const eventDoc = snapshot.docs[0];
        const data = { id: parseInt(eventDoc.id), ...eventDoc.data() } as EventData;
        onUpdate(data);
      }
    }, (error) => {
      console.error('[Firebase] Subscription error:', error);
    });
  },

  /**
   * Listen to public files for an event
   */
  subscribeToFiles: (eventId: number, onUpdate: (files: any[]) => void) => {
    const q = query(
      collection(db, 'files'), 
      where('event_id', '==', eventId),
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
  subscribeToLinks: (eventId: number, onUpdate: (links: any[]) => void) => {
    const q = query(
      collection(db, 'links'), 
      where('event_id', '==', eventId),
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
  subscribeToVotes: (eventId: number, onUpdate: (vote: any) => void) => {
    const q = query(
      collection(db, 'votes'), 
      where('event_id', '==', eventId),
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
  }
};
