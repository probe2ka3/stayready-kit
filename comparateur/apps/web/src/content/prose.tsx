import type { ReactNode } from 'react';

/** Mise en forme des pages de contenu (sans dépendance de typographie). */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <article
      className="mx-auto max-w-3xl space-y-4 text-[16px] leading-relaxed
      [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
      [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:tracking-tight
      [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold
      [&_h3]:mt-5 [&_h3]:font-semibold
      [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ol>li]:list-decimal
      [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top
      [&_th]:py-2 [&_th]:pr-3 [&_th]:text-left [&_th]:text-muted
      [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-[0.9em]
      [&_.lead]:text-lg [&_.lead]:text-muted"
    >
      {children}
    </article>
  );
}

export function Todo({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-warn-soft px-1 text-warn">{children}</mark>;
}
