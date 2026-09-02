import React, { useState, useRef } from 'react';
import { haptic } from '../utils/haptic';

interface SwipeableAnnouncementCardProps {
  item: {
    id: string;
    message: string;
    timestamp: string;
  };
  onClick: () => void;
  onDelete: (id: string) => void;
}

export const SwipeableAnnouncementCard: React.FC<SwipeableAnnouncementCardProps> = ({
  item,
  onClick,
  onDelete
}) => {
  const [translateX, setTranslateX] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showLongPressDialog, setShowLongPressDialog] = useState<boolean>(false);

  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const currentXRef = useRef<number>(0);
  const isScrollingRef = useRef<boolean | null>(null);
  const longPressTimerRef = useRef<any>(null);
  const hasTriggeredLongPressRef = useRef<boolean>(false);
  const hasMovedRef = useRef<boolean>(false);

  // 1. Touch Start
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    currentXRef.current = touch.clientX;
    isScrollingRef.current = null;
    hasMovedRef.current = false;
    hasTriggeredLongPressRef.current = false;
    setIsSwiping(true);

    // Start 500ms Long-press Timer
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if (!hasMovedRef.current) {
        hasTriggeredLongPressRef.current = true;
        haptic.warning();
        setShowLongPressDialog(true);
      }
    }, 550);
  };

  // 2. Touch Move
  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const diffX = touch.clientX - startXRef.current;
    const diffY = touch.clientY - startYRef.current;
    currentXRef.current = touch.clientX;

    // Movement threshold check
    if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
      hasMovedRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    // Determine scroll direction once per gesture
    if (isScrollingRef.current === null) {
      isScrollingRef.current = Math.abs(diffY) > Math.abs(diffX);
    }

    if (isScrollingRef.current) {
      // User is scrolling vertically, don't swipe
      return;
    }

    // Left swipe only (diffX < 0)
    if (diffX < 0) {
      // Friction when swiping past -90px
      const clamped = Math.max(diffX, -110);
      setTranslateX(clamped);
    } else {
      setTranslateX(0);
    }
  };

  // 3. Touch End / Cancel
  const handleTouchEnd = () => {
    setIsSwiping(false);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (translateX < -75) {
      // Swiped far enough to trigger delete
      handleConfirmDelete();
    } else {
      // Snap back to normal position
      setTranslateX(0);
    }
  };

  // Perform delete with collapse animation
  const handleConfirmDelete = () => {
    haptic.button();
    setIsDeleting(true);
    setTranslateX(-400); // Fly out left
    setTimeout(() => {
      onDelete(item.id);
    }, 250);
  };

  const handleCardClick = () => {
    // Prevent click if swiped or long-pressed
    if (hasTriggeredLongPressRef.current || Math.abs(translateX) > 10) {
      return;
    }
    onClick();
  };

  return (
    <div className={`swipeable-announcement-wrapper ${isDeleting ? 'is-deleting' : ''}`}>
      {/* Red Background Delete Action Behind Card */}
      <div 
        className="swipe-delete-background"
        onClick={handleConfirmDelete}
      >
        <span className="swipe-delete-icon">🗑️</span>
        <span className="swipe-delete-label">삭제</span>
      </div>

      {/* Front Card with touch gesture handlers */}
      <div 
        className={`announcement-item-card ${isSwiping ? 'is-swiping' : ''}`}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={handleCardClick}
      >
        <div className="item-header">
          <span className="item-time">
            {item.timestamp ? new Date(item.timestamp).toLocaleDateString([], { month: 'numeric', day: 'numeric' }) : ''}{' '}
            {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '방금 전'}
          </span>
          <button 
            className="btn-delete-announcement-card"
            onClick={(e) => {
              e.stopPropagation();
              handleConfirmDelete();
            }}
            title="이 알림 삭제"
          >
            ✕
          </button>
        </div>
        <div className="item-body">
          {item.message.length > 45 ? item.message.substring(0, 45) + '...' : item.message}
        </div>
        <div className="item-footer">자세히 보기 〉</div>
      </div>

      {/* Long Press Action Modal */}
      {showLongPressDialog && (
        <div 
          className="long-press-modal-backdrop" 
          onClick={(e) => {
            e.stopPropagation();
            setShowLongPressDialog(false);
          }}
        >
          <div 
            className="long-press-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="long-press-modal-icon">🔔</div>
            <h4>알림 삭제</h4>
            <p className="long-press-modal-msg">"{item.message.length > 30 ? item.message.substring(0, 30) + '...' : item.message}"</p>
            <p className="long-press-modal-sub">이 공지사항을 삭제하시겠습니까?</p>
            
            <div className="long-press-btn-group">
              <button 
                className="btn-cancel-modal"
                onClick={() => setShowLongPressDialog(false)}
              >
                취소
              </button>
              <button 
                className="btn-delete-modal"
                onClick={() => {
                  setShowLongPressDialog(false);
                  handleConfirmDelete();
                }}
              >
                🗑️ 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
