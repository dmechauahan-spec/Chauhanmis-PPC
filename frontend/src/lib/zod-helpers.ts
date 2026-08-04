import { z } from "zod";

// z.coerce.number() on an empty string coerces to 0, not undefined — fine
// for a required field (0 fails a .positive()/.min(1) check with a normal
// message) but wrong for a genuinely optional one, where blank must mean
// "omit this field" rather than "the value is zero" (e.g. a .nonnegative()
// field would silently accept the coerced 0 as valid, submitting a real
// zero for a field the user meant to leave unset). Originally found and
// fixed in Daily Logs' form (daily-log-schema.ts); extracted here since
// Products/Lines/HR Teams' optional numeric fields have the same shape.
export function optionalCoercedNumber(inner: z.ZodNumber) {
  return z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
    inner.optional(),
  );
}
