// BigInt (used for BIGSERIAL ids) isn't JSON-serializable by default.
// IDs in this system are small (order-of-thousands rows), so it's safe to
// surface them to API consumers as plain numbers rather than strings.
export function installBigIntJsonSupport(): void {
  if (!('toJSON' in BigInt.prototype)) {
    (BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
      return Number(this);
    };
  }
}
