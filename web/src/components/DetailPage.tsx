import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchCompany } from '../api'
import type { Company } from '../types'

function parseColors(raw: string | null): string[] {
  if (!raw) return []
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
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    fetchCompany(id)
      .then(setCompany)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

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
      <header className="space-y-1">
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
      </header>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: screenshot */}
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

          {/* Color palette */}
          {colors.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Color Palette</p>
              <div className="flex gap-2 flex-wrap">
                {colors.map((hex) => (
                  <div key={hex} className="flex flex-col items-center gap-1">
                    <div
                      className="w-8 h-8 rounded-lg shadow border border-gray-600"
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                    <span className="text-xs text-gray-500 font-mono">{hex}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Copy section */}
      {company.copy && (
        <section className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-2">
          <h2 className="text-xs text-gray-500 uppercase tracking-wider">Extracted Copy</h2>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{company.copy}</p>
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
