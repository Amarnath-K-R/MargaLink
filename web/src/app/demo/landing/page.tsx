import Link from "next/link";

export default function LandingDemos() {
  return (
    <main style={{ padding: 48, fontSize: 18, lineHeight: 2 }}>
      <h1>Landing demos</h1>
      <ul>
        <li><Link href="/demo/landing/a">A — the phrase leads</Link></li>
        <li><Link href="/demo/landing/b">B — the wordmark leads</Link></li>
        <li><Link href="/demo/landing/c">C — stacked cutouts over a flat-lay</Link></li>
      </ul>
    </main>
  );
}
