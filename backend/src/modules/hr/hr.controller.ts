import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as hrService from './hr.service';
import { ListHrTeamsQuery } from './hr.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await hrService.listHrTeams(req.query as unknown as ListHrTeamsQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const team = await hrService.getHrTeamById(req.params.teamId);
    sendSuccess(res, team);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const team = await hrService.createHrTeam(req.body);
    sendSuccess(res, team, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const team = await hrService.updateHrTeam(req.params.teamId, req.body);
    sendSuccess(res, team);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await hrService.deleteHrTeam(req.params.teamId);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
