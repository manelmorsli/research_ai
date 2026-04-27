import { useEffect, useState, useCallback } from 'react'
import { getModelStatus, downloadModel, getOllamaList, pullOllamaModel, getOllamaPullStatus } from '../api'
import type { ModelStatus, OllamaInstalledModel, OllamaPullStatus } from '../types'

interface Props { onClose: () => void }

// ── Static catalog (never changes, no backend fetch needed) ───────────────────
const EMBEDDING_CATALOG = [
  { name: 'bge-m3',            dims: '1024', context: '8192 tok', size: '~570 MB', note: 'Multilingual, best quality — used by default' },
  { name: 'nomic-embed-text',  dims: '768',  context: '8192 tok', size: '~274 MB', note: 'Fast, English-focused, large context' },
  { name: 'mxbai-embed-large', dims: '1024', context: '512 tok',  size: '~670 MB', note: 'High quality embeddings, shorter context' },
  { name: 'all-minilm',        dims: '384',  context: '512 tok',  size: '~46 MB',  note: 'Lightweight — fastest option' },
] as const

const LLM_CATALOG = [
  { name: 'qwen2.5:1.5b', dims: '—', context: '32 768 tok', size: '~934 MB', note: 'Fast local LLM — used for contextual chunking' },
  { name: 'qwen2.5:3b',   dims: '—', context: '32 768 tok', size: '~1.9 GB',  note: 'Better quality contextual chunks, slower' },
  { name: 'llama3.2:1b',  dims: '—', context: '131 072 tok', size: '~1.3 GB', note: 'Meta — fast inference, huge context' },
  { name: 'phi3.5',        dims: '—', context: '128 000 tok', size: '~2.2 GB', note: 'Microsoft — high quality for its size' },
] as const

type CatalogEntry = { name: string; dims: string; context: string; size: string; note: string }

function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}

export default function SettingsDrawer({ onClose }: Props) {
  const [jinaStatus, setJinaStatus]             = useState<ModelStatus | null>(null)
  const [ollamaModels, setOllamaModels]         = useState<OllamaInstalledModel[]>([])
  const [ollamaError, setOllamaError]           = useState<string | null>(null)
  const [selected, setSelected]                 = useState<Set<string>>(new Set())
  const [pullQueue, setPullQueue]               = useState<string[]>([])
  const [pullStatus, setPullStatus]             = useState<OllamaPullStatus | null>(null)
  const [activelyPulling, setActivelyPulling]   = useState(false)
  const [downloadingJina, setDownloadingJina]   = useState(false)

  const refreshOllamaList = useCallback(async () => {
    const list = await getOllamaList()
    setOllamaModels(list.models ?? [])
    setOllamaError(list.error ?? null)
  }, [])

  // Initial load
  useEffect(() => {
    getModelStatus().then(setJinaStatus).catch(() => {})
    refreshOllamaList()
  }, [refreshOllamaList])

  // Pull queue processor — starts next model when idle
  useEffect(() => {
    if (activelyPulling || pullQueue.length === 0) return
    const next = pullQueue[0]
    setActivelyPulling(true)
    setPullStatus({ state: 'pulling', model: next, message: 'Starting…', progress: 0 })
    pullOllamaModel(next).then(result => {
      if (!result.ok) {
        setPullStatus({ state: 'error', model: next, message: result.message, progress: 0 })
        setActivelyPulling(false)
        setPullQueue(q => q.slice(1))
      }
    })
  }, [pullQueue, activelyPulling])

  // Poll active pull
  useEffect(() => {
    if (!activelyPulling) return
    const id = setInterval(async () => {
      const s = await getOllamaPullStatus()
      setPullStatus(s)
      if (s.state === 'done' || s.state === 'error') {
        setActivelyPulling(false)
        setPullQueue(q => q.slice(1))
        refreshOllamaList()
      }
    }, 2000)
    return () => clearInterval(id)
  }, [activelyPulling, refreshOllamaList])

  // Poll jina download
  useEffect(() => {
    if (!downloadingJina) return
    const id = setInterval(async () => {
      const s = await getModelStatus()
      setJinaStatus(s)
      if (s.downloaded || s.state === 'error') { setDownloadingJina(false); clearInterval(id) }
    }, 4000)
    return () => clearInterval(id)
  }, [downloadingJina])

  const isInstalled = (name: string) =>
    ollamaModels.some(m =>
      m.name === name || m.name === `${name}:latest` ||
      m.model === name || m.model === `${name}:latest`
    )

  const toggle = (name: string) => {
    if (isInstalled(name) || pullQueue.includes(name)) return
    setSelected(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const handlePullSelected = () => {
    const toAdd = [...selected].filter(n => !isInstalled(n) && !pullQueue.includes(n))
    if (!toAdd.length) return
    setSelected(new Set())
    setPullQueue(q => [...q, ...toAdd])
  }

  const pendingInQueue = pullQueue.slice(1)
  const selectedCount  = selected.size

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer drawer-wide" onClick={e => e.stopPropagation()}>

        <div className="drawer-header">
          <h2>Settings &amp; Models</h2>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* ══ OLLAMA ═══════════════════════════════════════════════════════════ */}
        <section className="drawer-section">
          <h3>
            <span className="source-badge ollama">🦙 Ollama</span>
            Embedding &amp; LLM models
          </h3>
          <p className="drawer-hint">
            Select models and click <strong>Pull selected</strong> — they download one by one without restarting.
          </p>

          {/* Installed */}
          {ollamaError && (
            <div className="model-error">
              Ollama unreachable — make sure the container is running.
              <span className="error-detail">{ollamaError}</span>
            </div>
          )}
          {!ollamaError && ollamaModels.length > 0 && (
            <div className="installed-grid">
              {ollamaModels.map(m => {
                const base = m.name.replace(':latest', '')
                const all  = [...EMBEDDING_CATALOG, ...LLM_CATALOG] as CatalogEntry[]
                const entry = all.find(c => c.name === base || c.name === m.name)
                const type  = EMBEDDING_CATALOG.find(c => c.name === base) ? 'embedding' : 'llm'
                return (
                  <div key={m.name} className="installed-card">
                    <span className="status-dot status-ready" />
                    <div className="installed-card-main">
                      <code className="installed-name">{base}</code>
                      <span className={`catalog-type-badge ${type}`}>
                        {type === 'embedding' ? 'Embedding' : 'LLM'}
                      </span>
                    </div>
                    <div className="installed-card-meta">
                      {entry?.dims && entry.dims !== '—' ? `${entry.dims}d · ` : ''}
                      {entry?.context ? `${entry.context} · ` : ''}
                      {fmtBytes(m.size)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pull progress */}
          {pullStatus && pullStatus.state !== 'idle' && (
            <div className={`pull-progress-block ${pullStatus.state}`}>
              <div className="pull-progress-header">
                <span>
                  {pullStatus.state === 'pulling' && <span className="btn-spinner" />}
                  {pullStatus.state === 'done'    && '✓ '}
                  {pullStatus.state === 'error'   && '✕ '}
                  <strong>{pullStatus.model}</strong>
                  {pendingInQueue.length > 0 && (
                    <span className="pull-queue-badge">+{pendingInQueue.length} queued</span>
                  )}
                </span>
                <span className="pull-progress-pct">
                  {pullStatus.state === 'pulling' ? `${pullStatus.progress}%` : pullStatus.state}
                </span>
              </div>
              {pullStatus.state === 'pulling' && (
                <div className="pull-bar-track">
                  <div className="pull-bar-fill" style={{ width: `${pullStatus.progress}%` }} />
                </div>
              )}
              <div className="pull-progress-msg">{pullStatus.message}</div>
            </div>
          )}

          {/* Catalog — Embedding */}
          <CatalogSection
            title="Embedding models"
            items={EMBEDDING_CATALOG as unknown as CatalogEntry[]}
            selected={selected}
            isInstalled={isInstalled}
            pullQueue={pullQueue}
            onToggle={toggle}
          />

          {/* Catalog — LLM */}
          <CatalogSection
            title="LLM models (for contextual chunking)"
            items={LLM_CATALOG as unknown as CatalogEntry[]}
            selected={selected}
            isInstalled={isInstalled}
            pullQueue={pullQueue}
            onToggle={toggle}
          />

          {/* Action bar */}
          <div className={`pull-action-bar${selectedCount > 0 ? ' pull-action-bar--visible' : ''}`}>
            <span className="pull-action-count">
              {selectedCount} model{selectedCount !== 1 ? 's' : ''} selected
            </span>
            <button
              className="pull-selected-btn"
              disabled={selectedCount === 0 || activelyPulling}
              onClick={handlePullSelected}
            >
              {activelyPulling
                ? <><span className="btn-spinner" /> Pulling…</>
                : `Pull selected (${selectedCount})`}
            </button>
            <button className="pull-clear-btn" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </section>

        {/* ══ HUGGINGFACE ══════════════════════════════════════════════════════ */}
        <section className="drawer-section">
          <h3>
            <span className="source-badge hf">🤗 HuggingFace</span>
            Local inference models
          </h3>
          <p className="drawer-hint">
            Run directly inside the backend container — no API key needed after download. Stored in the container volume.
          </p>

          {jinaStatus && (
            <div className="model-card">
              <div className="model-card-row">
                <span className={`status-dot ${
                  jinaStatus.downloaded ? 'status-ready'
                  : jinaStatus.state === 'downloading' ? 'status-busy' : 'status-idle'
                }`} />
                <strong>{jinaStatus.model_id}</strong>
                <span className="model-card-meta">
                  {jinaStatus.dims}d · {jinaStatus.context_tokens} tokens · ~{jinaStatus.size_gb} GB
                </span>
              </div>
              <p className="model-msg">{jinaStatus.message}</p>
              {jinaStatus.downloaded ? (
                <div className="ready-badge">Available — Late Chunking enabled</div>
              ) : jinaStatus.state === 'downloading' ? (
                <div className="downloading-badge">
                  <span className="btn-spinner" /> Downloading… check back in a few minutes
                </div>
              ) : (
                <button className="download-btn" onClick={async () => {
                  const r = await downloadModel(); if (r.ok) setDownloadingJina(true)
                }}>
                  Download (~2 GB)
                </button>
              )}
            </div>
          )}
        </section>

        {/* ══ HOW LATE CHUNKING WORKS ══════════════════════════════════════════ */}
        <section className="drawer-section">
          <h3>How late chunking works</h3>
          <ol className="how-list">
            <li>The full document is tokenized and passed through jina-embeddings-v3 (8192-token context).</li>
            <li>Token-level hidden states are computed — each token "sees" the entire document.</li>
            <li>Chunk boundaries are defined on the raw text.</li>
            <li>Token embeddings within each boundary are mean-pooled into one vector per chunk.</li>
          </ol>
          <p className="drawer-hint" style={{ marginTop: '0.5rem' }}>
            Unlike independent-chunk embedding, late chunking preserves cross-chunk context in every
            vector — reducing the "information island" problem in retrieval.
          </p>
        </section>

      </div>
    </div>
  )
}

// ── Catalog section with checkboxes ──────────────────────────────────────────

interface CatalogSectionProps {
  title: string
  items: CatalogEntry[]
  selected: Set<string>
  isInstalled: (name: string) => boolean
  pullQueue: string[]
  onToggle: (name: string) => void
}

function CatalogSection({ title, items, selected, isInstalled, pullQueue, onToggle }: CatalogSectionProps) {
  return (
    <div className="catalog-group">
      <div className="catalog-group-title">{title}</div>
      {items.map(item => {
        const installed = isInstalled(item.name)
        const inQueue   = pullQueue.includes(item.name)
        const checked   = selected.has(item.name)

        return (
          <label
            key={item.name}
            className={`sel-row${checked ? ' sel-row--checked' : ''}${installed ? ' sel-row--installed' : ''}`}
          >
            <input
              type="checkbox"
              className="sel-checkbox"
              checked={checked || installed}
              disabled={installed || inQueue}
              onChange={() => onToggle(item.name)}
            />
            <span className="sel-info">
              <code className="catalog-model-name">{item.name}</code>
              {item.dims !== '—' && <span className="catalog-meta">{item.dims}d</span>}
              <span className="catalog-meta">{item.context}</span>
              <span className="catalog-meta">{item.size}</span>
              <span className="catalog-note">{item.note}</span>
            </span>
            <span className="sel-state">
              {installed && <span className="pull-installed">✓ Installed</span>}
              {!installed && inQueue && <span className="sel-queued-label">⏳ Queued</span>}
              {!installed && !inQueue && checked && <span className="sel-selected-label">Selected</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}
