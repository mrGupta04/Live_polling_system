import { Router } from "express";
import { PollController } from "../controllers/PollController";

export function createPollRoutes(controller: PollController): Router {
  const router = Router();

  router.get("/state", controller.getState);
  router.get("/history", controller.getHistory);
  router.post("/create", controller.createPoll);

  return router;
}
