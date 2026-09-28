import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import AccountView from "./AccountView";

export const metadata: Metadata = {
  title: "Your account | MargaLink",
  description: "Your M coins, their history, and your account: sign out, download your data, or delete it.",
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-3 pb-20">
      <PageHeader width="2xl" title="Your account" />
      <div className="mt-8">
        <AccountView />
      </div>
    </main>
  );
}
