import { NextRequest, NextResponse } from "next/server";
import { analyzePhotoWithAi, PhotoAnalysisNotAvailableError } from "@/lib/photoAnalysis";

export async function POST(_req: NextRequest, { params }: { params: { id: string; photoId: string } }) {
  try {
    const photo = await analyzePhotoWithAi(params.photoId);
    return NextResponse.json(photo);
  } catch (err) {
    if (err instanceof PhotoAnalysisNotAvailableError) {
      return NextResponse.json({ error: err.message, available: false }, { status: 409 });
    }
    return NextResponse.json({ error: "Analýza fotografie selhala." }, { status: 500 });
  }
}
