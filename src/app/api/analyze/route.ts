import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractFromText, extractContactInfo, detectPortal, type ExtractedListing } from "@/lib/extract";
import { fetchListing } from "@/lib/fetchListing";
import { DEFAULT_ASSUMPTIONS } from "@/lib/calc";
import { serializeFieldMeta, serializeFieldSource } from "@/lib/listing/fieldMeta";
import { LISTING_FIELDS, type ListingField } from "@/lib/types";
import { findPossibleDuplicates } from "@/lib/dedup";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const url: string | undefined = body?.url?.trim() || undefined;
  const text: string | undefined = body?.text?.trim() || undefined;

  if (!url && !text) {
    return NextResponse.json(
      { error: "Vložte prosím URL odkaz nebo text inzerátu." },
      { status: 400 }
    );
  }

  let extracted: ExtractedListing;
  let fetchWarning: string | null = null;
  let fetchedPhotos: string[] = [];

  if (url) {
    const result = await fetchListing(url);
    if (result.ok && result.extracted) {
      extracted = result.extracted;
      fetchedPhotos = result.extracted.photos;
      // If a plain text paste was also supplied, merge it in as the stronger signal
      if (text) {
        const fromText = extractFromText(text, url);
        extracted = {
          fields: { ...extracted.fields, ...fromText.fields },
          meta: { ...extracted.meta, ...fromText.meta },
          fullText: `${extracted.fullText}\n\n--- Vložený text ---\n${fromText.fullText}`,
          portal: extracted.portal ?? fromText.portal,
          photos: extracted.photos
        };
      }
      const fieldCount = Object.keys(extracted.fields).length;
      if (fieldCount < 4) {
        fetchWarning =
          "Ze stránky se podařilo automaticky získat jen málo údajů (portál pravděpodobně vyžaduje JavaScript). Doplňte prosím zkopírovaný text inzerátu nebo údaje ručně.";
      }
    } else {
      fetchWarning = result.error || "Stránku se nepodařilo stáhnout.";
      extracted = text
        ? extractFromText(text, url)
        : { fields: {}, meta: {}, fullText: "", portal: detectPortal(url), photos: [] };
    }
  } else {
    extracted = extractFromText(text!, undefined);
  }

  // "MANUAL TEXT" vs "MANUAL URL" provenance (Real Data Engine, item 1/17):
  // a pure text paste has no portal, so it's labeled distinctly from a URL
  // fetch (even one from an unrecognized domain, which still carries a
  // hostname-derived portal label from detectPortal()).
  const portal = extracted.portal ?? (url ? null : "Ruční text");
  const sourceLabel = url ? portal ?? "Ruční URL" : "Ruční text";

  // fieldMeta (confidence) already comes straight from extraction — only
  // the source label needs deriving here, one per field that actually got
  // a value, regardless of its confidence level.
  const fieldMeta = { ...extracted.meta };
  const fieldSource: Partial<Record<ListingField, string>> = {};
  for (const key of LISTING_FIELDS) {
    if (extracted.meta[key]) fieldSource[key] = sourceLabel;
  }

  const contact = extractContactInfo(extracted.fullText || text || "");

  const project = await prisma.project.create({
    data: {
      status: "ACTIVE",
      sourceUrl: url || null,
      sourceText: text || null,
      portal,
      fullText: extracted.fullText || text || null,
      description: extracted.fields.description ?? null,
      latitude: extracted.fields.latitude ?? null,
      longitude: extracted.fields.longitude ?? null,
      fieldMeta: serializeFieldMeta(fieldMeta),
      fieldSource: serializeFieldSource(fieldSource),
      analysisStage: "FULL_ANALYSIS",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      lastVerifiedAt: new Date(),
      title: extracted.fields.title,
      askingPrice: extracted.fields.askingPrice,
      disposition: extracted.fields.disposition,
      areaM2: extracted.fields.areaM2,
      pricePerM2: extracted.fields.pricePerM2,
      municipality: extracted.fields.municipality,
      district: extracted.fields.district,
      street: extracted.fields.street,
      floor: extracted.fields.floor,
      totalFloors: extracted.fields.totalFloors,
      buildingType: extracted.fields.buildingType,
      construction: extracted.fields.construction,
      ownership: extracted.fields.ownership,
      condition: extracted.fields.condition,
      buildingCondition: extracted.fields.buildingCondition,
      penb: extracted.fields.penb,
      balcony: extracted.fields.balcony,
      terrace: extracted.fields.terrace,
      loggia: extracted.fields.loggia,
      cellar: extracted.fields.cellar,
      parking: extracted.fields.parking,
      elevator: extracted.fields.elevator,
      orientation: extracted.fields.orientation,
      legalNotes: extracted.fields.legalNotes,
      photos: {
        create: fetchedPhotos.map((u, i) => ({ url: u, sortOrder: i }))
      },
      contact: contact.phone || contact.email ? { create: { phone: contact.phone ?? null, email: contact.email ?? null } } : undefined,
      listingEvents: {
        create: [{ eventType: "CAPTURED", detail: "Nemovitost analyzována a uložena." }]
      },
      assumptions: {
        create: {
          purchasePriceUsed: extracted.fields.askingPrice ?? null,
          saleConservative: null,
          saleBase: null,
          saleOptimistic: null,
          renovationCost: DEFAULT_ASSUMPTIONS.renovationCost,
          furnishingCost: DEFAULT_ASSUMPTIONS.furnishingCost,
          legalCosts: DEFAULT_ASSUMPTIONS.legalCosts,
          financingCost: DEFAULT_ASSUMPTIONS.financingCost,
          otherCosts: DEFAULT_ASSUMPTIONS.otherCosts,
          reserve: DEFAULT_ASSUMPTIONS.reserve,
          minProfit: DEFAULT_ASSUMPTIONS.minProfit,
          minMarginPct: DEFAULT_ASSUMPTIONS.minMarginPct,
          minRoiPct: DEFAULT_ASSUMPTIONS.minRoiPct,
          incomeTaxPct: DEFAULT_ASSUMPTIONS.incomeTaxPct,
          bandWidthPct: DEFAULT_ASSUMPTIONS.bandWidthPct
        }
      }
    }
  });

  const duplicateCount = await findPossibleDuplicates(project.id).catch(() => 0);

  return NextResponse.json({ id: project.id, warning: fetchWarning, duplicateCount });
}
