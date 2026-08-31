import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import Home from "@/components/Home";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  if (!user) redirect("/login");
  return <Home user={user} />;
}
