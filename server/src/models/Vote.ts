import { Schema, model } from "mongoose";

export interface VoteDocument {
  _id: string;
  pollId: string;
  optionId: string;
  studentSessionId: string;
  studentName: string;
  createdAt: Date;
  updatedAt: Date;
}

const VoteSchema = new Schema<VoteDocument>(
  {
    pollId: { type: String, required: true, index: true },
    optionId: { type: String, required: true },
    studentSessionId: { type: String, required: true },
    studentName: { type: String, required: true }
  },
  { timestamps: true }
);

VoteSchema.index({ pollId: 1, studentSessionId: 1 }, { unique: true });

export const VoteModel = model<VoteDocument>("Vote", VoteSchema);
