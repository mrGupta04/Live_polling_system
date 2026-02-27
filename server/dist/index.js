"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const app_1 = require("./app");
const database_1 = require("./config/database");
const env_1 = require("./config/env");
const PollService_1 = require("./services/PollService");
const PollSocketHandler_1 = require("./sockets/PollSocketHandler");
async function bootstrap() {
    await (0, database_1.connectDatabase)();
    const pollService = new PollService_1.PollService();
    const app = (0, app_1.createApp)(pollService);
    const httpServer = (0, http_1.createServer)(app);
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: env_1.env.clientOrigins,
            credentials: true
        }
    });
    const socketHandler = new PollSocketHandler_1.PollSocketHandler(io, pollService);
    socketHandler.bind();
    httpServer.listen(env_1.env.port, () => {
        console.log(`Server running on http://localhost:${env_1.env.port}`);
    });
}
bootstrap();
