import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs'; // הייבוא החדש

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Code Architect",
  description: "Generate production-ready boilerplates instantly with AI.",
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