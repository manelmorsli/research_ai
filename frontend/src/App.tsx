import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import ResultsPanel from './components/ResultsPanel'
import SettingsDrawer from './components/SettingsDrawer'
import { STRATEGY_CONFIG } from './config'
import { runChunking, runEmbedding } from './api'
import type { Mode, ViewMode, RunParams, ChunkResponse, EmbedResponse } from './types'

function getActiveEmbedModel(strategy: string, params: RunParams, mode: Mode): string | null {
  if (mode !== 'embed') return null
  if (strategy === 'late-chunking') return 'jina:jina-embeddings-v3'
  if (strategy === 'semantic' || strategy === 'hybrid-sem-hier') return `ollama:${params.semanticEmbedModel}`
  if (strategy === 'hybrid-para-sem') return `ollama:${params.paraSemEmbedModel}`
  return params.embedModel
}

const DEFAULT_PARAMS: RunParams = {
  chunkSize: 500,
  overlapType: 'chars',
  overlapValue: 50,
  snapBoundary: 'none',
  percentileThreshold: 85,
  semanticEmbedModel: 'bge-m3',
  parentChunkSize: 1024,
  childChunkSize: 256,
  childChunkOverlap: 50,
  llmModel: 'qwen2.5:1.5b',
  hybridChildSize: 256,
  hybridChildOverlap: 50,
  similarityThreshold: 0.85,
  maxMergedSize: 1500,
  paraSemEmbedModel: 'bge-m3',
  minSectionSize: 100,
  lateChunkMode: 'fixed',
  pdfMode: 'text',
  embedModel: 'ollama:bge-m3',
}

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('chunk')
  const [strategy, setStrategy] = useState('paragraph')
  const [params, setParams] = useState<RunParams>(DEFAULT_PARAMS)
  const [results, setResults] = useState<ChunkResponse | EmbedResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')

  const update = useCallback(<K extends keyof RunParams>(key: K, val: RunParams[K]) => {
    setParams(p => ({ ...p, [key]: val }))
  }, [])

  // When strategy changes, set sensible overlap defaults
  const handleStrategyChange = useCallback((s: string) => {
    setStrategy(s)
    const cfg = STRATEGY_CONFIG[s]
    if (cfg?.overlapType) {
      setParams(p => ({ ...p, overlapType: cfg.overlapType!, overlapValue: cfg.overlapValue ?? 50 }))
    }
  }, [])

  const handleRun = useCallback(async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const data = mode === 'embed'
        ? await runEmbedding(file, strategy, params)
        : await runChunking(file, strategy, params)
      setResults(data)
      setViewMode('cards')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [file, mode, strategy, params])

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <h1>Research AI <span>chunking &amp; embedding lab</span></h1>
        </div>
        <button className="header-settings-btn" onClick={() => setSettingsOpen(true)} title="Settings / Models">
          ⚙ Settings
        </button>
      </header>

      <div className="app-body">
        <Sidebar
          file={file}
          setFile={setFile}
          mode={mode}
          setMode={setMode}
          strategy={strategy}
          setStrategy={handleStrategyChange}
          params={params}
          update={update}
          onRun={handleRun}
          loading={loading}
          onSettings={() => setSettingsOpen(true)}
        />

        <ResultsPanel
          results={results}
          mode={mode}
          strategy={strategy}
          activeEmbedModel={getActiveEmbedModel(strategy, params, mode)}
          loading={loading}
          error={error}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      </div>

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
