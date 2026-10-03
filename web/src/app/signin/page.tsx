import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { BETA } from "@/lib/access/beta";
import SignInView from "./_components/SignInView";

export const metadata: Metadata = {
  title: "Sign in | MargaLink",
  description: BETA.on ? "Sign in to the MargaLink beta with Google." : "Sign in with Google or a one-time email link. Only the AI features need an account.",
  robots: { index: false },
};

export default function SignInPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-3 pb-20">
      <PageHeader width="2xl" title="Sign in" subtitle={
          <p className="mt-3 text-lg text-ink-soft">
            {BETA.on ? "During the beta, every tool needs an invited account." : "Only the AI review, Ask Claude and Rewrite need an account. Everything else works without one."}
          </p>
        }
      />
      <div className="mt-8">
        <Suspense>
          <SignInView />
        </Suspense>
      </div>
    </main>
  );
}
