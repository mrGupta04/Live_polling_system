"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollController = void 0;
const zod_1 = require("zod");
const createPollSchema = zod_1.z.object({
    question: zod_1.z.string().min(3).max(200),
    options: zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        text: zod_1.z.string().min(1).max(120)
    }))
        .min(2)
        .max(6),
    durationSeconds: zod_1.z.number().min(5).max(60)
});
class PollController {
    constructor(pollService) {
        this.pollService = pollService;
        this.createPoll = async (req, res) => {
            try {
                const payload = createPollSchema.parse(req.body);
                const poll = await this.pollService.createPoll(payload);
                res.status(201).json({ poll });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unable to create poll";
                res.status(400).json({ message });
            }
        };
        this.getState = async (_req, res) => {
            try {
                const data = await this.pollService.getCurrentState();
                res.status(200).json(data);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unable to load state";
                res.status(500).json({ message });
            }
        };
        this.getHistory = async (_req, res) => {
            try {
                const polls = await this.pollService.getHistory();
                res.status(200).json({ polls });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unable to load history";
                res.status(500).json({ message });
            }
        };
    }
}
exports.PollController = PollController;
