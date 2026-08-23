import { ChevronLeft, ChevronRight } from "lucide-react";

function visiblePages(current, last) {
  const pages = new Set([1, last, current - 1, current, current + 1]);
  return [...pages].filter((page) => page >= 1 && page <= last).sort((a, b) => a - b);
}

export default function Pagination({ meta, onPageChange, label = "Pagination" }) {
  if (!meta || meta.lastPage <= 1) return null;
  const current = Number(meta.currentPage || 1);
  const last = Number(meta.lastPage || 1);
  const pages = visiblePages(current, last);

  return (
    <nav aria-label={label} className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-gray-500">{meta.total} résultat{meta.total > 1 ? "s" : ""}</p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPageChange(current - 1)} disabled={current <= 1} aria-label="Page précédente" className="rounded-lg border px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        {pages.map((page, index) => (
          <span key={page} className="contents">
            {index > 0 && page - pages[index - 1] > 1 && <span className="px-1 text-gray-400" aria-hidden="true">…</span>}
            <button type="button" onClick={() => onPageChange(page)} aria-label={`Page ${page}`} aria-current={page === current ? "page" : undefined} className={`min-w-9 rounded-lg border px-2.5 py-2 text-sm ${page === current ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-700"}`}>
              {page}
            </button>
          </span>
        ))}
        <button type="button" onClick={() => onPageChange(current + 1)} disabled={current >= last} aria-label="Page suivante" className="rounded-lg border px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
