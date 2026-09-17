// MOCK_DEMO source provider — a fully self-contained, clearly-labeled fixture
// data set used to exercise the entire Deal Radar pipeline (matching,
// dedup, price-drop detection, comparables, alerts, contact automation)
// without depending on any external service. Every item it returns has
// isDemo: true and portal "DEMO" so it can never be confused with real
// market data anywhere downstream (UI badges, exports, alerts).
import { prisma } from "@/lib/prisma";
import type { ListingSourceItem, ListingSourceProvider, ListingSourceQuery } from "./types";

const FIXTURES: Array<{
  externalId: string;
  title: string;
  municipality: string;
  district: string;
  disposition: string;
  areaM2: number;
  price: number;
  condition: string;
  ownership: string;
}> = [
  { externalId: "demo-001", title: "Prodej bytu 3+kk, Praha 5 - Smíchov", municipality: "Praha", district: "Smíchov", disposition: "3+kk", areaM2: 78, price: 6990000, condition: "Částečně po rekonstrukci", ownership: "OSOBNI" },
  { externalId: "demo-002", title: "Byt 2+kk po rekonstrukci, Praha 5 - Smíchov", municipality: "Praha", district: "Smíchov", disposition: "2+kk", areaM2: 55, price: 5200000, condition: "Dobrý stav", ownership: "OSOBNI" },
  { externalId: "demo-003", title: "Prostorný byt 3+1, Praha 5 - Smíchov", municipality: "Praha", district: "Smíchov", disposition: "3+1", areaM2: 82, price: 7450000, condition: "Původní stav", ownership: "OSOBNI" },
  { externalId: "demo-004", title: "Byt 2+1 k rekonstrukci, Praha 4 - Nusle", municipality: "Praha", district: "Nusle", disposition: "2+1", areaM2: 60, price: 4800000, condition: "K rekonstrukci", ownership: "DRUZSTEVNI" },
  { externalId: "demo-005", title: "Byt 3+kk, Praha 4 - Nusle", municipality: "Praha", district: "Nusle", disposition: "3+kk", areaM2: 75, price: 6100000, condition: "Dobrý stav", ownership: "OSOBNI" },
  { externalId: "demo-006", title: "Byt 2+kk po rekonstrukci, Praha 2 - Vinohrady", municipality: "Praha", district: "Vinohrady", disposition: "2+kk", areaM2: 58, price: 6500000, condition: "Po rekonstrukci", ownership: "OSOBNI" },
  { externalId: "demo-007", title: "Byt 2+1, Brno-střed", municipality: "Brno", district: "Brno-střed", disposition: "2+1", areaM2: 62, price: 4200000, condition: "Původní stav", ownership: "OSOBNI" },
  { externalId: "demo-008", title: "Byt 2+kk v dobrém stavu, Brno-střed", municipality: "Brno", district: "Brno-střed", disposition: "2+kk", areaM2: 54, price: 3950000, condition: "Dobrý stav", ownership: "OSOBNI" },
  { externalId: "demo-009", title: "Byt 3+1 k rekonstrukci, Brno - Žabovřesky", municipality: "Brno", district: "Žabovřesky", disposition: "3+1", areaM2: 80, price: 5600000, condition: "K rekonstrukci", ownership: "DRUZSTEVNI" },
  { externalId: "demo-010", title: "Byt 2+1, Brno - Žabovřesky", municipality: "Brno", district: "Žabovřesky", disposition: "2+1", areaM2: 65, price: 4550000, condition: "Dobrý stav", ownership: "OSOBNI" },
  { externalId: "demo-011", title: "Byt 3+kk k rekonstrukci, Praha 5 - Smíchov", municipality: "Praha", district: "Smíchov", disposition: "3+kk", areaM2: 70, price: 6800000, condition: "K rekonstrukci", ownership: "OSOBNI" },
  { externalId: "demo-012", title: "Novostavba 1+kk, Praha 8 - Karlín", municipality: "Praha", district: "Karlín", disposition: "1+kk", areaM2: 38, price: 4100000, condition: "Novostavba", ownership: "OSOBNI" },
  { externalId: "demo-013", title: "Byt 3+1 před rekonstrukcí, Brno - Královo Pole", municipality: "Brno", district: "Královo Pole", disposition: "3+1", areaM2: 85, price: 5950000, condition: "Před rekonstrukcí", ownership: "DRUZSTEVNI" },
  { externalId: "demo-014", title: "Byt 2+kk, Praha 4 - Nusle", municipality: "Praha", district: "Nusle", disposition: "2+kk", areaM2: 52, price: 5050000, condition: "Dobrý stav", ownership: "OSOBNI" }
];

function demoPhotos(seed: string): string[] {
  return [0, 1, 2].map(
    (i) => `https://placehold.co/800x600/EDE4D3/6B6558?text=DEMO+foto+${seed}-${i + 1}`
  );
}

async function ensureSeeded() {
  const count = await prisma.demoListing.count();
  if (count > 0) return;
  const now = Date.now();
  await prisma.demoListing.createMany({
    data: FIXTURES.map((f, i) => ({
      externalId: f.externalId,
      portal: "DEMO",
      title: f.title,
      municipality: f.municipality,
      district: f.district,
      disposition: f.disposition,
      areaM2: f.areaM2,
      price: f.price,
      basePrice: f.price,
      condition: f.condition,
      ownership: f.ownership,
      url: `https://demo.local/listing/${f.externalId}`,
      photos: JSON.stringify(demoPhotos(f.externalId)),
      // Spread publish dates so "only new listings" filtering is testable.
      publishedAt: new Date(now - i * 1000 * 60 * 60 * 24 * 2)
    }))
  });
}

function toItem(row: {
  externalId: string;
  portal: string;
  title: string;
  municipality: string;
  district: string | null;
  disposition: string;
  areaM2: number;
  price: number;
  condition: string;
  ownership: string;
  url: string;
  photos: string;
  publishedAt: Date;
}): ListingSourceItem {
  return {
    externalId: row.externalId,
    url: row.url,
    portal: "DEMO",
    title: row.title,
    askingPrice: row.price,
    disposition: row.disposition,
    areaM2: row.areaM2,
    municipality: row.municipality,
    district: row.district,
    condition: row.condition,
    ownership: row.ownership,
    photos: JSON.parse(row.photos),
    publishedAt: row.publishedAt.toISOString(),
    fullText: `${row.title}\n\nCena ${Math.round(row.price).toLocaleString("cs-CZ")} Kč\nDispozice ${row.disposition}, ${row.areaM2} m²\n${row.municipality}, ${row.district ?? ""}\nStav: ${row.condition}\nVlastnictví: ${row.ownership === "OSOBNI" ? "Osobní" : "Družstevní"}\n\n[DEMO fixture data — pouze pro testování Deal Radaru, nejde o reálný inzerát.]`,
    isDemo: true
  };
}

const NEW_LISTING_WINDOW_DAYS = 14;

export const mockDemoProvider: ListingSourceProvider = {
  key: "MOCK_DEMO",
  label: "DEMO ukázková data",
  status: "ACTIVE",
  statusNote: "Pevná sada testovacích nabídek pro ověření Deal Radaru. Nejde o reálný trh.",

  async search(query: ListingSourceQuery): Promise<ListingSourceItem[]> {
    await ensureSeeded();
    const rows = await prisma.demoListing.findMany({ orderBy: { publishedAt: "desc" } });

    return rows
      .filter((r) => {
        if (query.municipality && r.municipality.toLowerCase() !== query.municipality.toLowerCase())
          return false;
        if (query.district && r.district?.toLowerCase() !== query.district.toLowerCase()) return false;
        if (query.dispositions?.length && !query.dispositions.includes(r.disposition)) return false;
        if (query.minAreaM2 != null && r.areaM2 < query.minAreaM2) return false;
        if (query.maxAreaM2 != null && r.areaM2 > query.maxAreaM2) return false;
        if (query.maxPrice != null && r.price > query.maxPrice) return false;
        if (query.maxPricePerM2 != null && r.price / r.areaM2 > query.maxPricePerM2) return false;
        if (query.ownership && r.ownership !== query.ownership) return false;
        if (query.condition) {
          const want = query.condition.toLowerCase();
          if (!r.condition.toLowerCase().includes(want)) return false;
        }
        if (query.onlyNewListings) {
          const ageDays = (Date.now() - r.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays > NEW_LISTING_WINDOW_DAYS) return false;
        }
        return true;
      })
      .map(toItem);
  },

  async findComparables(item: ListingSourceItem): Promise<ListingSourceItem[]> {
    await ensureSeeded();
    const rows = await prisma.demoListing.findMany({
      where: {
        municipality: item.municipality,
        externalId: { not: item.externalId }
      }
    });
    const sameDispoDigits = (d: string) => d.split("+")[0];
    return rows
      .filter((r) => sameDispoDigits(r.disposition) === sameDispoDigits(item.disposition))
      .sort((a, b) => Math.abs(a.areaM2 - item.areaM2) - Math.abs(b.areaM2 - item.areaM2))
      .slice(0, 5)
      .map(toItem);
  }
};

/** Testing helper: mutate a demo listing's current price to simulate a market price drop. */
export async function simulateDemoPriceChange(externalId: string, newPrice: number) {
  await ensureSeeded();
  return prisma.demoListing.update({ where: { externalId }, data: { price: newPrice } });
}

export async function listDemoListings() {
  await ensureSeeded();
  return prisma.demoListing.findMany({ orderBy: { title: "asc" } });
}
