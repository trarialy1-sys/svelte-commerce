import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { getOrgDb } from "@/lib/db";
import { tokenizeSku } from "@/lib/catalog/tokenize";

// Vision-capable Claude model (platform key). Config constant for easy bumps.
export const SCAN_MODEL = "claude-sonnet-4-6";

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

interface ScanLabel {
  raw: string;
  marked: boolean;
}

export interface ScanMatch {
  sku: string;
  variantId: string;
  marked: boolean;
}
export interface ScanResult {
  matched: ScanMatch[];
  unmatched: string[];
}

const SYSTEM = `Tu analyses une photo d'étiquettes / codes produits (SKU), souvent manuscrits.
Renvoie UNIQUEMENT du JSON valide, sans aucun texte autour, au format exact:
{"labels":[{"raw":"<le code tel qu'écrit>","marked":<true|false>}]}
"marked" vaut true si l'article est barré, entouré, coché, ou indiqué comme en rupture / épuisé ; sinon false.`;

function parseLabels(text: string): ScanLabel[] {
  let t = text.trim();
  // strip code fences
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    const obj = JSON.parse(t) as { labels?: ScanLabel[] };
    return Array.isArray(obj.labels)
      ? obj.labels.filter((l) => l && typeof l.raw === "string")
      : [];
  } catch {
    return [];
  }
}

export async function scanImage(
  orgId: string,
  imageBase64: string,
  mediaType: string
): Promise<ScanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY n'est pas configurée (plateforme).");
  }
  const client = new Anthropic({ apiKey });

  const msg = await client.messages.create({
    model: SCAN_MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as MediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "Liste tous les codes/SKU visibles et indique lesquels sont marqués.",
          },
        ],
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const labels = parseLabels(text);

  const variants = await getOrgDb(orgId).variant.findMany({
    select: { id: true, sku: true },
  });
  const knownSkus = variants.map((v) => v.sku);
  const idBySku = new Map(variants.map((v) => [v.sku, v.id]));

  const matched: ScanMatch[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    const skus = tokenizeSku(label.raw, knownSkus);
    if (skus.length === 0) {
      unmatched.push(label.raw);
      continue;
    }
    for (const sku of skus) {
      const variantId = idBySku.get(sku);
      if (variantId && !seen.has(sku)) {
        seen.add(sku);
        matched.push({ sku, variantId, marked: label.marked });
      }
    }
  }

  return { matched, unmatched };
}
