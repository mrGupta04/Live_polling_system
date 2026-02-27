import cors from "cors";
import express from "express";
import { PollController } from "./controllers/PollController";
import { createPollRoutes } from "./routes/pollRoutes";
import { PollService } from "./services/PollService";
import { env } from "./config/env";

export function createApp(pollService: PollService) {
  const app = express();

  app.use(
    cors({
      origin: env.clientOrigins,
      credentials: true
    })
  );
  app.use(express.json());

  const pollController = new PollController(pollService);
  app.use("/api/polls", createPollRoutes(pollController));

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, timestamp: Date.now() });
  });

  return app;
}
