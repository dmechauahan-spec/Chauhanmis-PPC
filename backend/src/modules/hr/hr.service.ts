import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateHrTeamInput, ListHrTeamsQuery, UpdateHrTeamInput } from './hr.schema';

type HrTeamResult = Awaited<ReturnType<typeof prisma.hrTeam.findUniqueOrThrow>>;

async function assertLineExists(lineId: string): Promise<void> {
  const line = await prisma.productionLine.findUnique({ where: { lineId } });
  if (!line) {
    throw new ValidationError('Invalid lineId', { lineId: `Production line '${lineId}' does not exist` });
  }
}

export async function listHrTeams(query: ListHrTeamsQuery): Promise<PaginatedResult<HrTeamResult>> {
  const where: Prisma.HrTeamWhereInput = {};
  if (query.lineId) {
    where.lineId = query.lineId;
  }

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.hrTeam.findMany({ where, skip, take }),
    prisma.hrTeam.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getHrTeamById(teamId: string): Promise<HrTeamResult> {
  const team = await prisma.hrTeam.findUnique({ where: { teamId } });
  if (!team) {
    throw new NotFoundError('HR team', teamId);
  }
  return team;
}

export async function createHrTeam(data: CreateHrTeamInput): Promise<HrTeamResult> {
  if (data.lineId) {
    await assertLineExists(data.lineId);
  }
  return prisma.hrTeam.create({ data });
}

export async function updateHrTeam(teamId: string, data: UpdateHrTeamInput): Promise<HrTeamResult> {
  await getHrTeamById(teamId);
  if (data.lineId) {
    await assertLineExists(data.lineId);
  }
  return prisma.hrTeam.update({ where: { teamId }, data });
}

export async function deleteHrTeam(teamId: string): Promise<void> {
  await getHrTeamById(teamId);
  await prisma.hrTeam.delete({ where: { teamId } });
}
