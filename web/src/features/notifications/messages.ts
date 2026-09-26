import type { Standing } from "@/domain/standings";
import { BTC, type Coin, type Entry, type Trade } from "@/domain/types";
import { formatChange, formatMultiple } from "@/lib/format";

/**
 * Discord messages. The channel sees who did what and BTC multiples, never amounts
 * (decision 10 in docs/PLAN.md).
 */

const symbol = (coins: Record<string, Coin>, id: string) => coins[id]?.symbol ?? id.toUpperCase();

export function buyInMessage(entry: Entry, coins: Record<string, Coin>): string {
  return `**${entry.playerName}** is in: ${entry.basket.map((id) => symbol(coins, id)).join(", ")}.`;
}

export function tradeMessage(entry: Entry, trade: Trade, coins: Record<string, Coin>): string {
  if (trade.kind === "fill") return `**${entry.playerName}** filled a waiting slot with ${symbol(coins, trade.asset)}.`;
  if (trade.asset === BTC) return `**${entry.playerName}** rebought BTC.`;
  return `**${entry.playerName}** sold ${symbol(coins, trade.asset)}.`;
}

export function rebuyWindowMessage(daysSinceHigh: number, drawdown: number): string {
  return [
    "**The bear rebuy window is open.**",
    `BTC is ${daysSinceHigh} days past its high and ${Math.round(drawdown * 100)}% below it.`,
    "Holding USDT? In past cycles, rebuying BTC from here is where the extra BTC came from. Your call.",
  ].join("\n");
}

export function digestMessage(challengeName: string, standings: Standing[], appUrl: string): string {
  const lines = standings.map((s, i) =>
    s.multiple == null
      ? `${i + 1}. ${s.entry.playerName}: waiting for prices`
      : `${i + 1}. ${s.entry.playerName}: ${formatMultiple(s.multiple)} (${formatChange(s.multiple - 1)})`,
  );
  return [`**${challengeName}: this week**`, ...lines, appUrl].join("\n");
}

export function completeMessage(challengeName: string, standings: Standing[]): string {
  const winner = standings[0];
  return `**${challengeName} is done.** Everyone is back in BTC. ${winner.entry.playerName} wins with ${formatMultiple(winner.multiple ?? 0)}.`;
}
