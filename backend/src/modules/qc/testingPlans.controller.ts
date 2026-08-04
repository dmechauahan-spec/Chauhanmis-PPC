import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as testingPlansService from './testingPlans.service';
import { ListTestingPlansQuery } from './testingPlans.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await testingPlansService.listTestingPlans(req.query as unknown as ListTestingPlansQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as { id: bigint };
    const plan = await testingPlansService.getTestingPlanById(id);
    sendSuccess(res, plan);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await testingPlansService.createTestingPlan(req.body);
    sendSuccess(res, plan, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as { id: bigint };
    const plan = await testingPlansService.updateTestingPlan(id, req.body);
    sendSuccess(res, plan);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as { id: bigint };
    await testingPlansService.deleteTestingPlan(id);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
