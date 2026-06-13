import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LICET CSE",
  description: "Loyola-ICAM College of Engineering & Technology — Dept. of Computer Science",
  openGraph: {
    title: "LICET CSE",
    description: "Loyola-ICAM College of Engineering & Technology — Dept. of Computer Science",
    siteName: "LICET CSE–ERP",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/images.png" />
        <link rel="apple-touch-icon" href="/images.png" />
        <link rel="shortcut icon" href="/images.png" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
