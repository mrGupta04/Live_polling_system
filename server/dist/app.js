"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const PollController_1 = require("./controllers/PollController");
const pollRoutes_1 = require("./routes/pollRoutes");
const env_1 = require("./config/env");
function createApp(pollService) {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({
        origin: env_1.env.clientOrigins,
        credentials: true
    }));
    app.use(express_1.default.json());
    const pollController = new PollController_1.PollController(pollService);
    app.use("/api/polls", (0, pollRoutes_1.createPollRoutes)(pollController));
    app.get("/health", (_req, res) => {
        res.status(200).json({ ok: true, timestamp: Date.now() });
    });
    return app;
}
