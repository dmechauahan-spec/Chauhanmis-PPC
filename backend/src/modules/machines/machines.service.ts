import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateMachineInput, ListMachinesQuery, UpdateMachineInput } from './machines.schema';

// List/detail include the parent line's basic info (lineId, lineName) so the
// UI doesn't need a second lookup — see README "Machine master data".
const includeLine = { line: { select: { lineId: true, lineName: true } } } satisfies Prisma.MachineInclude;

type MachineWithLine = Prisma.MachineGetPayload<{ include: typeof includeLine }>;

async function getLineOrThrow(lineId: string) {
  const line = await prisma.productionLine.findUnique({ where: { lineId } });
  if (!line) {
    throw new ValidationError('Invalid lineId', { lineId: `Production line '${lineId}' does not exist` });
  }
  return line;
}

export async function listMachines(query: ListMachinesQuery): Promise<PaginatedResult<MachineWithLine>> {
  const where: Prisma.MachineWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.lineId) where.lineId = query.lineId;

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.machine.findMany({ where, skip, take, include: includeLine, orderBy: { machineId: 'asc' } }),
    prisma.machine.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getMachineById(machineId: string): Promise<MachineWithLine> {
  const machine = await prisma.machine.findUnique({ where: { machineId }, include: includeLine });
  if (!machine) {
    throw new NotFoundError('Machine', machineId);
  }
  return machine;
}

export async function createMachine(data: CreateMachineInput): Promise<MachineWithLine> {
  await getLineOrThrow(data.lineId);

  return prisma.machine.create({
    data: {
      machineId: data.machineId,
      machineName: data.machineName,
      lineId: data.lineId,
      capacityPerHour: data.capacityPerHour,
      capacityPerShift: data.capacityPerShift,
      capacityPerDay: data.capacityPerDay,
      status: data.status,
      notes: data.notes,
    },
    include: includeLine,
  });
}

export async function updateMachine(machineId: string, data: UpdateMachineInput): Promise<MachineWithLine> {
  await getMachineById(machineId);
  if (data.lineId) {
    await getLineOrThrow(data.lineId);
  }

  return prisma.machine.update({ where: { machineId }, data, include: includeLine });
}

export async function deleteMachine(machineId: string): Promise<void> {
  await getMachineById(machineId);
  await prisma.machine.delete({ where: { machineId } });
}
