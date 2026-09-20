// Shared Renovation Design System (item 4) — exactly one RenovationPlan per
// project. Free-text fields describing the chosen flooring/colors/fixtures
// etc.; the app never invents a plan on its own, only the user sets it.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const FIELDS = [
  "style",
  "priceLevel",
  "flooring",
  "wallColor",
  "doors",
  "handles",
  "outletsSwitches",
  "lighting",
  "kitchen",
  "bathroomFixtures",
  "tiles",
  "sanitary",
  "builtIns",
  "notes"
];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const plan = await prisma.renovationPlan.findUnique({ where: { projectId: params.id } });
  return NextResponse.json(plan);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Neplatná data" }, { status: 400 });

  const data: Record<string, any> = {};
  for (const key of FIELDS) {
    if (key in body) data[key] = body[key] === "" ? null : body[key];
  }

  const plan = await prisma.renovationPlan.upsert({
    where: { projectId: params.id },
    update: data,
    create: { projectId: params.id, ...data }
  });

  return NextResponse.json(plan);
}
