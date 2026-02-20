import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Anjani 健身房預約系統",
  description: "LINE Bot 健身房報到與預約系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
