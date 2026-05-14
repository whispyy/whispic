import { useRef, useState } from 'react';
import styled from 'styled-components';
import { useUpload, UploadItem } from '../hooks/useUpload';

function todaySubpath(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

export function UploadView() {
  const { queue, isRunning, addFiles, clearDone, start } = useUpload();
  const [subpath, setSubpath] = useState(todaySubpath());
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    addFiles(Array.from(files));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  const pending = queue.filter(i => i.status === 'pending').length;
  const done = queue.filter(i => i.status === 'done').length;
  const errors = queue.filter(i => i.status === 'error').length;

  return (
    <Wrapper>
      <PageTitle>Upload</PageTitle>

      <DropZone
        $dragging={dragging}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <DropIcon>↑</DropIcon>
        <DropText>Drop photos &amp; videos here</DropText>
        <DropSub>or click to browse</DropSub>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </DropZone>

      <Controls>
        <Field>
          <FieldLabel>Date folder</FieldLabel>
          <DateInput
            type="text"
            value={subpath}
            onChange={e => setSubpath(e.target.value)}
            placeholder="YYYY/MM/DD"
            spellCheck={false}
          />
        </Field>
        <Actions>
          {(done > 0 || errors > 0) && (
            <ClearBtn onClick={clearDone}>Clear done</ClearBtn>
          )}
          <StartBtn
            onClick={() => start(subpath)}
            disabled={isRunning || pending === 0 || !subpath}
          >
            {isRunning ? 'Uploading…' : `Upload ${pending} file${pending !== 1 ? 's' : ''}`}
          </StartBtn>
        </Actions>
      </Controls>

      {queue.length > 0 && (
        <QueueList>
          {queue.map(item => <QueueRow key={item.id} item={item} />)}
        </QueueList>
      )}
    </Wrapper>
  );
}

function QueueRow({ item }: { item: UploadItem }) {
  return (
    <QueueItem>
      <ItemName title={item.file.name}>{item.file.name}</ItemName>
      <ItemRight>
        {item.status === 'uploading' && <ProgressBar $value={item.progress} />}
        {item.status === 'done' && <Badge $color="success">Done</Badge>}
        {item.status === 'error' && <Badge $color="error" title={item.error}>Error</Badge>}
        {item.status === 'pending' && <Badge $color="neutral">Pending</Badge>}
      </ItemRight>
    </QueueItem>
  );
}

const Wrapper = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  max-width: 700px;
  margin: 0 auto;
`;

const PageTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
`;

const DropZone = styled.div<{ $dragging: boolean }>`
  border: 2px dashed ${({ theme, $dragging }) => $dragging ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme, $dragging }) => $dragging ? `${theme.colors.primary}18` : theme.colors.surface};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.xl};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  transition: border-color 0.15s, background 0.15s;
  user-select: none;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`;

const DropIcon = styled.div`
  font-size: 2.5rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1;
`;

const DropText = styled.p`
  color: ${({ theme }) => theme.colors.text};
  font-size: 1rem;
  font-weight: 500;
  margin: 0;
`;

const DropSub = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.875rem;
  margin: 0;
`;

const Controls = styled.div`
  display: flex;
  align-items: flex-end;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  flex: 1;
  min-width: 160px;
`;

const FieldLabel = styled.label`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const DateInput = styled.input`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;
  font-family: monospace;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  outline: none;
  width: 100%;
  transition: border-color 0.15s;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`;

const StartBtn = styled.button`
  background: ${({ theme }) => theme.colors.primary};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: #fff;
  cursor: pointer;
  font-size: 0.9375rem;
  font-weight: 600;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.lg}`};
  white-space: nowrap;
  transition: background 0.15s, opacity 0.15s;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primaryHover};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const ClearBtn = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: 0.875rem;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.text};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const QueueList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const QueueItem = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  gap: ${({ theme }) => theme.spacing.md};
`;

const ItemName = styled.span`
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`;

const ItemRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-shrink: 0;
`;

const ProgressBar = styled.div<{ $value: number }>`
  width: 80px;
  height: 4px;
  background: ${({ theme }) => theme.colors.border};
  border-radius: 2px;
  overflow: hidden;

  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $value }) => $value}%;
    background: ${({ theme }) => theme.colors.primary};
    transition: width 0.1s;
  }
`;

const Badge = styled.span<{ $color: 'success' | 'error' | 'neutral' }>`
  font-size: 0.75rem;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  background: ${({ theme, $color }) =>
    $color === 'success' ? `${theme.colors.success}25` :
    $color === 'error'   ? `${theme.colors.error}25`   :
    theme.colors.border
  };
  color: ${({ theme, $color }) =>
    $color === 'success' ? theme.colors.success :
    $color === 'error'   ? theme.colors.error   :
    theme.colors.textSecondary
  };
`;
