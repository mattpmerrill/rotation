"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { coinById } from "@/lib/cycle";
import { createClient, currentUser } from "@/lib/supabase/server";

const STEP = /^(opening|alt_slice_[1-4]|alt_sell_[1-4]|btc_sell_[1-4]|rebuy_[1-4]|rebuy_all)$/;

export async function logTrade(form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const fail = (m: string) => redirect(`/stack?error=${encodeURIComponent(m)}`);
  const asset = String(form.get("asset") ?? "").trim();
  const side = String(form.get("side") ?? "");
  const qty = Number(form.get("qty"));
  const priceRaw = String(form.get("price_usd") ?? "").trim();
  const price = priceRaw ? Number(priceRaw) : null;
  const fee = Number(form.get("fee_usd") || 0);
  const day = String(form.get("traded_on") ?? "");
  const step = String(form.get("plan_step") ?? "").trim() || null;

  if (!(asset === "bitcoin" || asset === "usdt" || coinById.has(asset))) fail("Pick an asset from the list.");
  if (!["buy", "sell", "deposit", "withdraw"].includes(side)) fail("Pick buy, sell, deposit or withdraw.");
  if (!(qty > 0)) fail("Quantity must be more than 0.");
  if ((side === "buy" || side === "sell") && !(price && price > 0)) fail("Buys and sells need the USD price per coin.");
  if (!(fee >= 0)) fail("Fee can't be negative.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("Pick the trade date.");
  if (step && !STEP.test(step)) fail("Unknown plan step.");

  const supabase = await createClient();
  const { error } = await supabase.from("trades").insert({
    traded_on: day, asset, side, qty, price_usd: price, fee_usd: fee, plan_step: step,
    note: String(form.get("note") ?? "").slice(0, 200) || null,
  });
  if (error) fail("Couldn't save the trade. Try again.");
  revalidatePath("/stack");
  revalidatePath("/plan");
  redirect("/stack?saved=1");
}

export async function deleteTrade(form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  // RLS limits this to the signed-in person's own trades.
  await supabase.from("trades").delete().eq("id", Number(form.get("id")));
  revalidatePath("/stack");
  revalidatePath("/plan");
  redirect("/stack");
}
