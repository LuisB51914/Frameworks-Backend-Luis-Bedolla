import type { NextFunction, Request, Response } from "express";
import {
  completeTask,
  createTask,
  deleteTask,
  findTaskById,
  listTasks,
  updateTaskStatus,
} from "../services/task.service.js";
import { AppError } from "../errors/app-error.js";
export const getTasks = (_req: Request, res: Response): void => {
  res.status(200).json({ data: listTasks() });
};
export const getTask = (_req: Request, res: Response): void => {
  res.status(200).json({ data: findTaskById(res.locals.taskId) });
};
export const postTask = (_req: Request, res: Response): void => {
  const task = createTask(res.locals.taskTitle);
  res.status(201).json({ data: task });
};
export const patchTaskComplete = (_req: Request, res: Response): void => {
  const task = completeTask(res.locals.taskId);
  res.status(200).json({ data: task });
};
export const patchTaskStatus = (_req: Request, res: Response): void => {
  const task = updateTaskStatus(res.locals.taskId, res.locals.completed);
  res.status(200).json({ data: task });
};
export const removeTask = (_req: Request, res: Response): void => {
  deleteTask(res.locals.taskId);
  res.status(204).send();
};
