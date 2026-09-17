import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/types";
import { formatCZK } from "@/lib/format";
import { computeMaxBuyPrice, type AssumptionsInput } from "@/lib/calc";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: { photos: { take: 1, orderBy: { sortOrder: "asc" } }, assumptions: true }
  });

  const byStatus = new Map<string, typeof projects>();
  for (const status of PROJECT_STATUSES) byStatus.set(status, []);
  for (const p of projects) {
    if (!byStatus.has(p.status)) byStatus.set(p.status, []);
    byStatus.get(p.status)!.push(p);
  }

  return (
    <div>
      <h1 className="mb-8 font-serif text-3xl text-ink">Historie projektů</h1>
      {projects.length === 0 ? (
        <p className="text-sm text-muted">
          Zatím žádné projekty. <Link href="/" className="text-beige-500 underline">Analyzujte první nemovitost</Link>.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {PROJECT_STATUSES.map((status) => {
            const items = byStatus.get(status) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={status}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  {PROJECT_STATUS_LABELS[status]} · {items.length}
                </h2>
                <div className="space-y-4">
                  {items.map((p) => {
                    const maxBuy = p.assumptions
                      ? computeMaxBuyPrice(p.assumptions as unknown as AssumptionsInput)
                      : null;
                    return (
                      <Link
                        key={p.id}
                        href={`/project/${p.id}`}
                        className="block overflow-hidden rounded-xl2 border border-line bg-card shadow-card transition-shadow hover:shadow-soft"
                      >
                        {p.photos[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photos[0].url} alt="" className="h-36 w-full object-cover" />
                        ) : (
                          <div className="flex h-36 w-full items-center justify-center bg-beige-100 text-xs text-muted">
                            Bez fotografie
                          </div>
                        )}
                        <div className="p-4">
                          <div className="truncate font-medium text-ink">{p.title || "Nepojmenovaná nemovitost"}</div>
                          <div className="mt-0.5 truncate text-xs text-muted">
                            {[p.municipality, p.district].filter(Boolean).join(" · ") || "Lokalita neznámá"}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <div className="text-muted">Nabídková</div>
                              <div className="font-medium number-tabular">{formatCZK(p.askingPrice)}</div>
                            </div>
                            <div>
                              <div className="text-muted">Cílová</div>
                              <div className="font-medium number-tabular">{formatCZK(p.targetPrice)}</div>
                            </div>
                            <div>
                              <div className="text-muted">Max. nákupní</div>
                              <div className="font-medium number-tabular">
                                {maxBuy && Number.isFinite(maxBuy) ? formatCZK(maxBuy) : "—"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
