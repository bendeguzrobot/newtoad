import { useEffect, useState, useCallback } from 'react'
import { fetchCompanies } from '../api'
import type { Company, SortDir, SortField } from '../types'
import CompanyCard from './CompanyCard'

const LIMIT = 20

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'seo_score', label: 'SEO Score' },
  { value: 'design_quality_score', label: 'Design Quality' },
  { value: 'design_last_modified_year', label: 'Last Modified Year' },
  { value: 'name', label: 'Name' },
]

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
  const [companies, setCompanies] = useState<Company[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortField>('seo_score')
  const [dir, setDir] = useState<SortDir>('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (p: number, s: SortField, d: SortDir) => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchCompanies({ page: p, limit: LIMIT, sort: s, dir: d })
        setCompanies(data.companies)
        setTotal(data.total)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load companies')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    load(page, sort, dir)
  }, [page, sort, dir, load])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  function handleSort(newSort: SortField) {
    setSort(newSort)
    setPage(1)
  }

  function handleDirToggle() {
    setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    setPage(1)
  }

  function handlePage(p: number) {
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Build visible page numbers (show up to 7 around current)
  const pageNumbers: number[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i)
  } else {
    const start = Math.max(1, page - 3)
    const end = Math.min(totalPages, page + 3)
    if (start > 1) pageNumbers.push(1)
    if (start > 2) pageNumbers.push(-1) // ellipsis
    for (let i = start; i <= end; i++) pageNumbers.push(i)
    if (end < totalPages - 1) pageNumbers.push(-2) // ellipsis
    if (end < totalPages) pageNumbers.push(totalPages)
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
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
            onClick={() => handlePage(page - 1)}
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
              <PageButton key={p} page={p} current={page} onClick={handlePage} />
            ),
          )}

          <button
            onClick={() => handlePage(page + 1)}
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
