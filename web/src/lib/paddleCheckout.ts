"use client";

// Paddle's checkout, in the browser. Paddle.js is a third-party script, so
// it's loaded only when someone clicks Buy, never just by visiting a page.
// The checkout names the account (custom_data.user_id), which is how the
// webhook knows whose coins to add; the card details go to Paddle only.
type PaddleEventData = { name?: string };
type PaddleJs = {
  Environment: { set: (env: string) => void };
  Initialize: (o: { token: string; eventCallback: (e: PaddleEventData) => void }) => void;
  Checkout: {
    open: (o: {
      items: { priceId: string; quantity: number }[];
      customer?: { email: string };
      customData?: Record<string, string>;
      settings?: Record<string, unknown>;
    }) => void;
  };
};
declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

let loading: Promise<PaddleJs> | null = null;
let ready = false;
let onCompleted: (() => void) | null = null;

function loadPaddle(): Promise<PaddleJs> {
  loading ??= new Promise<PaddleJs>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    s.async = true;
    s.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error("The checkout didn't load. Try again.")));
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error("The checkout didn't load. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Paddle's customer portal (manage or cancel Pro, receipts) in a new tab.
 * The tab opens at the click, before the link is fetched, so a popup
 * blocker doesn't stop it. Returns an error message, or null.
 */
export async function openPortal(): Promise<string | null> {
  const tab = window.open("about:blank", "_blank");
  const res = await fetch("/api/pay/portal", { method: "POST" }).catch(() => null);
  if (!res?.ok) {
    tab?.close();
    return (res && (await res.text().catch(() => ""))) || "Couldn't open Paddle's billing page. Check your connection and try again.";
  }
  const { url } = (await res.json()) as { url: string };
  if (tab) {
    tab.opener = null;
    tab.location.href = url;
  } else window.open(url, "_blank", "noopener");
  return null;
}

export async function openCheckout(o: { env: string; token: string; priceId: string; email: string; userId: string; sig: string; onCompleted: () => void }) {
  const paddle = await loadPaddle();
  if (!ready) {
    if (o.env === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({ token: o.token, eventCallback: (e) => e.name === "checkout.completed" && onCompleted?.() });
    ready = true;
  }
  onCompleted = o.onCompleted;
  paddle.Checkout.open({
    items: [{ priceId: o.priceId, quantity: 1 }],
    customer: { email: o.email },
    customData: { user_id: o.userId, sig: o.sig },
    settings: { displayMode: "overlay", theme: "light", allowLogout: false },
  });
}
