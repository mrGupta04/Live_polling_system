"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollModel = void 0;
const mongoose_1 = require("mongoose");
const PollOptionSchema = new mongoose_1.Schema({
    id: { type: String, required: true },
    text: { type: String, required: true }
}, { _id: false });
const PollSchema = new mongoose_1.Schema({
    question: { type: String, required: true, trim: true },
    options: { type: [PollOptionSchema], required: true },
    durationSeconds: { type: Number, required: true, min: 5, max: 60 },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["active", "completed"], required: true, index: true },
    expectedRespondentIds: { type: [String], default: [] }
}, { timestamps: true });
exports.PollModel = (0, mongoose_1.model)("Poll", PollSchema);
