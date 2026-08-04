import { z } from "zod";

// Mirrors ppc-backend's testingPlans.schema.ts field requirements
// (productType/planName required, description optional). Static schema —
// the productType uniqueness check is NOT baked in here. An earlier
// version built the schema per-render from an existingProductTypes prop
// via a dynamic zodResolver(schema), but that duplicate check didn't
// reliably fire at submit time (confirmed live: submitting a genuine
// duplicate always reached the backend's 409 instead of being caught
// client-side first). Doing the uniqueness check imperatively in
// onSubmit via setError (see testing-plan-form-dialog.tsx) is the more
// robust pattern for a check that depends on data outside the schema
// itself, and sidesteps relying on the resolver being re-evaluated with
// fresh props on every render.
export const testingPlanFormSchema = z.object({
  productType: z.string().min(1, "Product type is required"),
  planName: z.string().min(1, "Plan name is required"),
  description: z.string().optional(),
});

export type TestingPlanFormValues = z.infer<typeof testingPlanFormSchema>;
