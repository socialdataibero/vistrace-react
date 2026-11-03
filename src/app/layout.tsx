import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vistrace",
  description: "Visual data analysis canvas with reactive dataflow, DuckDB and AI-assisted workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
