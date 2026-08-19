import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/apiResponse';
import * as fgReservationService from './fgReservation.service';

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as unknown as { id: bigint };
    const reservation = await fgReservationService.cancelReservation(id, req.user!.name);
    sendSuccess(res, reservation);
  } catch (err) {
    next(err);
  }
}
