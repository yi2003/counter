"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/types";
import { clearLocalModeFlag, isLocalMode } from "@/lib/localMode";

/** Small account chip shown in the top bar (avatar + name + sign out). */
export default function UserChip({ user }: { user: SessionUser }) {
  // A real session always wins over a stale local-mode flag — otherwise the
  // storage adapter would keep reading this-browser data after sign-in.
  const router = useRouter();
  useEffect(() => {
    if (user.sub !== "local" && isLocalMode()) {
      clearLocalModeFlag();
      router.refresh();
    }
  }, [user.sub, router]);

  if (user.sub === "guest") {
    return <span className="user-chip guest">👁 Public mode</span>;
  }
  if (user.sub === "local") {
    return (
      <span className="user-chip local">
        <span className="avatar-fallback">📁</span>
        <span className="user-name">This device</span>
        <button type="button" className="signout" onClick={disableLocalMode} title="Sign in to sync">
          Sign in to sync
        </button>
      </span>
    );
  }
  const initial = user.name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span className="user-chip">
      {user.picture ? (
        <img src={user.picture} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="avatar-fallback">{initial}</span>
      )}
      <span className="user-name">{user.name}</span>
      <a className="signout" href="/api/auth/logout" title="Sign out">
        Sign out
      </a>
    </span>
  );
}
