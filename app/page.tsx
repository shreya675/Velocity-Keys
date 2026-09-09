import { redirect } from "next/navigation";

export default async function Page({ searchParams }: { searchParams: Promise<{ room?: string | string[] }> }) {
  const { room } = await searchParams;
  const code = typeof room === "string" ? room.trim() : "";
  redirect(code ? `/race?room=${encodeURIComponent(code)}` : "/practice");
}
