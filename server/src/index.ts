import { createServer } from "http";
import { Server } from "socket.io";
import { createApp } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { PollService } from "./services/PollService";
import { PollSocketHandler } from "./sockets/PollSocketHandler";

async function bootstrap() {
  await connectDatabase();

  const pollService = new PollService();
  const app = createApp(pollService);
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigins,
      credentials: true
    }
  });

  const socketHandler = new PollSocketHandler(io, pollService);
  socketHandler.bind();

  httpServer.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });
}

bootstrap();
