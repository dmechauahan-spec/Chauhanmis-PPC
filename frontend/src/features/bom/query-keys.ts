export const bomKeys = {
  all: ["bom"] as const,
  bySku: (modelRef: string) => [...bomKeys.all, "sku", modelRef] as const,
};

export const bomExplosionKeys = {
  sku: (sku: string, qty: number) => ["bom-explosion", "sku", sku, qty] as const,
};
