import type { ReactNode } from "react";

// The 3 byte-identical role="alert" error paragraphs used across /match
// and /review.
export default function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-3 text-sm text-away">
      {children}
    </p>
  );
}
