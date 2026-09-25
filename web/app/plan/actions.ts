"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { coinById } from "@/lib/cycle";
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
  const unknown = basket.filter((id) => !coinById.has(id));
  if (unknown.length) fail(`Pick coins from the list (not found: ${unknown.join(", ")}).`);

  const supabase = await createClient();
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
