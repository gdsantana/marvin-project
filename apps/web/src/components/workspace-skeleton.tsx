import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function ChartSkeleton({ donut = false, compact = false }: { donut?: boolean; compact?: boolean }) {
  return <div role="status" className={donut ? cn("relative mx-auto flex w-full items-center justify-center", compact ? "h-44 max-w-48" : "my-4 h-56 max-w-64") : "flex h-64 items-end gap-3 px-3 pb-8 pt-4 lg:h-72"}>
    <span className="sr-only">Carregando gráfico</span>
    {donut ? <Skeleton aria-hidden="true" className={cn("rounded-full border-muted bg-transparent", compact ? "size-40 border-[16px]" : "size-48 border-[20px]")} /> : [45, 75, 55, 90, 65, 80].map((height, index) => <Skeleton aria-hidden="true" key={index} className="flex-1 rounded-b-none" style={{ height: `${height}%` }} />)}
  </div>;
}

export function ListSkeleton({ rows = 3, rowClassName = "min-h-16", className = "", compact = false }: { rows?: number; rowClassName?: string; className?: string; compact?: boolean }) {
  return <div role="status" className={`grid ${className}`}>
    <span className="sr-only">Carregando registros</span>
    {Array.from({ length: rows }, (_, item) => <div key={item} aria-hidden="true" className={cn("flex min-w-0 items-center gap-3 py-3", rowClassName)}><Skeleton className={compact ? "size-2.5 shrink-0" : "size-9 shrink-0"} /><div className="grid min-w-0 flex-1 gap-2"><Skeleton className="h-4 w-2/3" />{!compact && <Skeleton className="h-3 w-1/3" />}</div><Skeleton className="h-4 w-20" /></div>)}
  </div>;
}

export function CategorySkeleton() {
  return <div role="status" className="grid gap-3"><span className="sr-only">Carregando categorias</span>{[0, 1, 2].map(item => <div key={item} aria-hidden="true" className="grid h-16 content-start gap-2"><div className="flex justify-between gap-3"><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-12" /></div><Skeleton className="h-1.5 w-full" /><Skeleton className="ml-auto h-3 w-20" /></div>)}</div>;
}
