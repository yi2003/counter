import Link from "next/link";
import { redirect } from "next/navigation";
import { authConfigured, requireUser } from "@/lib/auth";
import LocalModeButton from "@/components/LocalModeButton";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  state: "Sign-in could not be verified (expired or invalid session). Please try again.",
  token: "Google did not return a valid token. Please try again.",
  userinfo: "Could not read your Google profile. Please try again.",
  not_configured: "Sign-in is not configured on this deployment yet.",
};

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireUser();
  if (authConfigured() && user && user.sub !== "guest") redirect("/");

  const configured = authConfigured();

  return (
    <main className="container login-wrap">
      <div className="card login-card">
        <h1 className="login-title">📋 Universal Check-in Counter</h1>
        <p className="login-sub">
          {configured
            ? "Sign in with Google — your counters stay private under your account."
            : "Sign-in is not configured on this deployment."}
        </p>

        {configured ? (
          <>
            {error && <p className="form-error">{ERRORS[error] ?? "Sign-in failed. Please try again."}</p>}
            <a className="btn google-btn" href="/api/auth/google">
              <GoogleG /> Sign in with Google
            </a>
            <div className="login-or">or</div>
            <LocalModeButton />
            <p className="muted login-note">
              Google keeps every account's counters private and synced across devices. Device-only
              keeps data in this browser — no account, no sync, nothing leaves your phone.
            </p>
          </>
        ) : (
          <>
            <p className="form-error">
              This deployment is currently in <strong>public mode</strong>: anyone with the link
              can view and edit the data. Set <code>GOOGLE_CLIENT_ID</code> and{" "}
              <code>GOOGLE_CLIENT_SECRET</code> in Vercel to lock it to Google accounts.
            </p>
            <Link className="btn btn-primary" href="/">
              Enter as guest
            </Link>
            <div className="login-or">or</div>
            <LocalModeButton />
            <p className="muted login-note">
              Device-only mode keeps your counters in this browser — private, no sync.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
