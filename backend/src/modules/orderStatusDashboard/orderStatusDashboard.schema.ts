import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination';

// No filters beyond pagination — this endpoint always shows every non-Closed
// order. A caller wanting a narrower slice (by line, by status, ...) already
// has each underlying module's own list endpoint for that.
export const listOrderStatusDashboardQuerySchema = paginationQuerySchema;

export type ListOrderStatusDashboardQuery = z.infer<typeof listOrderStatusDashboardQuerySchema>;
