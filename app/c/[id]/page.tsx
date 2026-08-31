"use client";

import { useParams } from "next/navigation";
import CounterDetail from "@/components/CounterDetail";

export default function CounterPage() {
  const params = useParams<{ id: string }>();
  return <CounterDetail id={params.id} />;
}
