import { useEffect, useState, useCallback } from 'react'
import {
  getModelStatus, downloadModel,
  getOllamaList, getOllamaCatalog, pullOllamaModel, getOllamaPullStatus,
} from '../api'
import type { ModelStatus, OllamaInstalledModel, OllamaCatalogItem, OllamaPullStatus } from '../types'

interface Props {
  onClose: () => void
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}

export default function SettingsDrawer({ onClose }: Props) {
  const [jinaStatus, setJinaStatus]         = useState<ModelStatus | null>(null)
  const [ollamaModels, setOllamaModels]     = useState<OllamaInstalledModel[]>([])
  const [ollamaError, setOllamaError]       = useState<string | null>(null)
  const [catalog, setCatalog]               = useState<OllamaCatalogItem[]>([])
  const [pullStatus, setPullStatus]         = useState<OllamaPullStatus | null>(null)
  const [pullingModel, setPullingModel]     = useState<string | null>(null)
  const [downloadingJina, setDownloadingJina] = useState(false)
  const [pullMsg, setPullMsg]               = useState<string | null>(null)

  const refreshOllamaList = useCallback(async () => {
    const list = await getOllamaList()
    setOllamaModels(list.models ?? [])
    setOllamaError(list.error ?? null)
  }, [])

  const fetchAll = useCallback(async () => {
    const [jina, list, cat] = await Promise.allSettled([
      getModelStatus(),
      getOllamaList(),
      getOllamaCatalog(),
    ])
    if (jina.status === 'fulfilled') setJinaStatus(jina.value)
    if (list.status === 'fulfilled') {
      setOllamaModels(list.value.models ?? [])
      setOllamaError(list.value.error ?? null)
    }
    if (cat.status === 'fulfilled') setCatalog(cat.value.catalog ?? [])
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Poll Ollama pull progress
  useEffect(() => {
    if (!pullingModel) return
    const id = setInterval(async () => {
      const s = await getOllamaPullStatus()
      setPullStatus(s)
      if (s.state === 'done' || s.state === 'error') {
        setPullingModel(null)
        clearInterval(id)
        refreshOllamaList()
      }
    }, 2000)
    return () => clearInterval(id)
  }, [pullingModel, refreshOllamaList])

  // Poll jina download
  useEffect(() => {
    if (!downloadingJina) return
    const id = setInterval(async () => {
      const s = await getModelStatus()
      setJinaStatus(s)
      if (s.downloaded || s.state === 'error') {
        setDownloadingJina(false)
        clearInterval(id)
      }
    }, 4000)
    return () => clearInterval(id)
  }, [downloadingJina])

  const handlePull = async (modelName: string) => {
    setPullMsg(null)
    const result = await pullOllamaModel(modelName)
    if (result.ok) {
      setPullingModel(modelName)
      setPullStatus({ state: 'pulling', model: modelName, message: 'Starting…', progress: 0 })
    } else {
      setPullMsg(result.message)
    }
  }

  const handleDownloadJina = async () => {
    const result = await downloadModel()
    if (result.ok) setDownloadingJina(true)
  }

  const isInstalled = (name: string) =>
    ollamaModels.some(m =>
      m.name === name ||
      m.name === `${name}:latest` ||
      m.model === name ||
      m.model === `${name}:latest`
    )

  const installedEmbedding = ollamaModels.filter(m => {
    const base = m.name.replace(':latest', '')
    return catalog.some(c => c.type === 'embedding' && (c.name === base || c.name === m.name))
  })
  const installedLLM = ollamaModels.filter(m => {
    const base = m.name.replace(':latest', '')
    return catalog.some(c => c.type === 'llm' && (c.name === base || c.name === m.name))
  })
  const unknownModels = ollamaModels.filter(m => {
    const base = m.name.replace(':latest', '')
    return !catalog.some(c => c.name === base || c.name === m.name)
  })

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer drawer-wide" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>Settings &amp; Models</h2>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* ── OLLAMA SECTION ── */}
        <section className="drawer-section">
          <h3>
            <span className="source-badge ollama">🦙 Ollama</span>
            Embedding &amp; LLM models
          </h3>
          <p className="drawer-hint">
            Models served by the <code>ollama</code> container. Pull any model below — it will be
            available immediately without restarting.
          </p>

          {/* Installed models */}
          {ollamaError ? (
            <div className="model-error">
              Ollama container unreachable — make sure it is running.
              <span className="error-detail">{ollamaError}</span>
            </div>
          ) : ollamaModels.length === 0 ? (
            <div className="model-empty">No models installed yet — pull one from the catalog below.</div>
          ) : (
            <div className="installed-grid">
              {ollamaModels.map(m => {
                const base = m.name.replace(':latest', '')
                const entry = catalog.find(c => c.name === base || c.name === m.name)
                return (
                  <div key={m.name} className="installed-card">
                    <span className="status-dot status-ready" />
                    <div className="installed-card-main">
                      <code className="installed-name">{base}</code>
                      {entry && (
                        <span className={`catalog-type-badge ${entry.type}`}>
                          {entry.type === 'embedding' ? 'Embedding' : 'LLM'}
                        </span>
                      )}
                    </div>
                    <div className="installed-card-meta">
                      {entry?.dims ? `${entry.dims}d · ` : ''}
                      {entry?.context ? `${entry.context} tok · ` : ''}
                      {fmtBytes(m.size)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Active pull progress */}
          {pullStatus && (pullStatus.state === 'pulling' || pullStatus.state === 'done' || pullStatus.state === 'error') && (
            <div className={`pull-progress-block ${pullStatus.state}`}>
              <div className="pull-progress-header">
                <span>
                  {pullStatus.state === 'pulling' && <span className="btn-spinner" />}
                  {pullStatus.state === 'done' && '✓ '}
                  {pullStatus.state === 'error' && '✕ '}
                  <strong>{pullStatus.model}</strong>
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

          {pullMsg && <div className="pull-error-msg">{pullMsg}</div>}

          {/* Catalog — Embedding */}
          <CatalogGroup
            title="Embedding models"
            items={catalog.filter(c => c.type === 'embedding')}
            isInstalled={isInstalled}
            pullingModel={pullingModel}
            onPull={handlePull}
          />

          {/* Catalog — LLM */}
          <CatalogGroup
            title="LLM models (for contextual chunking)"
            items={catalog.filter(c => c.type === 'llm')}
            isInstalled={isInstalled}
            pullingModel={pullingModel}
            onPull={handlePull}
          />

          {unknownModels.length > 0 && (
            <div className="catalog-group">
              <div className="catalog-group-title">Other installed models</div>
              {unknownModels.map(m => (
                <div key={m.name} className="catalog-row">
                  <div className="catalog-row-info">
                    <code>{m.name.replace(':latest', '')}</code>
                    <span className="catalog-note muted">{fmtBytes(m.size)}</span>
                  </div>
                  <span className="pull-installed">✓ Installed</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── HUGGINGFACE SECTION ── */}
        <section className="drawer-section">
          <h3>
            <span className="source-badge hf">🤗 HuggingFace</span>
            Local inference models
          </h3>
          <p className="drawer-hint">
            These models run directly inside the backend container (no API key at inference time).
            Download once — stored in the container volume.
          </p>

          {jinaStatus && (
            <div className="model-card">
              <div className="model-card-row">
                <span className={`status-dot ${jinaStatus.downloaded ? 'status-ready' : jinaStatus.state === 'downloading' ? 'status-busy' : 'status-idle'}`} />
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
                <button className="download-btn" onClick={handleDownloadJina}>
                  Download (~2 GB)
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── HOW LATE CHUNKING WORKS ── */}
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

// ── Catalog group sub-component ───────────────────────────────────────────────

interface CatalogGroupProps {
  title: string
  items: OllamaCatalogItem[]
  isInstalled: (name: string) => boolean
  pullingModel: string | null
  onPull: (name: string) => void
}

function CatalogGroup({ title, items, isInstalled, pullingModel, onPull }: CatalogGroupProps) {
  return (
    <div className="catalog-group">
      <div className="catalog-group-title">{title}</div>
      {items.map(item => {
        const installed = isInstalled(item.name)
        const pulling = pullingModel === item.name
        return (
          <div key={item.name} className={`catalog-row${installed ? ' catalog-row-installed' : ''}`}>
            <div className="catalog-row-info">
              <code className="catalog-model-name">{item.name}</code>
              {item.dims && <span className="catalog-meta">{item.dims}d</span>}
              <span className="catalog-meta">{item.context} tok</span>
              <span className="catalog-meta">{item.size}</span>
              <span className="catalog-note">{item.note}</span>
            </div>
            <div className="catalog-row-action">
              {installed ? (
                <span className="pull-installed">✓ Installed</span>
              ) : pulling ? (
                <span className="pull-btn-busy"><span className="btn-spinner" /> Pulling…</span>
              ) : (
                <button
                  className="pull-btn"
                  onClick={() => onPull(item.name)}
                  disabled={pullingModel !== null}
                >
                  Pull
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
