import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateLineInput, ListLinesQuery, UpdateLineInput } from './lines.schema';

const includeCompatibility = { compatibility: true } satisfies Prisma.ProductionLineInclude;

type LineWithCompatibility = Prisma.ProductionLineGetPayload<{ include: typeof includeCompatibility }>;

interface LineOutput extends Omit<LineWithCompatibility, 'compatibility'> {
  productTypes: string[];
}

function toLineOutput(line: LineWithCompatibility): LineOutput {
  const { compatibility, ...rest } = line;
  return { ...rest, productTypes: compatibility.map((c) => c.productType) };
}

export async function listLines(query: ListLinesQuery): Promise<PaginatedResult<LineOutput>> {
  const where: Prisma.ProductionLineWhereInput = {};
  if (query.status) {
    where.status = query.status;
  }

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.productionLine.findMany({ where, skip, take, include: includeCompatibility }),
    prisma.productionLine.count({ where }),
  ]);

  return buildPaginated(items.map(toLineOutput), total, query.page, query.pageSize);
}

export async function getLineById(lineId: string): Promise<LineOutput> {
  const line = await prisma.productionLine.findUnique({
    where: { lineId },
    include: includeCompatibility,
  });
  if (!line) {
    throw new NotFoundError('Production line', lineId);
  }
  return toLineOutput(line);
}

export async function createLine(data: CreateLineInput): Promise<LineOutput> {
  const { productTypes, ...lineData } = data;

  const line = await prisma.$transaction(async (tx) => {
    const created = await tx.productionLine.create({ data: lineData });
    if (productTypes.length > 0) {
      await tx.lineProductCompatibility.createMany({
        data: productTypes.map((productType) => ({ lineId: created.lineId, productType })),
        skipDuplicates: true,
      });
    }
    return tx.productionLine.findUniqueOrThrow({
      where: { lineId: created.lineId },
      include: includeCompatibility,
    });
  });

  return toLineOutput(line);
}

export async function updateLine(lineId: string, data: UpdateLineInput): Promise<LineOutput> {
  await getLineById(lineId);
  const { productTypes, ...lineData } = data;

  const line = await prisma.$transaction(async (tx) => {
    if (Object.keys(lineData).length > 0) {
      await tx.productionLine.update({ where: { lineId }, data: lineData });
    }
    if (productTypes) {
      await tx.lineProductCompatibility.deleteMany({ where: { lineId } });
      if (productTypes.length > 0) {
        await tx.lineProductCompatibility.createMany({
          data: productTypes.map((productType) => ({ lineId, productType })),
          skipDuplicates: true,
        });
      }
    }
    return tx.productionLine.findUniqueOrThrow({ where: { lineId }, include: includeCompatibility });
  });

  return toLineOutput(line);
}

export async function deleteLine(lineId: string): Promise<void> {
  await getLineById(lineId);
  // Hard delete. line_product_compatibility cascades; hr_teams / production_schedule /
  // daily_production_log FKs to line_id are NOT cascading, so deleting a line still
  // referenced there is rejected by Postgres and surfaced as a 400 by errorHandler.
  await prisma.productionLine.delete({ where: { lineId } });
}
