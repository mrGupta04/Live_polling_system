"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoteModel = void 0;
const mongoose_1 = require("mongoose");
const VoteSchema = new mongoose_1.Schema({
    pollId: { type: String, required: true, index: true },
    optionId: { type: String, required: true },
    studentSessionId: { type: String, required: true },
    studentName: { type: String, required: true }
}, { timestamps: true });
VoteSchema.index({ pollId: 1, studentSessionId: 1 }, { unique: true });
exports.VoteModel = (0, mongoose_1.model)("Vote", VoteSchema);
