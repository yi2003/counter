import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { LOCAL_MODE_KEY } from "@/lib/localModeKey";
import Home from "@/components/Home";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const jar = await cookies();
  const localMode = !user && jar.get(LOCAL_MODE_KEY)?.value === "1";
  if (!user && !localMode) redirect("/login");
  return (
    <Home
      user={user ?? { sub: "local", name: "This device", email: null, picture: null }}
      localMode={localMode}
    />
  );
}
