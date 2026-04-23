import { useRef, useCallback } from 'react'
import type { Mode, RunParams } from '../types'
import { STRATEGY_CONFIG } from '../config'
import StrategyParams from './StrategyParams'

interface Props {
  file: File | null
  setFile: (f: File) => void
  mode: Mode
  setMode: (m: Mode) => void
  strategy: string
  setStrategy: (s: string) => void
  params: RunParams
  update: <K extends keyof RunParams>(key: K, val: RunParams[K]) => void
  onRun: () => void
  loading: boolean
  onSettings: () => void
}

const GROUPS = ['Classic', 'Advanced', 'Hybrid'] as const

export default function Sidebar({
  file, setFile, mode, setMode, strategy, setStrategy,
  params, update, onRun, loading, onSettings,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }, [setFile])

  const cfg = STRATEGY_CONFIG[strategy]

  return (
    <aside className="sidebar">
      {/* ── document drop ── */}
      <section>
        <label className="sidebar-label">Document</label>
        <div
          className={`drop-zone${file ? ' has-file' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
          onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
          onDrop={e => { e.currentTarget.classList.remove('drag-over'); handleDrop(e) }}
        >
          <span className="drop-icon">{file ? '📄' : '⬆'}</span>
          {file
            ? <span className="drop-filename">{file.name}</span>
            : <>
                <strong>Drop file here</strong>
                <span className="drop-hint">PDF · TXT · HTML · Markdown</span>
              </>
          }
        </div>
        <input
          ref={fileInputRef} type="file"
          accept=".pdf,.txt,.md,.markdown,.html,.htm"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }}
        />
      </section>

      {/* ── mode ── */}
      <section>
        <label className="sidebar-label">Mode</label>
        <div className="tab-group">
          <button className={`tab${mode === 'chunk' ? ' active' : ''}`} onClick={() => setMode('chunk')}>
            Chunks only
          </button>
          <button className={`tab${mode === 'embed' ? ' active' : ''}`} onClick={() => setMode('embed')}>
            + Embeddings
          </button>
        </div>
      </section>

      {/* ── strategy ── */}
      <section>
        <label className="sidebar-label">Chunking strategy</label>
        <select
          className="sidebar-select"
          value={strategy}
          onChange={e => setStrategy(e.target.value)}
        >
          {GROUPS.map(group => (
            <optgroup key={group} label={group}>
              {Object.entries(STRATEGY_CONFIG)
                .filter(([, m]) => m.group === group)
                .map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
            </optgroup>
          ))}
        </select>
      </section>

      {/* ── PDF parsing mode (only when a .pdf is loaded) ── */}
      {file?.name.toLowerCase().endsWith('.pdf') && (
        <section>
          <label className="sidebar-label">PDF parser</label>
          <select className="sidebar-select" value={params.pdfMode}
            onChange={e => update('pdfMode', e.target.value)}>
            <option value="text">Plain text (fast)</option>
            <option value="markdown">→ Markdown (preserves headings)</option>
          </select>
          {params.pdfMode === 'markdown' && (
            <p className="param-hint">
              Converts PDF to Markdown first — then use <strong>Markdown headers</strong> strategy to split on headings.
            </p>
          )}
        </section>
      )}

      {/* ── dynamic params ── */}
      <StrategyParams strategy={strategy} params={params} update={update} />

      {/* ── late-chunking chunk-only notice ── */}
      {cfg?.embedOnly && mode === 'chunk' && (
        <div className="info-banner">
          💡 Switch to <strong>+ Embeddings</strong> mode to see late-chunking contextual embeddings.
          Chunk-only mode shows the fixed boundaries without the full benefit.
        </div>
      )}

      {/* ── embed model (embed mode only) ── */}
      {mode === 'embed' && strategy !== 'late-chunking' && (
        <section>
          <label className="sidebar-label">Embedding model</label>
          <select className="sidebar-select" value={params.embedModel}
            onChange={e => update('embedModel', e.target.value)}>
            <option value="ollama:bge-m3">bge-m3 — Ollama</option>
          </select>
        </section>
      )}
      {mode === 'embed' && strategy === 'late-chunking' && (
        <div className="model-badge hf">
          HuggingFace · jina-embeddings-v3 · 1024d · 8192 tokens
        </div>
      )}

      {/* ── run + settings ── */}
      <div className="sidebar-footer">
        <button className="run-btn" disabled={!file || loading} onClick={onRun}>
          {loading ? <><span className="btn-spinner" /> Processing…</> : 'Run'}
        </button>
        <button className="settings-icon-btn" onClick={onSettings} title="Settings / Models">
          ⚙
        </button>
      </div>
    </aside>
  )
}
