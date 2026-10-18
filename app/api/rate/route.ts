import { NextResponse } from "next/server";

// ETH/USD spot rate, cached for a minute so we don't hammer the upstream API.
export const revalidate = 60;

export async function GET() {
  try {
    const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`rate request failed (${res.status})`);

    const json = (await res.json()) as { data?: { amount?: string } };
    const ethUsd = Number(json?.data?.amount);
    if (!Number.isFinite(ethUsd) || ethUsd <= 0) throw new Error("invalid rate");

    return NextResponse.json({ ethUsd });
  } catch {
    // The UI falls back to "…" when the rate is unavailable.
    return NextResponse.json({ ethUsd: 0 });
  }
}
