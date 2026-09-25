import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "LICET Things – Department of CSE, Loyola-ICAM College of Engineering and Technology",
  description: "Department of Computer Science & Engineering ERP — Loyola-ICAM College of Engineering and Technology (Autonomous), Chennai",
  icons: { icon: "/images.png", apple: "/images.png" },
  openGraph: {
    title: "LICET Things",
    description: "Loyola-ICAM College of Engineering and Technology — Department of Computer Science & Engineering",
    siteName: "LICET Things",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN">
      <body className={`${jakarta.variable} ${playfair.variable} ${marcellus.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
