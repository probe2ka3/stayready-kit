import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl" aria-hidden>
        🧺
      </p>
      <h1 className="mt-4 text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-muted">Cette page n’existe pas ou a été déplacée.</p>
      <Link href="/fr" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-on-primary">
        Retour à l’accueil
      </Link>
    </div>
  );
}
