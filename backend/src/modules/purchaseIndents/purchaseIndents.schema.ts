import { z } from 'zod';
import { IndentPriority, IndentSourceType, PurchaseCategory } from '@prisma/client';
import { paginationQuerySchema } from '../../utils/pagination';

const purchaseCategoryEnum = z.nativeEnum(PurchaseCategory);
const indentPriorityEnum = z.nativeEnum(IndentPriority);
const indentSourceTypeEnum = z.nativeEnum(IndentSourceType);

export const indentIdParamsSchema = z.object({
  indentId: z
    .string()
    .regex(/^\d+$/, 'indentId must be a positive integer')
    .transform((val) => BigInt(val)),
});

export const createIndentSchema = z.object({
  department: z.string().min(1, 'department is required'),
  category: purchaseCategoryEnum,
  // z.coerce.bigint(), not the string-regex-transform params use, since this
  // is a BODY field: ids round-trip through JSON as plain numbers (see
  // installBigIntJsonSupport), so a caller passing an id straight from a
  // prior response — not just a hand-typed string — must also validate.
  // Same convention as fgDispatch.schema.ts's fgBatchId/salesOrderId.
  purchaseItemId: z.coerce.bigint({ message: 'purchaseItemId must be a valid integer id' }),
  specification: z.string().optional(),
  qty: z.number().positive('qty must be greater than 0'),
  uom: z.string().min(1, 'uom is required'),
  requiredDate: z.coerce.date().optional(),
  priority: indentPriorityEnum.default(IndentPriority.Medium),
  reason: z.string().optional(),
  referenceOrderId: z.string().optional(),
  sourceType: indentSourceTypeEnum.default(IndentSourceType.Manual),
  sourceReferenceId: z.string().optional(),
});

export const rejectIndentSchema = z.object({
  remarks: z.string().min(1, 'remarks is required to reject an indent'),
});

export const approveIndentSchema = z.object({
  remarks: z.string().optional(),
});

export const listIndentsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['Draft', 'Submitted', 'Approved', 'Rejected', 'ConvertedToPO']).optional(),
  category: purchaseCategoryEnum.optional(),
  department: z.string().optional(),
  priority: indentPriorityEnum.optional(),
  sourceType: indentSourceTypeEnum.optional(),
});

export type IndentIdParams = z.infer<typeof indentIdParamsSchema>;
export type CreateIndentInput = z.infer<typeof createIndentSchema>;
export type RejectIndentInput = z.infer<typeof rejectIndentSchema>;
export type ApproveIndentInput = z.infer<typeof approveIndentSchema>;
export type ListIndentsQuery = z.infer<typeof listIndentsQuerySchema>;
