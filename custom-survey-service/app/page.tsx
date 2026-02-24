import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="card">
        <h1>MyHeartCounts Nudge Evaluation</h1>
        <p>
          Log in with your lab email and evaluator ID to start a session. Each
          session presents 3 nudges and one fixed question bundle.
        </p>
        <Link href="/login" className="button">
          Go to login
        </Link>
      </div>
    </main>
  );
}
