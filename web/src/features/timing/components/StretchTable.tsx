import { isGoodStretch, type Stretch } from "@/domain/timing";
import { formatBtc } from "@/lib/format";

/** Each quarter of the cycle: how often buying then beat holding BTC, and the typical result. */
export function StretchTable({ stretches, today }: { stretches: Stretch[]; today: number }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Buying alts by quarter of the cycle</caption>
      <thead className="text-ink-3 text-left text-xs">
        <tr>
          <th scope="col" className="pb-2 font-medium">
            Bought
          </th>
          <th scope="col" className="pb-2 font-medium">
            Beat BTC
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            Typical result
          </th>
        </tr>
      </thead>
      <tbody className="divide-line divide-y">
        {stretches.map((s) => {
          const here = today >= s.from && today <= s.to;
          const good = isGoodStretch(s);
          return (
            <tr key={s.from} className={here ? "bg-gold/10" : ""}>
              <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                {s.from === 0 ? "Halving" : `${Math.round(s.from / 30.4)} mo`} to {Math.round((s.to + 1) / 30.4)} mo
                after
                {here && <span className="text-gold ml-2 text-xs font-semibold">today</span>}
              </th>
              <td className="py-2.5 pr-3">
                {s.stance.of ? (
                  <span className={good ? "text-gain font-semibold" : s.stance.wins === 0 ? "text-loss" : "text-ink-2"}>
                    {s.stance.wins} of {s.stance.of} cycles
                  </span>
                ) : (
                  <span className="text-ink-3">no data yet</span>
                )}
              </td>
              <td className="py-2.5 text-right font-semibold">
                {s.stance.median == null ? "–" : formatBtc(s.stance.median, 2)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
