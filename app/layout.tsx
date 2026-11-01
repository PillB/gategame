import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
export const metadata: Metadata = { title: "Gateflow: Estrategia de colas aeroportuarias", description: "Juego de estrategia de colas en un aeropuerto, con simulación determinista en 2,5D.", icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es-PE"><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>; }
