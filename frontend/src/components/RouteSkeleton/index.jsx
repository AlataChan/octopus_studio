export default function RouteSkeleton() {
  return (
    <main
      aria-label="Loading route"
      data-testid="route-skeleton"
      className="min-h-screen bg-page-texture px-4 py-6 text-theme-text-primary md:px-8"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="rounded-[16px] border border-theme-sidebar-border bg-theme-bg-sidebar p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] light:border-none">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-theme-sidebar-item-default animate-pulse" />
            <div className="flex flex-1 flex-col gap-3">
              <div className="h-4 w-44 rounded bg-theme-sidebar-item-default animate-pulse" />
              <div className="h-3 w-64 max-w-full rounded bg-theme-sidebar-item-default animate-pulse" />
            </div>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-[260px_1fr]">
          <div className="hidden rounded-[16px] border border-theme-sidebar-border bg-theme-bg-sidebar p-4 light:border-none md:block">
            <div className="space-y-3">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-10 rounded-lg bg-theme-sidebar-item-default animate-pulse"
                />
              ))}
            </div>
          </div>

          <div className="rounded-[16px] border border-theme-sidebar-border bg-theme-bg-secondary p-5 light:border-none">
            <div className="space-y-5">
              <div className="h-6 w-56 max-w-full rounded bg-theme-sidebar-item-default animate-pulse" />
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-24 rounded-xl bg-theme-sidebar-item-default animate-pulse"
                  />
                ))}
              </div>
              <div className="space-y-3">
                <div className="h-4 w-full rounded bg-theme-sidebar-item-default animate-pulse" />
                <div className="h-4 w-11/12 rounded bg-theme-sidebar-item-default animate-pulse" />
                <div className="h-4 w-8/12 rounded bg-theme-sidebar-item-default animate-pulse" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
