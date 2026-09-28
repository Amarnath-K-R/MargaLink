"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import SignInPanel from "@/components/SignInPanel";
import { useAccount } from "@/components/useAccount";
import { safeNext } from "@/lib/safeNext";

// Also where Google's popup lands (?done=1): it closes itself, and the page
// that opened it picks up the sign-in on focus. Errors from the Google
// callback arrive as ?error=.
const ERRORS: Record<string, string> = {
  state: "That sign-in took too long, or started in another browser. Try again.",
  cancelled: "Sign-in was cancelled.",
  google: "Signing in with Google didn't work. Try again, or use an email link.",
  "google-off": "Google sign-in isn't set up yet. Use an email link for now.",
};

export default function SignInView() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const done = params.get("done") === "1";
  const error = params.get("error");
  const account = useAccount();
  useEffect(() => {
    if (done && window.opener) window.close();
  }, [done]);

  if (done || account.status === "in") {
    return (
      <div className="sheet p-6 sm:p-8">
        <p className="font-serif text-xl font-medium">You&apos;re signed in{account.status === "in" ? ` as ${account.email}` : ""}.</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {done ? "You can close this window; the page you came from has picked up the sign-in." : "Your M coins and account are a click away."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={next} className="clay-btn clay-primary h-10 px-5 text-sm font-medium">
            Continue <ArrowRight size={15} strokeWidth={2} />
          </Link>
          <Link href="/account" className="clay-btn h-10 px-5 text-sm">
            Your account
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="sheet max-w-md p-6 sm:p-8">
      <SignInPanel next={next} notice={error ? (ERRORS[error] ?? ERRORS.google) : undefined} fullPage />
    </div>
  );
}
