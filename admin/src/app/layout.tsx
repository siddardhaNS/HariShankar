import type { Metadata } from "next";
import { Roboto, Roboto_Condensed, Roboto_Mono } from "next/font/google";
import "./globals.css";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"] });
const robotoCondensed = Roboto_Condensed({ variable: "--font-roboto-condensed", subsets: ["latin"], weight: ["700"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Hari Shankar Admin" },
  description: "Admin console for Hari Shankar Picture Palace",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${robotoCondensed.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
