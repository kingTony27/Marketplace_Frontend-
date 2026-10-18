import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import AppHeader from "@/components/app-header";
import "@fontsource/sancreek"
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Providers } from "@/app/providers";
import { cookieToInitialState } from "wagmi";
import { config } from "@/lib/config";
import { CurrencyProvider } from "@/lib/currencyContext";

export const metadata: Metadata = {
  title: "NFT Marketplace",
  description: "Discover creators, trends, and traders.",
};


export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  const cookieStore = await cookies();
  const initialState = cookieToInitialState(config, cookieStore.toString());

  return (
    <html lang="en">
      <body className="antialiased">
        <Providers initialState={initialState}>
          <CurrencyProvider>
            <SidebarProvider
              defaultOpen={false}
              // content-start keeps the wrapped header row at its natural 70px
              // height (stretch would blow it up to fill the viewport).
              className="flex-wrap content-start"
              style={
                { "--sidebar-width": "16rem", "--sidebar-width-icon": "6.5rem" } as React.CSSProperties
              }
            >
              <AppHeader />
              <AppSidebar />
              <main className="min-w-0 grow basis-full md:basis-0">{children}</main>
            </SidebarProvider>
          </CurrencyProvider>
        </Providers>
      </body>
    </html>
  );
}
