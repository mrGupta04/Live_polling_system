import { Server, Socket } from "socket.io";
import { z } from "zod";
import { PollService } from "../services/PollService";

const registerSchema = z.object({
  sessionId: z.string().min(1),
  name: z.string().min(1).max(60)
});

const voteSchema = z.object({
  pollId: z.string().min(1),
  optionId: z.string().min(1),
  studentSessionId: z.string().min(1),
  studentName: z.string().min(1)
});

const stateSchema = z
  .object({
    sessionId: z.string().min(1).optional()
  })
  .optional();

const chatSendSchema = z.object({
  text: z.string().min(1).max(300),
  sessionId: z.string().min(1).optional(),
  senderName: z.string().min(1).max(60).optional(),
  role: z.enum(["teacher", "student"]).optional()
});

const kickSchema = z.object({
  sessionId: z.string().min(1)
});

type ChatMessage = {
  id: string;
  text: string;
  senderName: string;
  role: "teacher" | "student";
  createdAt: number;
};

export class PollSocketHandler {
  private teacherSockets = new Set<string>();
  private chatHistory: ChatMessage[] = [];

  constructor(private io: Server, private pollService: PollService) {
    this.pollService.setEvents({
      onPollCreated: (poll) => this.io.emit("poll:created", { poll, serverTime: Date.now() }),
      onPollUpdated: (poll) => this.io.emit("poll:updated", { poll, serverTime: Date.now() }),
      onPollCompleted: (poll) => this.io.emit("poll:completed", { poll, serverTime: Date.now() })
    });
  }

  bind(): void {
    this.io.on("connection", (socket) => {
      this.attachSocketListeners(socket);
    });
  }

  private attachSocketListeners(socket: Socket): void {
    socket.on("student:register", async (payload, ack) => {
      try {
        const parsed = registerSchema.parse(payload);
        const student = this.pollService.registerStudent(parsed, socket.id);
        const state = await this.pollService.getCurrentState(parsed.sessionId);
        this.emitParticipants();
        ack?.({ ok: true, student, state, serverTime: Date.now() });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to register student";
        ack?.({ ok: false, message });
      }
    });

    socket.on("poll:vote", async (payload, ack) => {
      try {
        const parsed = voteSchema.parse(payload);
        const poll = await this.pollService.submitVote(parsed);
        ack?.({ ok: true, poll, serverTime: Date.now() });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Vote failed";
        ack?.({ ok: false, message });
      }
    });

    socket.on("poll:state", async (_payload, ack) => {
      try {
        const parsed = stateSchema.parse(_payload);
        const state = await this.pollService.getCurrentState(parsed?.sessionId);
        ack?.({ ok: true, state, serverTime: Date.now() });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to fetch state";
        ack?.({ ok: false, message });
      }
    });

    socket.on("teacher:register", (_payload, ack) => {
      this.teacherSockets.add(socket.id);
      ack?.({ ok: true });
      this.emitParticipants();
    });

    socket.on("room:participants", (_payload, ack) => {
      ack?.({
        ok: true,
        participants: this.pollService.getConnectedStudents(),
        messages: this.chatHistory
      });
    });

    socket.on("chat:send", (payload, ack) => {
      try {
        const parsed = chatSendSchema.parse(payload);
        const isTeacherSocket = this.teacherSockets.has(socket.id);
        const role = isTeacherSocket ? "teacher" : "student";
        const senderName = isTeacherSocket ? parsed.senderName || "Teacher" : parsed.senderName || "Student";
        const message: ChatMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: parsed.text.trim(),
          senderName,
          role,
          createdAt: Date.now()
        };

        this.chatHistory.push(message);
        if (this.chatHistory.length > 80) {
          this.chatHistory = this.chatHistory.slice(-80);
        }

        this.io.emit("chat:new", message);
        ack?.({ ok: true, message });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to send message";
        ack?.({ ok: false, message });
      }
    });

    socket.on("teacher:kick", (payload, ack) => {
      try {
        if (!this.teacherSockets.has(socket.id)) {
          throw new Error("Only teacher can remove a student");
        }

        const parsed = kickSchema.parse(payload);
        const result = this.pollService.removeStudent(parsed.sessionId);
        if (!result.removed || !result.socketId) {
          throw new Error("Student not found");
        }

        const kickedSocket = this.io.sockets.sockets.get(result.socketId);
        kickedSocket?.emit("room:kicked", { message: "You were removed by the teacher" });
        kickedSocket?.disconnect(true);

        this.emitParticipants();
        ack?.({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to remove student";
        ack?.({ ok: false, message });
      }
    });

    socket.on("disconnect", () => {
      this.teacherSockets.delete(socket.id);
      const removed = this.pollService.unregisterSocket(socket.id);
      if (removed) {
        this.emitParticipants();
      }
    });
  }

  private emitParticipants(): void {
    this.io.emit("participants:update", {
      participants: this.pollService.getConnectedStudents()
    });
  }
}
