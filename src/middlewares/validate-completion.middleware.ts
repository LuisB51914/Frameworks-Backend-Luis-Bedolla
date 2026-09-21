import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";

export const validateCompletion = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (typeof req.body?.completed !== "boolean") {
    next(
      new AppError(
        "La solicitud contiene datos inválidos.",
        422,
        "VALIDATION_ERROR",
        [{ field: "completed", message: "Debe ser un booleano." }],
      ),
    );
    return;
  }

  res.locals.completed = req.body.completed;
  next();
};
