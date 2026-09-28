import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import VerifyView from "./VerifyView";

export const metadata: Metadata = {
  title: "Sign in | MargaLink",
  description: "Finish signing in with your email link.",
  robots: { index: false },
};

export default function VerifyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-3 pb-20">
      <PageHeader width="2xl" title="Sign in" />
      <div className="mt-8">
        <VerifyView />
      </div>
    </main>
  );
}
