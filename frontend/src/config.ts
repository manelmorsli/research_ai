export type Panel =
  | 'chunk-size'
  | 'boundary'
  | 'overlap'
  | 'semantic'
  | 'hierarchical'
  | 'llm'
  | 'hybrid-child'
  | 'para-sem'
  | 'section'
  | 'late-chunk'

export interface StrategyMeta {
  label: string
  group: 'Classic' | 'Advanced' | 'Hybrid'
  panels: Panel[]
  overlapType?: string
  overlapValue?: number
  /** True = chunk-only mode just shows a note, benefit is in the embeddings */
  embedOnly?: boolean
  description?: string
}

export const STRATEGY_CONFIG: Record<string, StrategyMeta> = {
  fixed: {
    label: 'Fixed size',
    group: 'Classic',
    panels: ['chunk-size', 'boundary', 'overlap'],
    overlapType: 'chars',
    overlapValue: 50,
  },
  sentence: {
    label: 'Sentence',
    group: 'Classic',
    panels: ['chunk-size', 'overlap'],
    overlapType: 'sentences',
    overlapValue: 1,
  },
  paragraph: {
    label: 'Paragraph',
    group: 'Classic',
    panels: ['overlap'],
    overlapType: 'chars',
    overlapValue: 50,
  },
  recursive: {
    label: 'Recursive',
    group: 'Classic',
    panels: ['chunk-size', 'boundary', 'overlap'],
    overlapType: 'chars',
    overlapValue: 50,
  },
  semantic: {
    label: 'Semantic (similarity-based)',
    group: 'Advanced',
    panels: ['semantic'],
    description: 'Splits where consecutive sentence similarity drops below a percentile threshold.',
  },
  hierarchical: {
    label: 'Hierarchical parent-child',
    group: 'Advanced',
    panels: ['hierarchical'],
    description: 'Large parent chunks contain small child chunks for multi-granularity retrieval.',
  },
  contextual: {
    label: 'Contextual (Anthropic 2024)',
    group: 'Advanced',
    panels: ['overlap', 'llm'],
    overlapType: 'chars',
    overlapValue: 50,
    description: 'LLM generates 1–2 sentences of context per chunk to improve retrieval.',
  },
  'hybrid-sem-hier': {
    label: 'Semantic → Hierarchical',
    group: 'Hybrid',
    panels: ['semantic', 'hybrid-child'],
    description: 'Semantic parents → fixed-size children.',
  },
  'hybrid-rec-ctx': {
    label: 'Recursive → Contextual',
    group: 'Hybrid',
    panels: ['chunk-size', 'boundary', 'overlap', 'llm'],
    overlapType: 'chars',
    overlapValue: 50,
    description: 'Recursive structure-aware splitting + LLM context enrichment.',
  },
  'hybrid-para-sem': {
    label: 'Paragraph → Semantic merge',
    group: 'Hybrid',
    panels: ['para-sem'],
    description: 'Paragraph splits, then adjacent similar paragraphs are merged.',
  },
  'late-chunking': {
    label: 'Late Chunking (jina-embeddings-v3)',
    group: 'Advanced',
    panels: ['late-chunk'],
    embedOnly: true,
    description:
      'Full document is passed through jina-embeddings-v3 once — every token embedding ' +
      'carries the full document context. Choose Fixed mode to pool by size, or ' +
      'Context-aware to let similarity drops define the boundaries automatically.',
  },
  'markdown-headers': {
    label: 'Markdown headers',
    group: 'Advanced',
    panels: ['section'],
    description: 'Splits on # / ## / ### headings. Each section becomes one chunk. Best for .md files.',
  },
  sections: {
    label: 'Section-based (PDF / plain text)',
    group: 'Advanced',
    panels: ['section'],
    description: 'Detects numbered headings, Roman numerals, ALL CAPS titles, and academic keywords to split PDFs into logical sections.',
  },
}

export const OVERLAP_DEFAULTS: Record<string, number> = {
  chars: 50,
  words: 3,
  sentences: 1,
}
