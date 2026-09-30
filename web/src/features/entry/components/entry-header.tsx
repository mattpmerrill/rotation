import type { Standing } from "@/domain/standings";
import type { Entry } from "@/domain/types";
import { formatDay, formatMultiple } from "@/lib/format";
import { LiveRefresh } from "@/ui/live-refresh";

/** Whose basket this is, since when, its best and lowest multiple, and the owner's actions. */
export function EntryHeader({
  entry,
  standing,
  isOwner,
  finished,
  liveAt,
  actions,
}: {
  entry: Entry;
  standing: Standing;
  isOwner: boolean;
  finished: boolean;
  liveAt: number | null;
  /** The owner's edit and delete controls; the page composes them from the features that own them. */
  actions: React.ReactNode;
}) {
  const { best, worst } = standing;
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-ink-2 text-lg font-semibold">{isOwner ? "Your basket" : `${entry.playerName}'s basket`}</h1>
        {actions}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-ink-3 text-sm">
          In since {formatDay(entry.startedOn)}.
          {best != null && worst != null && ` Best ${formatMultiple(best)}, lowest ${formatMultiple(worst)}.`}
        </p>
        {!finished && <LiveRefresh liveAt={liveAt} />}
      </div>
    </div>
  );
}
