"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Poll_1 = require("../models/Poll");
const Vote_1 = require("../models/Vote");
const schedulerMap = new Map();
function sanitizeError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return "Unexpected server error";
}
class PollService {
    constructor(events) {
        this.studentRegistry = new Map();
        this.socketToSession = new Map();
        this.sessionToSocket = new Map();
        this.blockedSessionIds = new Set();
        this.events = {
            onPollCreated: events?.onPollCreated || (() => undefined),
            onPollUpdated: events?.onPollUpdated || (() => undefined),
            onPollCompleted: events?.onPollCompleted || (() => undefined)
        };
    }
    setEvents(events) {
        this.events = {
            ...this.events,
            ...events
        };
    }
    registerStudent(session, socketId) {
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
    unregisterSocket(socketId) {
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
    getConnectedStudentsCount() {
        return this.studentRegistry.size;
    }
    getConnectedStudents() {
        return Array.from(this.studentRegistry.values()).sort((a, b) => a.name.localeCompare(b.name));
    }
    removeStudent(sessionId) {
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
    async createPoll(input) {
        try {
            await this.completeExpiredPollIfNeeded();
            const current = await Poll_1.PollModel.findOne({ status: "active" }).sort({ startedAt: -1 });
            if (current) {
                throw new Error("Cannot create a new poll while another poll is active");
            }
            const now = new Date();
            const endsAt = new Date(now.getTime() + input.durationSeconds * 1000);
            const expectedRespondentIds = Array.from(this.studentRegistry.keys());
            const pollDoc = await Poll_1.PollModel.create({
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
        }
        catch (error) {
            if (error instanceof mongoose_1.default.Error) {
                throw new Error("Database unavailable while creating poll");
            }
            throw new Error(sanitizeError(error));
        }
    }
    async submitVote(input) {
        try {
            await this.completeExpiredPollIfNeeded();
            const poll = await Poll_1.PollModel.findById(input.pollId);
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
            const existingVote = await Vote_1.VoteModel.findOne({
                pollId: input.pollId,
                studentSessionId: input.studentSessionId
            });
            if (existingVote) {
                throw new Error("You have already voted for this poll");
            }
            await Vote_1.VoteModel.create({
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
        }
        catch (error) {
            if (error instanceof mongoose_1.default.Error) {
                if (error.message.includes("duplicate key")) {
                    throw new Error("You have already voted for this poll");
                }
                throw new Error("Database unavailable while submitting vote");
            }
            throw new Error(sanitizeError(error));
        }
    }
    async getCurrentState(studentSessionId) {
        await this.completeExpiredPollIfNeeded();
        const active = await Poll_1.PollModel.findOne({ status: "active" }).sort({ startedAt: -1 });
        const completed = await Poll_1.PollModel.findOne({ status: "completed" }).sort({ endedAt: -1, startedAt: -1 });
        let studentVoteOptionId = null;
        if (active && studentSessionId) {
            const vote = await Vote_1.VoteModel.findOne({
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
    async getHistory() {
        try {
            await this.completeExpiredPollIfNeeded();
            const polls = await Poll_1.PollModel.find({ status: "completed" }).sort({ startedAt: -1 }).limit(30);
            return Promise.all(polls.map((poll) => this.getPollResult(poll._id.toString())));
        }
        catch (error) {
            if (error instanceof mongoose_1.default.Error) {
                throw new Error("Database unavailable while loading poll history");
            }
            throw new Error(sanitizeError(error));
        }
    }
    async getPollResult(pollId) {
        const poll = await Poll_1.PollModel.findById(pollId);
        if (!poll) {
            throw new Error("Poll not found");
        }
        const votes = await Vote_1.VoteModel.find({ pollId: poll._id.toString() });
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
    async completeExpiredPollIfNeeded() {
        const active = await Poll_1.PollModel.findOne({ status: "active" }).sort({ startedAt: -1 });
        if (!active) {
            return;
        }
        if (active.endsAt.getTime() <= Date.now()) {
            const result = await this.completePoll(active._id.toString());
            this.events.onPollCompleted(result);
        }
    }
    async completeIfAllExpectedStudentsAnswered(pollId) {
        const poll = await Poll_1.PollModel.findById(pollId);
        if (!poll || poll.status !== "active") {
            return null;
        }
        if (poll.expectedRespondentIds.length === 0) {
            return null;
        }
        const count = await Vote_1.VoteModel.countDocuments({ pollId });
        if (count >= poll.expectedRespondentIds.length) {
            const result = await this.completePoll(pollId);
            return result;
        }
        return null;
    }
    schedulePollCompletion(pollId, endsAt) {
        const delay = Math.max(0, endsAt.getTime() - Date.now());
        const existing = schedulerMap.get(pollId);
        if (existing) {
            clearTimeout(existing);
        }
        const timer = setTimeout(async () => {
            try {
                const result = await this.completePoll(pollId);
                this.events.onPollCompleted(result);
            }
            catch {
                return;
            }
        }, delay);
        schedulerMap.set(pollId, timer);
    }
    async completePoll(pollId) {
        const poll = await Poll_1.PollModel.findById(pollId);
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
exports.PollService = PollService;
