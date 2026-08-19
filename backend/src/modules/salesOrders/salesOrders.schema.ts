import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

// FG Module Part 3. Mirrors qcInspection.schema.ts's idParamsSchema (a
// strict digit-string -> BigInt transform, not z.coerce.bigint()'s looser
// coercion) for the one bigint path param this module's routes ever take.
const salesOrderStatusEnum = z.enum([
  'Open',
  'PartiallyReserved',
  'FullyReserved',
  'PartiallyDispatched',
  'Dispatched',
  'Closed',
]);

export const salesOrderNoParamsSchema = z.object({
  salesOrderNo: z.string().min(1),
});

function isValidDateString(val: string): boolean {
  return !Number.isNaN(Date.parse(val));
}

// `status` is deliberately NOT accepted here — it's never client-set, only
// ever derived by recomputeSalesOrderStatus off real FgReservation rows
// (see salesOrders.service.ts). A brand-new Sales Order always starts Open
// (the schema default), before any reservation exists against it.
export const createSalesOrderSchema = z.object({
  salesOrderNo: z.string().min(1, 'salesOrderNo is required'),
  customer: z.string().min(1, 'customer is required'),
  sku: z.string().min(1, 'sku is required'),
  orderedQty: z.coerce.number().positive('orderedQty must be greater than 0'),
  dueDate: z.string().refine(isValidDateString, { message: 'dueDate must be a valid date' }).optional(),
});

// Same "at least one field, status excluded" convention as
// warehouses.schema.ts's updateWarehouseSchema — status still isn't
// accepted here either; it only ever moves via recomputeSalesOrderStatus.
export const updateSalesOrderSchema = z
  .object({
    customer: z.string().min(1),
    sku: z.string().min(1),
    orderedQty: z.coerce.number().positive(),
    dueDate: z.string().refine(isValidDateString, { message: 'dueDate must be a valid date' }).nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const listSalesOrdersQuerySchema = paginationQuerySchema.extend({
  customer: z.string().optional(),
  sku: z.string().optional(),
  status: salesOrderStatusEnum.optional(),
});

export const listReservationsQuerySchema = paginationQuerySchema;

export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;
export type UpdateSalesOrderInput = z.infer<typeof updateSalesOrderSchema>;
export type ListSalesOrdersQuery = z.infer<typeof listSalesOrdersQuerySchema>;
export type ListReservationsQuery = z.infer<typeof listReservationsQuerySchema>;
