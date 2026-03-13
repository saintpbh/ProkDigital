import React, { useState, useRef } from 'react';

interface FileUploaderProps {
    eventId: number;
    onUploadSuccess: () => void;
    apiUrl?: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({ eventId, onUploadSuccess, apiUrl }) => {
    const API_BASE_URL = apiUrl !== undefined ? apiUrl : 'http://localhost:3000';
    const [isDragging, setIsDragging] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            uploadFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            uploadFile(e.target.files[0]);
        }
    };

    const uploadFile = (file: File) => {
        if (file.type !== 'application/pdf') {
            alert('PDF 파일만 업로드 가능합니다.');
            return;
        }

        setIsUploading(true);
        setProgress(0);

        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE_URL}/api/files/upload?eventId=${eventId}`, true);
        xhr.setRequestHeader('bypass-tunnel-reminder', 'true');

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                setProgress(percentComplete);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                setIsUploading(false);
                setProgress(0);
                onUploadSuccess();
            } else {
                alert('업로드 실패');
                setIsUploading(false);
            }
        };

        xhr.send(formData);
    };

    return (
        <div
            className={`upload-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".pdf"
                style={{ display: 'none' }}
            />

            {isUploading ? (
                <div className="progress-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                    <span>{progress}% 업로드 중...</span>
                </div>
            ) : (
                <div className="upload-prompt">
                    <span className="icon">📁</span>
                    <p>여기에 파일을 드래그하여 올리거나 클릭하여 선택하세요.</p>
                    <span className="sub">PDF 파일만 가능합니다.</span>
                </div>
            )}

            <style>{`
        .upload-zone {
          border: 2px dashed #ccc;
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          background: #f8f9fa;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-bottom: 30px;
          position: relative;
          overflow: hidden;
        }
        .upload-zone.dragging {
          border-color: #1a237e;
          background: #e8eaf6;
          transform: scale(1.02);
        }
        .upload-prompt .icon { font-size: 40px; display: block; margin-bottom: 10px; }
        .upload-prompt p { margin: 0; font-weight: 500; color: #333; }
        .upload-prompt .sub { font-size: 12px; color: #888; }
        
        .progress-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        .progress-bar {
          height: 4px;
          background: #1a237e;
          position: absolute;
          bottom: 0;
          left: 0;
          transition: width 0.2s;
        }
      `}</style>
        </div>
    );
};

export default FileUploader;
