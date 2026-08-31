"use client";

import type { SessionUser } from "@/lib/types";

/** Small account chip shown in the top bar (avatar + name + sign out). */
export default function UserChip({ user }: { user: SessionUser }) {
  if (user.sub === "guest") {
    return <span className="user-chip guest">👁 Public mode</span>;
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
