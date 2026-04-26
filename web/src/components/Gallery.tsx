import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchCompanies } from '../api'
import type { FetchCompaniesParams } from '../api'
import type { Company, SortDir, SortField } from '../types'
import CompanyCard from './CompanyCard'

const LIMIT = 20

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'seo_score', label: 'SEO Score' },
  { value: 'design_quality_score', label: 'Design Quality' },
  { value: 'design_last_modified_year', label: 'Last Modified Year' },
  { value: 'screenshot_count', label: 'Screenshot Count' },
  { value: 'scraped_at', label: 'Scrape Date' },
  { value: 'name', label: 'Name' },
]

const SIZE_OPTIONS = ['small', 'medium', 'large'] as const

interface Filters {
  industry: string
  company_size: string
  min_score: string
  max_score: string
  mood: string
  style: string
  metadata_filter: '' | 'missing' | 'has'
  screenshot_filter: '' | 'missing' | 'has' | 'multiple'
}

const EMPTY_FILTERS: Filters = {
  industry: '',
  company_size: '',
  min_score: '',
  max_score: '',
  mood: '',
  style: '',
  metadata_filter: '',
  screenshot_filter: '',
}

function filtersFromParams(params: URLSearchParams): Filters {
  const mf = params.get('metadata_filter') || ''
  const sf = params.get('screenshot_filter') || ''
  return {
    industry: params.get('industry') || '',
    company_size: params.get('company_size') || '',
    min_score: params.get('min_score') || '',
    max_score: params.get('max_score') || '',
    mood: params.get('mood') || '',
    style: params.get('style') || '',
    metadata_filter: (mf === 'missing' || mf === 'has') ? mf : '',
    screenshot_filter: (sf === 'missing' || sf === 'has' || sf === 'multiple') ? sf : '',
  }
}

function Skeleton() {
  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 animate-pulse">
      <div className="aspect-video bg-gray-700" />
      <div className="p-3 space-y-3">
        <div className="h-4 bg-gray-700 rounded w-3/4" />
        <div className="h-2 bg-gray-700 rounded w-full" />
        <div className="h-2 bg-gray-700 rounded w-full" />
        <div className="h-2 bg-gray-700 rounded w-1/2" />
      </div>
    </div>
  )
}

function PageButton({
  page,
  current,
  onClick,
}: {
  page: number
  current: number
  onClick: (p: number) => void
}) {
  return (
    <button
      onClick={() => onClick(page)}
      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
        page === current
          ? 'bg-emerald-500 text-gray-900'
          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
      }`}
    >
      {page}
    </button>
  )
}

export default function Gallery() {
  const [searchParams, setSearchParams] = useSearchParams()

  // URL is single source of truth for these
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const sort = (searchParams.get('sort') || 'seo_score') as SortField
  const dir = (searchParams.get('dir') || 'desc') as SortDir
  const search = searchParams.get('search') || ''
  const applied = filtersFromParams(searchParams)

  // Local state only
  const [companies, setCompanies] = useState<Company[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Filters>(() => filtersFromParams(searchParams))
  const [searchInput, setSearchInput] = useState(search)

  const hasActiveFilters = Object.values(applied).some((v) => v !== '') || search !== ''

  // Debounce search input → URL
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleSearchChange(value: string) {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set('search', value)
        else next.delete('search')
        next.delete('page')
        return next
      }, { replace: true })
    }, 300)
  }

  function clearSearch() {
    setSearchInput('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('search')
      next.delete('page')
      return next
    }, { replace: true })
  }

  // Fetch when URL changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const params: FetchCompaniesParams = { page, limit: LIMIT, sort, dir }
    if (search) params.search = search
    if (applied.industry) params.industry = applied.industry
    if (applied.company_size) params.company_size = applied.company_size
    if (applied.min_score !== '') params.min_score = Number(applied.min_score)
    if (applied.max_score !== '') params.max_score = Number(applied.max_score)
    if (applied.mood) params.mood = applied.mood
    if (applied.style) params.style = applied.style
    if (applied.metadata_filter === 'missing') params.missing_metadata = true
    if (applied.metadata_filter === 'has') params.has_metadata = true
    if (applied.screenshot_filter === 'missing') params.missing_screenshot = true
    if (applied.screenshot_filter === 'has') params.has_screenshot = true
    if (applied.screenshot_filter === 'multiple') params.has_multiple_screenshots = true

    fetchCompanies(params)
      .then((data) => {
        if (!cancelled) {
          setCompanies(data.companies)
          setTotal(data.total)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load companies')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()])

  // Keep draft in sync when navigating back (searchParams change externally)
  const prevParamsRef = useRef(searchParams.toString())
  useEffect(() => {
    const cur = searchParams.toString()
    if (cur !== prevParamsRef.current) {
      prevParamsRef.current = cur
      setDraft(filtersFromParams(searchParams))
      setSearchInput(searchParams.get('search') || '')
    }
  }, [searchParams])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  function setPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (p === 1) next.delete('page')
      else next.set('page', String(p))
      return next
    }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSort(newSort: SortField) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('sort', newSort)
      next.delete('page')
      return next
    }, { replace: true })
  }

  function handleDirToggle() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('dir', dir === 'desc' ? 'asc' : 'desc')
      next.delete('page')
      return next
    }, { replace: true })
  }

  function handleApply() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const set = (k: string, v: string) => v ? next.set(k, v) : next.delete(k)
      set('industry', draft.industry)
      set('company_size', draft.company_size)
      set('min_score', draft.min_score)
      set('max_score', draft.max_score)
      set('mood', draft.mood)
      set('style', draft.style)
      set('metadata_filter', draft.metadata_filter)
      set('screenshot_filter', draft.screenshot_filter)
      next.delete('page')
      return next
    }, { replace: true })
  }

  function handleReset() {
    setDraft(EMPTY_FILTERS)
    setSearchInput('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  function updateDraft(field: keyof Filters, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  const isTyping = searchInput !== search

  // Build visible page numbers (show up to 7 around current)
  const pageNumbers: number[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i)
  } else {
    const start = Math.max(1, page - 3)
    const end = Math.min(totalPages, page + 3)
    if (start > 1) pageNumbers.push(1)
    if (start > 2) pageNumbers.push(-1)
    for (let i = start; i <= end; i++) pageNumbers.push(i)
    if (end < totalPages - 1) pageNumbers.push(-2)
    if (end < totalPages) pageNumbers.push(totalPages)
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search companies…"
          className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-4 py-2.5 pl-10 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
          {isTyping || loading ? '⟳' : '🔍'}
        </span>
        {searchInput && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Sort controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400 whitespace-nowrap">Sort by</label>
          <select
            value={sort}
            onChange={(e) => handleSort(e.target.value as SortField)}
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleDirToggle}
          className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 text-sm text-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          title="Toggle sort direction"
        >
          <span>{dir === 'desc' ? '↓' : '↑'}</span>
          <span>{dir === 'desc' ? 'Desc' : 'Asc'}</span>
        </button>

        {!loading && (
          <span className="ml-auto text-sm text-gray-500">
            {total} companies
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {/* Industry */}
          <div className="flex flex-col gap-1 min-w-[180px] flex-1">
            <label className="text-xs text-gray-400">Industry</label>
            <input
              type="text"
              value={draft.industry}
              onChange={(e) => updateDraft('industry', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              placeholder="e.g. 반도체"
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Company size */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs text-gray-400">Company size</label>
            <select
              value={draft.company_size}
              onChange={(e) => updateDraft('company_size', e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All sizes</option>
              {SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Design score range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Design score</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={draft.min_score}
                onChange={(e) => updateDraft('min_score', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                placeholder="Min"
                min={0}
                max={100}
                className="w-20 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-2 py-1.5 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-gray-600 text-sm">–</span>
              <input
                type="number"
                value={draft.max_score}
                onChange={(e) => updateDraft('max_score', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                placeholder="Max"
                min={0}
                max={100}
                className="w-20 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-2 py-1.5 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Mood */}
          <div className="flex flex-col gap-1 min-w-[140px] flex-1">
            <label className="text-xs text-gray-400">Mood</label>
            <input
              type="text"
              value={draft.mood}
              onChange={(e) => updateDraft('mood', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              placeholder="e.g. professional"
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Style */}
          <div className="flex flex-col gap-1 min-w-[140px] flex-1">
            <label className="text-xs text-gray-400">Style</label>
            <input
              type="text"
              value={draft.style}
              onChange={(e) => updateDraft('style', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              placeholder="e.g. minimal"
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Metadata filter */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-xs text-gray-400">Metadata</label>
            <select
              value={draft.metadata_filter}
              onChange={(e) => updateDraft('metadata_filter', e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All</option>
              <option value="has">Has metadata</option>
              <option value="missing">Missing metadata</option>
            </select>
          </div>

          {/* Screenshot filter */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-xs text-gray-400">Screenshot</label>
            <select
              value={draft.screenshot_filter}
              onChange={(e) => updateDraft('screenshot_filter', e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All</option>
              <option value="has">Has screenshot</option>
              <option value="multiple">Multiple screenshots</option>
              <option value="missing">Missing screenshot</option>
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleApply}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            Apply
          </button>
          {hasActiveFilters && (
            <button
              onClick={handleReset}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-4 py-1.5 rounded-lg transition-colors"
            >
              Reset
            </button>
          )}
          {hasActiveFilters && (
            <span className="text-xs text-emerald-400 ml-1">Filters active</span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: LIMIT }).map((_, i) => <Skeleton key={i} />)
          : companies.map((c) => <CompanyCard key={c.id} company={c} />)}
      </div>

      {/* Empty state */}
      {!loading && companies.length === 0 && !error && (
        <div className="text-center py-20 text-gray-500">No companies found.</div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>

          {pageNumbers.map((p, i) =>
            p < 0 ? (
              <span key={`ellipsis-${i}`} className="px-1 text-gray-600 text-sm">
                …
              </span>
            ) : (
              <PageButton key={p} page={p} current={page} onClick={setPage} />
            ),
          )}

          <button
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
