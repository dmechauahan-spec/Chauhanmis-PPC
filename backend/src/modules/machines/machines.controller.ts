import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as machinesService from './machines.service';
import { ListMachinesQuery } from './machines.schema';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await machinesService.listMachines(req.query as unknown as ListMachinesQuery);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const machine = await machinesService.getMachineById(req.params.machineId);
    sendSuccess(res, machine);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const machine = await machinesService.createMachine(req.body);
    sendSuccess(res, machine, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const machine = await machinesService.updateMachine(req.params.machineId, req.body);
    sendSuccess(res, machine);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await machinesService.deleteMachine(req.params.machineId);
    sendSuccess(res, null);
  } catch (err) {
    next(err);
  }
}
