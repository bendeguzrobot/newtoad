import { useNavigate } from 'react-router-dom'
import type { Company } from '../types'

interface Props {
  company: Company
}

function scoreColor(score: number | null): string {
  if (score === null) return 'bg-gray-600'
  if (score >= 70) return 'bg-emerald-500'
  if (score >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const pct = score !== null ? Math.min(100, Math.max(0, score)) : 0
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className="font-mono">{score !== null ? score : '—'}</span>
      </div>
      <div className="score-bar">
        <div
          className={`score-bar-fill ${scoreColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function CompanyCard({ company }: Props) {
  const navigate = useNavigate()

  const screenshotSrc = company.screenshot_path
    ? `/data/${company.screenshot_path}`
    : null

  return (
    <article
      onClick={() => navigate(`/companies/${company.id}`)}
      className="group bg-gray-800 rounded-xl overflow-hidden cursor-pointer border border-gray-700 hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-900/20 transition-all duration-200"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-700 overflow-hidden">
        {screenshotSrc ? (
          <img
            src={screenshotSrc}
            alt={`Screenshot of ${company.domain ?? company.name}`}
            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            No screenshot
          </div>
        )}

        {/* NEW badge */}
        {company.upgraded_webpage_count > 0 && (
          <span className="absolute top-2 right-2 bg-emerald-400 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full shadow">
            NEW
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-white truncate text-sm">
              {company.domain ?? company.name}
            </p>
            {company.domain && company.domain !== company.name && (
              <p className="text-xs text-gray-400 truncate">{company.name}</p>
            )}
          </div>
          {company.industry && (
            <span className="shrink-0 bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">
              {company.industry}
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <ScoreBar label="SEO" score={company.seo_score} />
          <ScoreBar label="Design" score={company.design_quality_score} />
        </div>

        {company.design_last_modified_year !== null && (
          <p className="text-xs text-gray-500">
            Last updated: <span className="text-gray-400">{company.design_last_modified_year}</span>
          </p>
        )}
      </div>
    </article>
  )
}
