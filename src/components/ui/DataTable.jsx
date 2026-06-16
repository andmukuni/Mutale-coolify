import EmptyState from '../EmptyState';

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  emptyTitle = 'No data found',
  emptyDescription = 'There are no items to display.',
  emptyAction,
  onRowClick,
}) {
  const getCellValue = (row, col) => (
    col.render
      ? col.render(row[col.key], row)
      : row[col.key]
  );

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 bg-navy-50">
                {columns.map((col, i) => (
                  <th key={i} className="text-left px-4 py-3">
                    <div className="h-3 bg-navy-200 rounded w-16 animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr key={rowIdx} className="border-b border-navy-50">
                  {columns.map((_, colIdx) => (
                    <td key={colIdx} className="px-4 py-3">
                      <div className="h-3 bg-navy-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-navy-100 p-8">
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-navy-100 bg-navy-50">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 font-semibold text-navy-700 ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr
                key={row.id || rowIdx}
                className={`border-b border-navy-50 hover:bg-navy-50/50 transition-colors ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
                onClick={() => onRowClick && onRowClick(row)}
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    className={`px-4 py-3 ${
                      col.align === 'right' ? 'text-right' : ''
                    }`}
                  >
                    {getCellValue(row, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden divide-y divide-navy-100">
        {data.map((row, rowIdx) => (
          <article
            key={row.id || rowIdx}
            onClick={() => onRowClick && onRowClick(row)}
            className={`p-4 ${onRowClick ? 'cursor-pointer active:bg-navy-50 transition-colors' : ''}`}
          >
            <div className="space-y-2">
              {columns.map((col, colIdx) => {
                const value = getCellValue(row, col);
                return (
                  <div key={col.key || colIdx} className="flex items-start justify-between gap-3">
                    <span className="text-xs font-medium text-navy-500 uppercase tracking-wide">{col.label}</span>
                    <div className={`text-sm text-navy-800 text-right ${colIdx === 0 ? 'font-semibold' : ''}`}>
                      {value ?? '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
