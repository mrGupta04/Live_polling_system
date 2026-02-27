import mongoose from "mongoose";
import { CreatePollInput, PollResult, StudentSession } from "../types";
import { PollModel } from "../models/Poll";
import { VoteModel } from "../models/Vote";

type PollEvents = {
  onPollCreated: (poll: PollResult) => void;
  onPollUpdated: (poll: PollResult) => void;
  onPollCompleted: (poll: PollResult) => void;
};

const schedulerMap = new Map<string, NodeJS.Timeout>();

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected server error";
}

export class PollService {
  private studentRegistry = new Map<string, StudentSession>();
  private socketToSession = new Map<string, string>();
  private sessionToSocket = new Map<string, string>();
  private blockedSessionIds = new Set<string>();
  private events: PollEvents;

  constructor(events?: Partial<PollEvents>) {
    this.events = {
      onPollCreated: events?.onPollCreated || (() => undefined),
      onPollUpdated: events?.onPollUpdated || (() => undefined),
      onPollCompleted: events?.onPollCompleted || (() => undefined)
    };
  }

  setEvents(events: Partial<PollEvents>): void {
    this.events = {
      ...this.events,
      ...events
    };
  }

  registerStudent(session: StudentSession, socketId: string): { sessionId: string; name: string } {
    if (this.blockedSessionIds.has(session.sessionId)) {
      throw new Error("You were removed by the teacher");
    }

    this.studentRegistry.set(session.sessionId, session);
    const previousSocketId = this.sessionToSocket.get(session.sessionId);
    if (previousSocketId) {
      this.socketToSession.delete(previousSocketId);
    }

    this.socketToSession.set(socketId, session.sessionId);
    this.sessionToSocket.set(session.sessionId, socketId);
    return session;
  }

  unregisterSocket(socketId: string): boolean {
    const sessionId = this.socketToSession.get(socketId);
    if (!sessionId) {
      return false;
    }

    this.socketToSession.delete(socketId);

    const mappedSocket = this.sessionToSocket.get(sessionId);
    if (mappedSocket === socketId) {
      this.sessionToSocket.delete(sessionId);
      this.studentRegistry.delete(sessionId);
      return true;
    }

    return false;
  }

  getConnectedStudentsCount(): number {
    return this.studentRegistry.size;
  }

  getConnectedStudents(): StudentSession[] {
    return Array.from(this.studentRegistry.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  removeStudent(sessionId: string): { removed: boolean; socketId?: string } {
    const socketId = this.sessionToSocket.get(sessionId);
    if (!socketId) {
      return { removed: false };
    }

    this.blockedSessionIds.add(sessionId);
    this.sessionToSocket.delete(sessionId);
    this.socketToSession.delete(socketId);
    this.studentRegistry.delete(sessionId);
    return { removed: true, socketId };
  }

  async createPoll(input: CreatePollInput): Promise<PollResult> {
    try {
      await this.completeExpiredPollIfNeeded();
      const current = await PollModel.findOne({ status: "active" }).sort({ startedAt: -1 });
      if (current) {
        throw new Error("Cannot create a new poll while another poll is active");
      }

      const now = new Date();
      const endsAt = new Date(now.getTime() + input.durationSeconds * 1000);
      const expectedRespondentIds = Array.from(this.studentRegistry.keys());

      const pollDoc = await PollModel.create({
        question: input.question,
        options: input.options,
        durationSeconds: input.durationSeconds,
        startedAt: now,
        endsAt,
        status: "active",
        expectedRespondentIds
      });

      this.schedulePollCompletion(pollDoc._id.toString(), endsAt);

      const result = await this.getPollResult(pollDoc._id.toString());
      this.events.onPollCreated(result);
      return result;
    } catch (error) {
      if (error instanceof mongoose.Error) {
        throw new Error("Database unavailable while creating poll");
      }
      throw new Error(sanitizeError(error));
    }
  }

  async submitVote(input: {
    pollId: string;
    optionId: string;
    studentSessionId: string;
    studentName: string;
  }): Promise<PollResult> {
    try {
      await this.completeExpiredPollIfNeeded();
      const poll = await PollModel.findById(input.pollId);
      if (!poll || poll.status !== "active") {
        throw new Error("Poll is no longer active");
      }

      if (poll.endsAt.getTime() <= Date.now()) {
        await this.completePoll(poll._id.toString());
        throw new Error("Time is up for this poll");
      }

      const optionExists = poll.options.some((opt) => opt.id === input.optionId);
      if (!optionExists) {
        throw new Error("Invalid option selected");
      }

      const existingVote = await VoteModel.findOne({
        pollId: input.pollId,
        studentSessionId: input.studentSessionId
      });
      if (existingVote) {
        throw new Error("You have already voted for this poll");
      }

      await VoteModel.create({
        pollId: input.pollId,
        optionId: input.optionId,
        studentSessionId: input.studentSessionId,
        studentName: input.studentName
      });

      const maybeCompleted = await this.completeIfAllExpectedStudentsAnswered(input.pollId);
      if (maybeCompleted) {
        this.events.onPollCompleted(maybeCompleted);
        return maybeCompleted;
      }

      const updated = await this.getPollResult(input.pollId);
      this.events.onPollUpdated(updated);
      return updated;
    } catch (error) {
      if (error instanceof mongoose.Error) {
        if (error.message.includes("duplicate key")) {
          throw new Error("You have already voted for this poll");
        }
        throw new Error("Database unavailable while submitting vote");
      }
      throw new Error(sanitizeError(error));
    }
  }

  async getCurrentState(studentSessionId?: string): Promise<{
    activePoll: PollResult | null;
    latestCompletedPoll: PollResult | null;
    studentVoteOptionId: string | null;
  }> {
    await this.completeExpiredPollIfNeeded();
    const active = await PollModel.findOne({ status: "active" }).sort({ startedAt: -1 });
    const completed = await PollModel.findOne({ status: "completed" }).sort({ endedAt: -1, startedAt: -1 });

    let studentVoteOptionId: string | null = null;
    if (active && studentSessionId) {
      const vote = await VoteModel.findOne({
        pollId: active._id.toString(),
        studentSessionId
      }).select("optionId");
      studentVoteOptionId = vote?.optionId || null;
    }

    return {
      activePoll: active ? await this.getPollResult(active._id.toString()) : null,
      latestCompletedPoll: completed ? await this.getPollResult(completed._id.toString()) : null,
      studentVoteOptionId
    };
  }

  async getHistory(): Promise<PollResult[]> {
    try {
      await this.completeExpiredPollIfNeeded();
      const polls = await PollModel.find({
        status: "completed",
        question: { $not: /^(E2E Poll|Verify Poll)\b/i }
      })
        .sort({ startedAt: -1 })
        .limit(30);

      return Promise.all(polls.map((poll) => this.getPollResult(poll._id.toString())));
    } catch (error) {
      if (error instanceof mongoose.Error) {
        throw new Error("Database unavailable while loading poll history");
      }
      throw new Error(sanitizeError(error));
    }
  }

  async getPollResult(pollId: string): Promise<PollResult> {
    const poll = await PollModel.findById(pollId);
    if (!poll) {
      throw new Error("Poll not found");
    }

    const votes = await VoteModel.find({ pollId: poll._id.toString() });
    const totalVotes = votes.length;

    const options = poll.options.map((option) => {
      const count = votes.filter((vote) => vote.optionId === option.id).length;
      const percentage = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
      return {
        id: option.id,
        text: option.text,
        votes: count,
        percentage
      };
    });

    return {
      id: poll._id.toString(),
      question: poll.question,
      status: poll.status,
      durationSeconds: poll.durationSeconds,
      startedAt: poll.startedAt.toISOString(),
      endsAt: poll.endsAt.toISOString(),
      totalVotes,
      options
    };
  }

  private async completeExpiredPollIfNeeded(): Promise<void> {
    const active = await PollModel.findOne({ status: "active" }).sort({ startedAt: -1 });
    if (!active) {
      return;
    }
    if (active.endsAt.getTime() <= Date.now()) {
      const result = await this.completePoll(active._id.toString());
      this.events.onPollCompleted(result);
    }
  }

  private async completeIfAllExpectedStudentsAnswered(pollId: string): Promise<PollResult | null> {
    const poll = await PollModel.findById(pollId);
    if (!poll || poll.status !== "active") {
      return null;
    }

    if (poll.expectedRespondentIds.length === 0) {
      return null;
    }

    const count = await VoteModel.countDocuments({ pollId });
    if (count >= poll.expectedRespondentIds.length) {
      const result = await this.completePoll(pollId);
      return result;
    }

    return null;
  }

  private schedulePollCompletion(pollId: string, endsAt: Date): void {
    const delay = Math.max(0, endsAt.getTime() - Date.now());
    const existing = schedulerMap.get(pollId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(async () => {
      try {
        const result = await this.completePoll(pollId);
        this.events.onPollCompleted(result);
      } catch {
        return;
      }
    }, delay);

    schedulerMap.set(pollId, timer);
  }

  private async completePoll(pollId: string): Promise<PollResult> {
    const poll = await PollModel.findById(pollId);
    if (!poll) {
      throw new Error("Poll not found");
    }
    if (poll.status === "completed") {
      return this.getPollResult(pollId);
    }

    poll.status = "completed";
    await poll.save();

    const existing = schedulerMap.get(pollId);
    if (existing) {
      clearTimeout(existing);
      schedulerMap.delete(pollId);
    }

    return this.getPollResult(pollId);
  }
}
