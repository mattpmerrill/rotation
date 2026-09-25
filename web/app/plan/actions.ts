"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";

export async function savePlan(form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const budget = Number(form.get("alt_budget_btc"));
  const sell = Number(form.get("sell_btc_frac"));
  const basket = [0, 1, 2, 3, 4]
    .map((i) => String(form.get(`coin${i}`) ?? "").trim())
    .filter(Boolean);
  const fail = (m: string) => redirect(`/plan?error=${encodeURIComponent(m)}`);
  if (!Number.isFinite(budget) || budget < 0) fail("Alt budget must be 0 or more BTC.");
  if (!(sell > 0 && sell <= 1)) fail("Choose how much BTC to sell at the top.");
  if (new Set(basket).size !== basket.length) fail("Each alt can only be in the basket once.");
  const supabase = await createClient();
  // any alt the database knows (the daily job adds new top-250 coins); stables/wrapped not allowed
  const { data: known } = basket.length
    ? await supabase.from("coins").select("id, is_excluded").in("id", basket)
    : { data: [] as { id: string; is_excluded: boolean }[] };
  const ok = new Set((known ?? []).filter((c) => !c.is_excluded).map((c) => c.id));
  const unknown = basket.filter((id) => !ok.has(id));
  if (unknown.length) fail(`Pick alts from the list (not found or not allowed: ${unknown.join(", ")}).`);
  const { error } = await supabase.from("plans").upsert({
    user_id: user!.id,
    alt_budget_btc: budget,
    sell_btc_frac: sell,
    sell_alt_frac: 1,
    basket,
    updated_at: new Date().toISOString(),
  });
  if (error) fail("Couldn't save the plan. Try again.");
  revalidatePath("/plan");
  redirect("/plan?saved=1");
}
