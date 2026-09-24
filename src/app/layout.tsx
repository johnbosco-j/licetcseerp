import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans, Outfit } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "LICET CSE ERP – Loyola-ICAM College of Engineering and Technology",
  description: "Department of Computer Science & Engineering ERP — Loyola-ICAM College of Engineering and Technology (Autonomous), Chennai",
  icons: { icon: "/images.png", apple: "/images.png" },
  openGraph: {
    title: "LICET CSE ERP",
    description: "Loyola-ICAM College of Engineering and Technology — Department of Computer Science & Engineering",
    siteName: "LICET CSE ERP",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN">
      <body className={`${dmSans.variable} ${cormorant.variable} ${outfit.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
