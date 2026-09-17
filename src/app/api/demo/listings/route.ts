import { NextResponse } from "next/server";
import { listDemoListings } from "@/lib/sources/mockProvider";

export async function GET() {
  const listings = await listDemoListings();
  return NextResponse.json(listings);
}
