import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are bundled from @fontsource (npm) instead of fetched from Google at build
// time: the Google download intermittently failed on Vercel builds.
// Type system: Plus Jakarta Sans for all interface and body text, Playfair Display
// for headings and figures of note, Marcellus only for the "LICET Things" wordmark.
const jakarta = localFont({
  variable: "--font-jakarta",
  src: [
    { path: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2", weight: "200 800", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-italic.woff2", weight: "200 800", style: "italic" },
  ],
  display: "swap",
});

const playfair = localFont({
  variable: "--font-playfair",
  src: [
    { path: "../../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2", weight: "400 900", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2", weight: "400 900", style: "italic" },
  ],
  display: "swap",
});

const marcellus = localFont({
  variable: "--font-marcellus",
  src: "../../node_modules/@fontsource/marcellus/files/marcellus-latin-400-normal.woff2",
  weight: "400",
  display: "swap",
});

// The public homepage copies licet.ac.in: Cormorant Garamond headings, DM Sans text.
const cormorant = localFont({
  variable: "--font-cormorant",
  src: [
    { path: "../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
});

const dmSans = localFont({
  variable: "--font-dmsans",
  src: [
    { path: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2", weight: "100 1000", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-italic.woff2", weight: "100 1000", style: "italic" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LICET Things – Department of CSE, Loyola-ICAM College of Engineering and Technology",
  description: "Department of Computer Science & Engineering ERP — Loyola-ICAM College of Engineering and Technology (Autonomous), Chennai",
  icons: { icon: "/images.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "LICET Things", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "LICET Things",
    description: "Loyola-ICAM College of Engineering and Technology — Department of Computer Science & Engineering",
    siteName: "LICET Things",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A0C4E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN">
      <body className={`${jakarta.variable} ${playfair.variable} ${marcellus.variable} ${cormorant.variable} ${dmSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
