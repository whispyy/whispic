import { useState, useCallback, useRef } from 'react';
import { uploadFile } from '../api/client';

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;   // 0–100
  error?: string;
}

export function useUpload() {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const queueRef = useRef<UploadItem[]>([]);
  const isRunningRef = useRef(false);

  const updateQueue = useCallback((updater: (prev: UploadItem[]) => UploadItem[]) => {
    setQueue(prev => {
      const next = updater(prev);
      queueRef.current = next;
      return next;
    });
  }, []);

  const addFiles = useCallback((files: File[]) => {
    updateQueue(prev => [
      ...prev,
      ...files.map(file => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'pending' as UploadStatus,
        progress: 0,
      })),
    ]);
  }, [updateQueue]);

  const clearDone = useCallback(() => {
    updateQueue(prev => prev.filter(i => i.status !== 'done' && i.status !== 'error'));
  }, [updateQueue]);

  const start = useCallback(async (subpath: string) => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsRunning(true);

    const pending = queueRef.current.filter(i => i.status === 'pending');

    for (const item of pending) {
      updateQueue(prev =>
        prev.map(i => i.id === item.id ? { ...i, status: 'uploading' as UploadStatus, progress: 0 } : i)
      );
      try {
        await uploadFile(item.file, subpath, (loaded, total) => {
          updateQueue(prev =>
            prev.map(i => i.id === item.id ? { ...i, progress: Math.round((loaded / total) * 100) } : i)
          );
        });
        updateQueue(prev =>
          prev.map(i => i.id === item.id ? { ...i, status: 'done' as UploadStatus, progress: 100 } : i)
        );
      } catch (e) {
        updateQueue(prev =>
          prev.map(i =>
            i.id === item.id
              ? { ...i, status: 'error' as UploadStatus, error: e instanceof Error ? e.message : 'Upload failed' }
              : i
          )
        );
      }
    }

    isRunningRef.current = false;
    setIsRunning(false);
  }, [updateQueue]);

  return { queue, isRunning, addFiles, clearDone, start };
}
