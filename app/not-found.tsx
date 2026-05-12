import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Page Not Found</h1>
      <p>Sorry, this page doesn’t exist.</p>
      <Link href="/">Go Home</Link>
    </div>
  );
}