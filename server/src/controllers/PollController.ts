import { Request, Response } from "express";
import { z } from "zod";
import { PollService } from "../services/PollService";

const createPollSchema = z.object({
  question: z.string().min(3).max(200),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1).max(120)
      })
    )
    .min(2)
    .max(6),
  durationSeconds: z.number().min(5).max(60)
});

export class PollController {
  constructor(private pollService: PollService) {}

  createPoll = async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = createPollSchema.parse(req.body);
      const poll = await this.pollService.createPoll(payload);
      res.status(201).json({ poll });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create poll";
      res.status(400).json({ message });
    }
  };

  getState = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.pollService.getCurrentState();
      res.status(200).json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load state";
      res.status(500).json({ message });
    }
  };

  getHistory = async (_req: Request, res: Response): Promise<void> => {
    try {
      const polls = await this.pollService.getHistory();
      res.status(200).json({ polls });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load history";
      res.status(500).json({ message });
    }
  };
}
