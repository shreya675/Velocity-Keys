import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSection, sections } from "@/lib/navigation";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}
export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  if (!isSection(section)) notFound();
  return { title: `${sections[section].title} · Velocity Keys`, description: sections[section].description };
}
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isSection(section)) notFound();
  // Keep the live socket and typing session in the persistent workspace layout.
  return null;
}
