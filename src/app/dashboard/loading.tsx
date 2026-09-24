export default function DashboardLoading() {
  return (
    <div className="p-5 md:p-8 space-y-6 max-w-[1400px] animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="h-3 w-28 rounded bg-licet-gold/50" />
        <div className="h-8 w-72 rounded bg-licet-cream" />
        <div className="h-3 w-96 max-w-full rounded bg-muted" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-border border-t-[3px] border-t-licet-gold bg-card" />
        ))}
      </div>
      <div className="h-72 rounded-xl border border-border bg-card" />
    </div>
  )
}
