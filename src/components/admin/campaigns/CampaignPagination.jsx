const pagerButton =
  "px-3 py-1.5 text-sm rounded-lg border border-navy-200 bg-white text-navy-600 hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed";

// Same footer layout as EventsListPage. `page` is 1-based.
export default function CampaignPagination({
  page,
  perPage,
  total,
  onPageChange,
  noun = "items",
  perPageOptions,
  onPerPageChange,
}) {
  if (!total) return null;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(page, pages);
  const start = (current - 1) * perPage + 1;
  const end = Math.min(current * perPage, total);
  return (
    <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex flex-wrap items-center gap-4 text-sm text-navy-500">
        <p>
          Showing <span className="font-medium text-navy-700">{start}</span> -{" "}
          <span className="font-medium text-navy-700">{end}</span> of{" "}
          <span className="font-medium text-navy-700">{total}</span> {noun}
        </p>
        {perPageOptions && onPerPageChange && (
          <label className="inline-flex items-center gap-2">
            Rows per page
            <select
              aria-label="Rows per page"
              value={perPage}
              onChange={(e) => onPerPageChange(Number(e.target.value))}
              className="px-2 py-1 rounded-lg border border-navy-200 bg-white text-navy-700 text-sm"
            >
              {perPageOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, current - 1))}
          disabled={current === 1}
          className={pagerButton}
        >
          Previous
        </button>
        <span className="text-sm text-navy-600 px-2">
          Page <span className="font-semibold text-navy-800">{current}</span> of{" "}
          <span className="font-semibold text-navy-800">{pages}</span>
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pages, current + 1))}
          disabled={current === pages}
          className={pagerButton}
        >
          Next
        </button>
      </div>
    </div>
  );
}
