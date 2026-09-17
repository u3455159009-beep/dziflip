import { NextRequest, NextResponse } from "next/server";
import { createReplyDraft } from "@/lib/smsHub";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "CONFIRM" || body.kind === "ALTERNATIVE" ? body.kind : "BLANK";
  try {
    const draft = await createReplyDraft(params.id, kind);
    return NextResponse.json(draft);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Nepodařilo se připravit odpověď." }, { status: 400 });
  }
}
