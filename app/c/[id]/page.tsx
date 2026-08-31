import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import CounterDetail from "@/components/CounterDetail";

export const dynamic = "force-dynamic";

export default async function CounterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect("/login");
  const { id } = await params;
  return <CounterDetail id={id} user={user} />;
}
