import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are bundled from @fontsource (npm) instead of fetched from Google at build
// time: the Google download intermittently failed on Vercel builds.
const dmSans = localFont({
  variable: "--font-dm-sans",
  src: [
    { path: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2", weight: "300 700", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-italic.woff2", weight: "300 700", style: "italic" },
  ],
  display: "swap",
});

const cormorant = localFont({
  variable: "--font-cormorant",
  src: [
    { path: "../../node_modules/@fontsource-variable/cormorant-garamond/files/cormorant-garamond-latin-wght-normal.woff2", weight: "400 700", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/cormorant-garamond/files/cormorant-garamond-latin-wght-italic.woff2", weight: "400 700", style: "italic" },
  ],
  display: "swap",
});

// Menu typography: Marcellus (classical Roman capitals) for the brand and section
// headings, Manrope (crisp modern sans) for navigation labels.
const marcellus = localFont({
  variable: "--font-marcellus",
  src: "../../node_modules/@fontsource/marcellus/files/marcellus-latin-400-normal.woff2",
  weight: "400",
  display: "swap",
});

const manrope = localFont({
  variable: "--font-manrope",
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  weight: "400 700",
  display: "swap",
});

const outfit = localFont({
  variable: "--font-outfit",
  src: "../../node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2",
  weight: "500 800",
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
      <body className={`${dmSans.variable} ${cormorant.variable} ${outfit.variable} ${marcellus.variable} ${manrope.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
