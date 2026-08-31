import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { LOCAL_MODE_KEY } from "@/lib/localModeKey";
import CounterDetail from "@/components/CounterDetail";

export const dynamic = "force-dynamic";

export default async function CounterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const jar = await cookies();
  const localMode = !user && jar.get(LOCAL_MODE_KEY)?.value === "1";
  if (!user && !localMode) redirect("/login");
  const { id } = await params;
  return (
    <CounterDetail
      id={id}
      user={user ?? { sub: "local", name: "This device", email: null, picture: null }}
      localMode={localMode}
    />
  );
}
