import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Unbounded } from "next/font/google";
import { UnitProvider } from "@/ui/unit";
import "./globals.css";

const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument" });
const unbounded = Unbounded({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-unbounded" });

export const metadata: Metadata = {
  title: { default: "1 Bitty Challenge", template: "%s | 1 Bitty Challenge" },
  description: "How many BTC can you get from one? A friendly alt-basket challenge, scored in BTC.",
};

export const viewport: Viewport = { themeColor: "#0d0f14", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${unbounded.variable}`}>
      <body className="min-h-dvh">
        <UnitProvider>{children}</UnitProvider>
      </body>
    </html>
  );
}
