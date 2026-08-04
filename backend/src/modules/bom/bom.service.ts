import { prisma } from '../../db/client';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { BulkImportBomInput, CreateBomComponentInput, UpdateBomComponentInput } from './bom.schema';

async function assertProductExists(sku: string): Promise<void> {
  const product = await prisma.product.findUnique({ where: { sku } });
  if (!product) {
    throw new ValidationError('Invalid modelRef', { modelRef: `Product with sku '${sku}' does not exist` });
  }
}

async function assertPartExists(partId: string): Promise<void> {
  const part = await prisma.rmInventory.findUnique({ where: { partId } });
  if (!part) {
    throw new ValidationError('Invalid partId', { partId: `RM inventory part '${partId}' does not exist` });
  }
}

export async function getBomByModelRef(modelRef: string) {
  await assertProductExists(modelRef);
  return prisma.bomComponent.findMany({ where: { modelRef }, orderBy: { id: 'asc' } });
}

export async function getBomComponentById(id: bigint) {
  const component = await prisma.bomComponent.findUnique({ where: { id } });
  if (!component) {
    throw new NotFoundError('BOM component', id.toString());
  }
  return component;
}

export async function createBomComponent(data: CreateBomComponentInput) {
  await assertProductExists(data.modelRef);
  if (data.partId) {
    await assertPartExists(data.partId);
  }
  return prisma.bomComponent.create({ data });
}

export async function updateBomComponent(id: bigint, data: UpdateBomComponentInput) {
  await getBomComponentById(id);
  if (data.partId) {
    await assertPartExists(data.partId);
  }
  return prisma.bomComponent.update({ where: { id }, data });
}

export async function deleteBomComponent(id: bigint): Promise<void> {
  await getBomComponentById(id);
  await prisma.bomComponent.delete({ where: { id } });
}

export async function bulkImportBom(input: BulkImportBomInput) {
  await assertProductExists(input.modelRef);

  const partIds = [...new Set(input.items.map((item) => item.partId).filter((v): v is string => !!v))];
  if (partIds.length > 0) {
    const existingParts = await prisma.rmInventory.findMany({ where: { partId: { in: partIds } } });
    const existingIds = new Set(existingParts.map((p) => p.partId));
    const missing = partIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      throw new ValidationError('Invalid partId(s)', { partIds: missing });
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.bomComponent.createMany({
      data: input.items.map((item) => ({ ...item, modelRef: input.modelRef })),
    });
    return tx.bomComponent.findMany({ where: { modelRef: input.modelRef }, orderBy: { id: 'asc' } });
  });
}
