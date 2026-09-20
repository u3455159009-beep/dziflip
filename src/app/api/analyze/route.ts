import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractFromText, extractContactInfo, detectPortal, type ExtractedListing } from "@/lib/extract";
import { fetchListing } from "@/lib/fetchListing";
import { DEFAULT_ASSUMPTIONS } from "@/lib/calc";
import { serializeFieldMeta, serializeFieldSource } from "@/lib/listing/fieldMeta";
import { LISTING_FIELDS, type ListingField, type CompQualityTier } from "@/lib/types";
import { findPossibleDuplicates } from "@/lib/dedup";
import { discoverComparablesForProject } from "@/lib/comparableDiscovery";
import { discoverOriginalListing } from "@/lib/listingDiscovery";
import { rescoreAllComparables } from "@/lib/comparableScoring";
import { computeARV, computeMarketValue, type MarketValueComparable } from "@/lib/marketValue";
import { getSettings } from "@/lib/settings";

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
      analysisStage: "BASIC_ANALYSIS", // advanced to COMPARABLES/FULL_ANALYSIS below, once real data actually supports it
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
      propertyType: extracted.fields.propertyType,
      airConditioning: extracted.fields.airConditioning,
      electricalRewiring: extracted.fields.electricalRewiring,
      masonryCore: extracted.fields.masonryCore,
      windowsReplacedYear: extracted.fields.windowsReplacedYear,
      insulationYear: extracted.fields.insulationYear,
      roofYear: extracted.fields.roofYear,
      risersYear: extracted.fields.risersYear,
      landAreaM2: extracted.fields.landAreaM2,
      zoning: extracted.fields.zoning,
      buildable: extracted.fields.buildable,
      utilitiesAvailable: extracted.fields.utilitiesAvailable,
      accessRoad: extracted.fields.accessRoad,
      garageDimensions: extracted.fields.garageDimensions,
      garageElectricity: extracted.fields.garageElectricity,
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

  // --- Listing Discovery Engine (item 1) — only meaningful when the user
  // pasted text without a URL; a URL fetch already has the real listing.
  // Best-effort and never blocks the response — with no ACTIVE search
  // provider configured this always (honestly) resolves to NOT_FOUND.
  if (!url) {
    await discoverOriginalListing({
      propertyType: extracted.fields.propertyType ?? null,
      disposition: extracted.fields.disposition ?? null,
      municipality: extracted.fields.municipality ?? null,
      district: extracted.fields.district ?? null,
      street: extracted.fields.street ?? null,
      areaM2: extracted.fields.areaM2 ?? null,
      askingPrice: extracted.fields.askingPrice ?? null
    })
      .then(async (match) => {
        await prisma.project.update({
          where: { id: project.id },
          data: {
            discoveredListingUrl: match.url,
            discoveredListingConfidence: match.confidence,
            discoveredListingReasons: JSON.stringify(match.reasons),
            discoveredListingProvider: match.matchProviderKey,
            discoveredListingExternalId: match.matchExternalId
          }
        });

        // Listing Photo Discovery (items 1/2) — photos are only ever copied
        // automatically from a match confident enough to trust it's the
        // same property (EXACT_MATCH/HIGH_CONFIDENCE_MATCH). A POSSIBLE_MATCH
        // stages its candidate photos for explicit user confirmation instead
        // — never auto-attached. NOT_FOUND or a matched provider supplying
        // no photos leaves the project with no photos and no fabrication.
        if (match.photos.length > 0) {
          if (match.confidence === "EXACT_MATCH" || match.confidence === "HIGH_CONFIDENCE_MATCH") {
            const now = new Date();
            await prisma.photo.createMany({
              data: match.photos.map((u, i) => ({
                projectId: project.id,
                url: u,
                sortOrder: i,
                sourcePhotoProvider: match.matchProviderKey,
                sourceListingProvider: match.matchProviderKey,
                sourceListingExternalId: match.matchExternalId,
                sourceListingUrl: match.url,
                matchConfidence: match.confidence,
                retrievedAt: now
              }))
            });
          } else if (match.confidence === "POSSIBLE_MATCH") {
            await prisma.project.update({
              where: { id: project.id },
              data: {
                discoveredListingCandidatePhotos: JSON.stringify(match.photos),
                discoveredListingPhotosConfirmed: false
              }
            });
          }
        }
      })
      .catch(() => {});
  }

  // --- Comparable Discovery Engine (item 4) → Market Value / ARV (items
  // 6-9) → sale-price basis for MAX BUY PRICE (item 11). Best-effort: a
  // provider outage here must never fail the whole analysis — the project
  // is already saved and the user can retry from the project page.
  try {
    await discoverComparablesForProject(project.id, { force: true });

    const [settings, comps] = await Promise.all([
      getSettings(),
      prisma.comparable.findMany({ where: { projectId: project.id } })
    ]);

    let analysisStage: string = "BASIC_ANALYSIS";
    if (comps.length > 0) {
      await rescoreAllComparables(project.id);
      analysisStage = "COMPARABLES";

      const rescored = await prisma.comparable.findMany({ where: { projectId: project.id } });
      const marketComps: MarketValueComparable[] = rescored.map((c) => ({
        pricePerM2: c.pricePerM2,
        qualityTier: (c.qualityTier as CompQualityTier | null) ?? null,
        priceType: c.priceType,
        condition: c.condition
      }));
      const valueOpts = { minCompCount: settings.minCompCount, minCompQuality: settings.minCompQuality as CompQualityTier };
      const areaM2 = extracted.fields.areaM2 ?? null;

      // Prefer After-Renovation Value as the flip's sale-price basis, same
      // as Deal Radar V2 — falls back to current-condition market value
      // only when there isn't yet a renovated-comp sample for ARV.
      const arv = computeARV(marketComps, areaM2, valueOpts);
      const basis = arv.insufficientData ? computeMarketValue(marketComps, areaM2, valueOpts) : arv;

      if (!basis.insufficientData) {
        await prisma.assumptions.update({
          where: { projectId: project.id },
          data: {
            saleConservative: basis.conservative.value,
            saleBase: basis.base.value,
            saleOptimistic: basis.high.value
          }
        });
        analysisStage = "FULL_ANALYSIS";
      }
    }

    await prisma.project.update({ where: { id: project.id }, data: { analysisStage } });
  } catch {
    // Comparable discovery/valuation failing must never fail the analyze
    // request itself — the project row (with its extracted fields) is
    // already safely saved.
  }

  return NextResponse.json({ id: project.id, warning: fetchWarning, duplicateCount });
}
