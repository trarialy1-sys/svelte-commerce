"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { importCatalogCsvAction } from "./actions";

/** Upload a Shopify product-export CSV to upsert the catalog. Admin-only. */
export function CsvImportButton() {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await importCatalogCsvAction(fd);
      if (r.ok) {
        toast.success(
          `${r.products} produit(s), ${r.variants} variante(s) importé(s)`
        );
        router.refresh();
      } else {
        toast.error(r.message ?? "Échec de l'import");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={onFile}
      />
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => fileRef.current?.click()}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4" />
        )}
        Importer CSV
      </Button>
    </>
  );
}
