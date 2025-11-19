import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs'; // הייבוא החדש

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Code Architect - AI Boilerplate Generator",
  description: "Stop configuring. Start coding. Generate production-ready boilerplates with Docker, CI/CD, and Auth in seconds.",
  openGraph: {
    title: "Code Architect - Generate Backend Projects Instantly",
    description: "AI-powered boilerplate generator. Supports Node.js, Python, Go, and more. Includes Docker & CI/CD.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // עוטפים את הכל ב-ClerkProvider
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}