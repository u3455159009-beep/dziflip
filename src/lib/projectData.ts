// Single source of truth for "give me a project with all its relations" —
// used by both the API route and the server-rendered page, so they can
// never drift out of sync (they did once, in Phase 2, when only one of the
// two was updated after adding a new relation).
import { prisma } from "@/lib/prisma";

export const PROJECT_INCLUDE = {
  photos: {
    orderBy: { sortOrder: "asc" as const },
    include: { generations: { orderBy: { createdAt: "desc" as const } } }
  },
  comparables: {
    orderBy: { foundAt: "desc" as const },
    include: { priceHistory: { orderBy: { recordedAt: "asc" as const } } }
  },
  budgetItems: { orderBy: [{ room: "asc" as const }, { sortOrder: "asc" as const }] },
  assumptions: true,
  priceHistory: { orderBy: { recordedAt: "asc" as const } },
  contact: true,
  outreachMessages: { orderBy: { createdAt: "desc" as const } },
  sourceWatcher: { select: { id: true, name: true } },
  smsMessages: { orderBy: { createdAt: "asc" as const } },
  listingEvents: { orderBy: { occurredAt: "desc" as const } },
  roomConditions: true,
  productRequirements: {
    orderBy: { createdAt: "desc" as const },
    include: {
      products: { orderBy: { createdAt: "asc" as const }, include: { branches: true, priceHistory: { orderBy: { recordedAt: "asc" as const } } } }
    }
  },
  duplicatesAsA: { include: { projectB: { select: { id: true, title: true, municipality: true, district: true, askingPrice: true, isDemo: true } } } },
  duplicatesAsB: { include: { projectA: { select: { id: true, title: true, municipality: true, district: true, askingPrice: true, isDemo: true } } } },
  renovationPlan: true
};

export function getProjectWithRelations(id: string) {
  return prisma.project.findUnique({ where: { id }, include: PROJECT_INCLUDE });
}
