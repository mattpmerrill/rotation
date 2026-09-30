import "server-only";
import { env } from "@/data/env";
import { getMarketState } from "@/data/market.repository";
import { sendOnce } from "@/data/notifications.repository";
import { loadCurrentChallenge } from "@/data/snapshot.repository";
import { supabaseAdmin } from "@/data/supabase/admin";
import { isChallengeComplete, rankStandings, standingOf } from "@/domain/standings";
import { isBuyInTrade } from "@/domain/trades";
import { postToDiscord } from "@/integrations/discord";
import { addDays } from "@/lib/days";
import { buyInMessage, completeMessage, digestMessage, rebuyWindowMessage, tradeMessage } from "./messages";

/** Only trades logged in the last few days are announced (older ones predate the job). */
const ANNOUNCE_DAYS = 3;

/**
 * The daily job (called by the scheduler after the engine refreshes prices). Posts each
 * notification once: new buy-ins and trades, the rebuy window opening, the Sunday standings,
 * and the end of the challenge. Returns what it posted.
 */
export async function runDailyJob(today: string, appUrl: string): Promise<string[]> {
  const db = supabaseAdmin();
  const [snap, market] = await Promise.all([loadCurrentChallenge(db), getMarketState(db)]);
  const posts: { key: string; text: string }[] = [];

  if (market?.rebuyWindowOpen) {
    posts.push({
      key: `rebuy-window:${market.athDate}`,
      text: rebuyWindowMessage(market.daysSinceAth, market.drawdown),
    });
  }

  if (snap) {
    const recent = addDays(today, -ANNOUNCE_DAYS);
    for (const e of snap.entries) {
      if (e.startedOn >= recent) posts.push({ key: `entry:${e.id}`, text: buyInMessage(e, snap.coins) });
      // one post per sell, rebuy or slot fill (a fill's BTC sale is part of the fill)
      const announced = snap.trades.filter(
        (t) =>
          t.entryId === e.id && !isBuyInTrade(t) && !(t.kind === "fill" && t.side === "sell") && t.tradedOn >= recent,
      );
      for (const t of announced) {
        posts.push({ key: `trade:${t.id}`, text: tradeMessage(e, t, snap.coins) });
      }
    }
    const standings = rankStandings(
      snap.entries.map((e) =>
        standingOf(
          e,
          snap.trades.filter((t) => t.entryId === e.id),
          snap.prices,
          today,
        ),
      ),
    );
    if (standings.length && new Date(`${today}T00:00:00Z`).getUTCDay() === 0) {
      posts.push({ key: `digest:${today}`, text: digestMessage(snap.challenge.name, standings, appUrl) });
    }
    if (isChallengeComplete(standings)) {
      posts.push({ key: `complete:${snap.challenge.id}`, text: completeMessage(snap.challenge.name, standings) });
    }
  }

  const sent: string[] = [];
  const webhookUrl = env().DISCORD_WEBHOOK_URL;
  for (const p of posts) {
    if (await sendOnce(p.key, () => postToDiscord(webhookUrl, p.text))) sent.push(p.key);
  }
  return sent;
}
