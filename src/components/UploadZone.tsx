import { useRef, useState } from 'react'
import { UploadCloudIcon } from './Icons'

interface Props { onAttach: (files: File[]) => void }

const CHIPS = ['.xlsx', '.csv', '.pdf', '.step', '.dxf', '.dwg', '+ more']

/* Recursively collect files from a FileSystem entry (handles folders). */
async function collectEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    await new Promise<void>(resolve => {
      (entry as FileSystemFileEntry).file(f => { out.push(f); resolve() }, () => resolve())
    })
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    await new Promise<void>(resolve => {
      const readBatch = () => {
        reader.readEntries(async entries => {
          if (!entries.length) { resolve(); return }
          await Promise.all(entries.map(e => collectEntry(e, out)))
          readBatch()
        }, () => resolve())
      }
      readBatch()
    })
  }
}

export default function UploadZone({ onAttach }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (list: FileList | null) => onAttach(Array.from(list ?? []))

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const items = Array.from(e.dataTransfer.items)
    const hasFolder = items.some(i => i.webkitGetAsEntry?.()?.isDirectory)

    if (hasFolder) {
      const files: File[] = []
      await Promise.all(
        items.map(item => {
          const entry = item.webkitGetAsEntry?.()
          if (entry) return collectEntry(entry, files)
          const file = item.getAsFile()
          if (file) files.push(file)
          return Promise.resolve()
        }),
      )
      onAttach(files)
    } else {
      handleFiles(e.dataTransfer.files)
    }
  }

  return (
    <div className="upload-wrap">
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
      <div
        className={`drop-zone${dragging ? ' drop-zone--over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="drop-zone__icon">
          <UploadCloudIcon />
        </div>

        <h2 className="drop-zone__title">Upload your files here</h2>

        <p className="drop-zone__sub">
          Drag &amp; drop any file type. The agent detects categories and
          sorts into smart folders automatically.
        </p>

        <div className="chip-row">
          {CHIPS.map(c => <span key={c} className="chip">{c}</span>)}
        </div>

        <p className="drop-zone__limit">
          Max 500 MB per file · Multiple files supported
        </p>
      </div>
    </div>
  )
}
