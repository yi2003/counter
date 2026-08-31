"use client";

import { enableLocalMode } from "@/lib/localMode";

/** Login-page escape hatch: use the app with data kept in this browser only. */
export default function LocalModeButton() {
  return (
    <button type="button" className="btn btn-outline" onClick={enableLocalMode}>
      📁 Use on this device only
    </button>
  );
}
