import { z } from "zod";
import type { BomUom } from "@/types/api";

const UOM_VALUES = ["Pcs", "Set", "Kg", "Ltr", "Mtr"] as const;

// Mirrors ppc-backend's bom.schema.ts#bomItemSchema — client-side copy for
// immediate form feedback; the backend's own validation (including that
// partId, if given, must be an existing RM Inventory part) is still
// authoritative on submit.
export const componentFormSchema = z.object({
  partName: z.string().min(1, "Part name is required"),
  uom: z.enum(UOM_VALUES),
  qtyPerUnit: z.coerce.number().positive("Qty per unit must be > 0"),
  partId: z.string().optional(),
});

export type ComponentFormInput = z.input<typeof componentFormSchema>;
export type ComponentFormValues = z.output<typeof componentFormSchema>;

// ---- Bulk import paste parsing ----
// One row per line, comma-separated: partName, uom, qtyPerUnit, partId —
// only partName is required, matching the single-row form's own optionality
// so a spreadsheet column that's blank for every row can just be omitted
// from the pasted text entirely (see bulk-import-dialog.tsx's format hint).

export interface ParsedBulkRowOk {
  status: "ok";
  line: number;
  raw: string;
  partName: string;
  uom: BomUom;
  qtyPerUnit: number;
  partId?: string;
}

export interface ParsedBulkRowError {
  status: "error";
  line: number;
  raw: string;
  error: string;
}

export type ParsedBulkRow = ParsedBulkRowOk | ParsedBulkRowError;

function normalizeUom(raw: string): BomUom | null {
  const match = UOM_VALUES.find((u) => u.toLowerCase() === raw.trim().toLowerCase());
  return match ?? null;
}

export function parseBulkImportText(text: string): ParsedBulkRow[] {
  const lines = text.split("\n");
  const rows: ParsedBulkRow[] = [];

  lines.forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed) return; // blank lines are just spacing, not rows

    const fields = trimmed.split(",").map((f) => f.trim());
    const [partName, uomRaw, qtyRaw, partIdRaw] = fields;
    const line = i + 1;

    if (!partName) {
      rows.push({ status: "error", line, raw, error: "Part name is required" });
      return;
    }

    let uom: BomUom = "Pcs";
    if (uomRaw) {
      const normalized = normalizeUom(uomRaw);
      if (!normalized) {
        rows.push({ status: "error", line, raw, error: `Unknown UOM "${uomRaw}" — expected one of ${UOM_VALUES.join(", ")}` });
        return;
      }
      uom = normalized;
    }

    let qtyPerUnit = 1;
    if (qtyRaw) {
      const parsed = Number(qtyRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        rows.push({ status: "error", line, raw, error: `Qty per unit "${qtyRaw}" must be a positive number` });
        return;
      }
      qtyPerUnit = parsed;
    }

    rows.push({
      status: "ok",
      line,
      raw,
      partName,
      uom,
      qtyPerUnit,
      ...(partIdRaw ? { partId: partIdRaw } : {}),
    });
  });

  return rows;
}
