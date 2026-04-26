import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchCompany, fetchGenerations, fetchGallery, triggerGenerate, triggerRescrape } from '../api'
import type { Company, SiteGeneration, GalleryEntry } from '../types'

// ---------------------------------------------------------------------------
// Language list (label + BCP-47 code)
// ---------------------------------------------------------------------------
const LANGUAGES: { label: string; code: string }[] = [
  { label: 'Korean', code: 'ko' },
  { label: 'English', code: 'en' },
  { label: 'Japanese', code: 'ja' },
  { label: 'Chinese (Simplified)', code: 'zh-CN' },
  { label: 'Chinese (Traditional)', code: 'zh-TW' },
  { label: 'Spanish', code: 'es' },
  { label: 'French', code: 'fr' },
  { label: 'German', code: 'de' },
  { label: 'Italian', code: 'it' },
  { label: 'Portuguese (Brazil)', code: 'pt-BR' },
  { label: 'Portuguese (Portugal)', code: 'pt-PT' },
  { label: 'Russian', code: 'ru' },
  { label: 'Arabic', code: 'ar' },
  { label: 'Hindi', code: 'hi' },
  { label: 'Bengali', code: 'bn' },
  { label: 'Turkish', code: 'tr' },
  { label: 'Vietnamese', code: 'vi' },
  { label: 'Thai', code: 'th' },
  { label: 'Indonesian', code: 'id' },
  { label: 'Malay', code: 'ms' },
  { label: 'Dutch', code: 'nl' },
  { label: 'Polish', code: 'pl' },
  { label: 'Ukrainian', code: 'uk' },
  { label: 'Swedish', code: 'sv' },
  { label: 'Norwegian', code: 'no' },
  { label: 'Danish', code: 'da' },
  { label: 'Finnish', code: 'fi' },
  { label: 'Greek', code: 'el' },
  { label: 'Czech', code: 'cs' },
  { label: 'Romanian', code: 'ro' },
  { label: 'Hungarian', code: 'hu' },
  { label: 'Hebrew', code: 'he' },
  { label: 'Persian', code: 'fa' },
  { label: 'Swahili', code: 'sw' },
  { label: 'Filipino', code: 'fil' },
]

// ---------------------------------------------------------------------------
// Mood presets
// ---------------------------------------------------------------------------
const MOOD_PRESETS = [
  { label: 'Professional', colors: ['#1a1a2e', '#16213e', '#0f3460', '#e94560'] },
  { label: 'Fresh',        colors: ['#2d6a4f', '#40916c', '#74c69d', '#b7e4c7'] },
  { label: 'Warm',         colors: ['#e76f51', '#f4a261', '#e9c46a', '#264653'] },
  { label: 'Minimal',      colors: ['#ffffff', '#f5f5f5', '#222222', '#888888'] },
] as const

function parseColors(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as string[]
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as string[]
    return []
  } catch {
    return []
  }
}

function bigScoreColor(score: number | null): string {
  if (score === null) return 'text-gray-500'
  if (score >= 70) return 'text-emerald-400'
  if (score >= 40) return 'text-yellow-400'
  return 'text-red-400'
}

function ScoreBlock({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 text-center">
      <div className={`text-4xl font-bold ${bigScoreColor(score)}`}>
        {score !== null ? score : '—'}
      </div>
      <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{label}</div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className="text-sm text-gray-200">{value}</dd>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-gray-700 rounded w-1/3" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="aspect-video bg-gray-700 rounded-xl" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DetailPage() {
  const { id } = useParams<{ id: string }>()

  // Company data
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Generated sites list
  const [generations, setGenerations] = useState<SiteGeneration[]>([])

  // Gallery screenshots
  const [galleryEntries, setGalleryEntries] = useState<GalleryEntry[]>([])

  // Gradient image failed to load
  const [gradientError, setGradientError] = useState(false)

  // Generation UI state
  const [showOptions, setShowOptions] = useState(false)
  const [extraPrompt, setExtraPrompt] = useState('')
  const [selectedMood, setSelectedMood] = useState<number | null>(null)
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0])
  const [generating, setGenerating] = useState(false)
  const [genElapsed, setGenElapsed] = useState(0)
  const [genError, setGenError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Rescrape UI state
  const [rescraping, setRescraping] = useState(false)
  const [rescrapeError, setRescrapeError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    setGradientError(false)
    Promise.all([fetchCompany(id), fetchGenerations(id), fetchGallery(id)])
      .then(([c, gens, galleryData]) => {
        setCompany(c)
        setGenerations(gens)
        setGalleryEntries(galleryData.screenshots)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  // Elapsed-time counter while generating
  useEffect(() => {
    if (generating) {
      setGenElapsed(0)
      timerRef.current = setInterval(() => {
        setGenElapsed((s) => s + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [generating])

  async function handleGenerate() {
    if (!id) return
    setGenerating(true)
    setGenError(null)
    try {
      const colorBoard =
        selectedMood !== null ? [...MOOD_PRESETS[selectedMood].colors] : undefined
      const result = await triggerGenerate(id, {
        extra_prompt: extraPrompt || undefined,
        color_board: colorBoard,
        language: selectedLang.label,
        language_code: selectedLang.code,
      })
      setGenerations((prev) => [result, ...prev])
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function handleRescrape() {
    if (!id) return
    setRescraping(true)
    setRescrapeError(null)
    try {
      const updated = await triggerRescrape(id)
      setCompany(updated)
    } catch (err) {
      setRescrapeError(err instanceof Error ? err.message : 'Rescrape failed')
    } finally {
      setRescraping(false)
    }
  }

  if (loading) return <Skeleton />

  if (error) {
    return (
      <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
        {error}
      </div>
    )
  }

  if (!company) return null

  const colors = parseColors(company.main_colors)
  const screenshotSrc = company.screenshot_path ? `/data/${company.screenshot_path}` : null
  const gradientSrc = company.screenshot_path
    ? `/data/${company.screenshot_path.replace(/screenshot\.png$/, 'gradient.png')}`
    : null
  const websiteDir = company.screenshot_path
    ? company.screenshot_path.replace(/\/[^/]+$/, '')
    : null
  const scrapedDate = company.scraped_at
    ? new Date(company.scraped_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <header className="space-y-1 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{company.name}</h1>
            {company.upgraded_webpage_count > 0 && (
              <span className="bg-emerald-400 text-gray-900 text-xs font-bold px-2.5 py-0.5 rounded-full">
                NEW
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-sm text-gray-400">
            {company.domain && (
              <a
                href={company.url ?? `https://${company.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-emerald-400 transition-colors underline underline-offset-2"
              >
                {company.domain}
              </a>
            )}
            {scrapedDate && <span>Scraped {scrapedDate}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleRescrape}
            disabled={rescraping}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            {rescraping ? (
              <>
                <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Rescraping...
              </>
            ) : (
              'Rescrape'
            )}
          </button>
          {rescrapeError && (
            <span className="text-xs text-red-400 max-w-[200px] text-right">{rescrapeError}</span>
          )}
        </div>
      </header>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: screenshot, then gradient + palette as separate units */}
        <div className="space-y-3">
          {/* Screenshot */}
          <div className="rounded-xl overflow-hidden bg-gray-800 border border-gray-700">
            {screenshotSrc ? (
              <img
                src={screenshotSrc}
                alt={`Screenshot of ${company.domain ?? company.name}`}
                className="w-full h-auto"
              />
            ) : (
              <div className="aspect-video flex items-center justify-center text-gray-500 text-sm">
                No screenshot available
              </div>
            )}
          </div>

          {/* Gradient strip */}
          {gradientSrc && !gradientError && (
            <div className="rounded-xl overflow-hidden border border-gray-700 space-y-0">
              <div className="px-3 py-1.5 bg-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Color Gradient</span>
              </div>
              <img
                src={gradientSrc}
                alt="Color gradient"
                className="w-full block"
                style={{ height: '40px', objectFit: 'cover' }}
                onError={() => setGradientError(true)}
              />
            </div>
          )}

          {/* Color palette */}
          {colors.length > 0 && (
            <div className="rounded-xl bg-gray-800 border border-gray-700 p-4 space-y-3">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider">Extracted Colors</h3>
              <div className="flex flex-wrap gap-3">
                {colors.map((hex, i) => (
                  <div key={`${hex}-${i}`} className="flex flex-col items-center gap-1.5">
                    <div
                      className="w-10 h-10 rounded-lg border border-gray-600 shadow"
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                    <span className="text-xs text-gray-400 font-mono">{hex}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing color data warning */}
          {gradientError && colors.length === 0 && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-yellow-900/30 border border-yellow-700/40 rounded-xl text-yellow-400 text-xs">
              <span aria-hidden="true">&#9888;</span>
              <span>No color data — run <code className="font-mono text-yellow-300">backfill-colors</code></span>
            </div>
          )}
        </div>

        {/* Right: metadata */}
        <div className="space-y-5">
          {/* Score blocks */}
          <div className="grid grid-cols-2 gap-3">
            <ScoreBlock label="SEO Score" score={company.seo_score} />
            <ScoreBlock label="Design Quality" score={company.design_quality_score} />
          </div>

          {/* Meta fields */}
          <dl className="bg-gray-800 rounded-xl p-4 space-y-3 border border-gray-700">
            <MetaRow label="Industry" value={company.industry} />
            <MetaRow label="Company size" value={company.company_size} />
            <MetaRow label="What they sell" value={company.what_they_sell} />
            <MetaRow label="Mood" value={company.mood} />
            <MetaRow label="Style" value={company.style} />
            {company.design_last_modified_year !== null && (
              <MetaRow
                label="Last modified year"
                value={String(company.design_last_modified_year)}
              />
            )}
          </dl>

        </div>
      </div>

      {/* Copy section */}
      {company.copy && (
        <section className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-2">
          <h2 className="text-xs text-gray-500 uppercase tracking-wider">Extracted Copy</h2>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{company.copy}</p>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Scraped screenshots gallery                                         */}
      {/* ------------------------------------------------------------------ */}
      {galleryEntries.length > 0 && websiteDir && (
        <section className="space-y-3">
          <h2 className="text-xs text-gray-500 uppercase tracking-wider">
            Screenshots <span className="text-gray-600 normal-case">({galleryEntries.length})</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {galleryEntries.map((entry) => {
              const gradientFile = entry.file.replace('screenshot', 'gradient')
              return (
                <div key={entry.file} className="space-y-0 rounded-xl overflow-hidden bg-gray-800 border border-gray-700">
                  <img
                    src={`/data/${websiteDir}/${entry.file}`}
                    alt={entry.label}
                    className="w-full h-auto"
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                  <img
                    src={`/data/${websiteDir}/${gradientFile}`}
                    alt=""
                    className="w-full block"
                    style={{ height: '12px', objectFit: 'cover' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                  <p className="text-xs text-gray-500 text-center px-2 py-1.5">{entry.label}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Generate section                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
        <h2 className="text-xs text-gray-500 uppercase tracking-wider">Website Generator</h2>

        {/* Primary action row */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedLang.code}
            onChange={(e) => {
              const lang = LANGUAGES.find(l => l.code === e.target.value)
              if (lang) setSelectedLang(lang)
            }}
            disabled={generating}
            className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {generating ? (
              <>
                {/* Spinner */}
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating… {genElapsed}s
              </>
            ) : (
              'Create New Website'
            )}
          </button>

          <button
            onClick={() => setShowOptions((v) => !v)}
            className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            {showOptions ? '▴' : '▾'} More options
          </button>
        </div>

        {/* Expanded options */}
        {showOptions && (
          <div className="space-y-4 pt-1">
            {/* Custom prompt */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase tracking-wider">Custom prompt</label>
              <textarea
                value={extraPrompt}
                onChange={(e) => setExtraPrompt(e.target.value)}
                rows={3}
                placeholder="Describe any specific requirements…"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            {/* Mood presets */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Mood</p>
              <div className="flex flex-wrap gap-2">
                {MOOD_PRESETS.map((preset, i) => (
                  <button
                    key={preset.label}
                    onClick={() => setSelectedMood(selectedMood === i ? null : i)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      selectedMood === i
                        ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300'
                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {preset.colors.map((c) => (
                      <span
                        key={c}
                        className="w-3 h-3 rounded-sm border border-black/20 shrink-0"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {genError && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {genError}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Generated sites gallery                                             */}
      {/* ------------------------------------------------------------------ */}
      {generations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs text-gray-500 uppercase tracking-wider">Generated Sites</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {generations.map((gen) => {
              const screenshotUrl = gen.screenshot_path ? `/data/${gen.screenshot_path}` : null
              const htmlUrl = gen.html_path ? `/data/${gen.html_path}` : null
              const generatedDate = new Date(gen.created_at).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
              return (
                <div
                  key={gen.id}
                  className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 flex flex-col"
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-gray-700 overflow-hidden">
                    {screenshotUrl ? (
                      <img
                        src={screenshotUrl}
                        alt={`Generated site ${gen.id}`}
                        className="w-full h-full object-cover object-top"
                        loading="lazy"
                        onError={(e) => {
                          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                        No screenshot
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="p-3 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-gray-400">{generatedDate}</span>
                    {htmlUrl && (
                      <a
                        href={htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors underline underline-offset-2"
                      >
                        View HTML →
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Back link */}
      <div className="pt-2">
        <Link
          to="/"
          className="text-sm text-gray-500 hover:text-emerald-400 transition-colors"
        >
          ← Back to Gallery
        </Link>
      </div>
    </div>
  )
}
