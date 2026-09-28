import { LoadingScreen } from "@/ui/BitcoinSpinner";

/** Shown instantly on every page change in the app while the page loads. */
export default function Loading() {
  return <LoadingScreen message="Counting sats…" />;
}
