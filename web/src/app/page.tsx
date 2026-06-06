import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="flex max-w-xl flex-col items-center gap-6">
        <span className="rounded-full border border-border bg-card px-3 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Chunk 0.1 · Foundation
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Partner Operating System
        </h1>
        <p className="text-balance text-lg text-muted-foreground">
          The multi-tenant business OS for COD &amp; Shopify merchants. Orders,
          shipping, stock, CRM, and finance — one isolated workspace per partner.
        </p>
        <div className="flex items-center gap-3">
          <Button size="lg">Get started</Button>
          <Button size="lg" variant="outline">
            Learn more
          </Button>
        </div>
      </div>
    </main>
  );
}
