import { Schema, model } from "mongoose";

export interface PollOption {
  id: string;
  text: string;
}

export interface PollDocument {
  _id: string;
  question: string;
  options: PollOption[];
  durationSeconds: number;
  startedAt: Date;
  endsAt: Date;
  status: "active" | "completed";
  expectedRespondentIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const PollOptionSchema = new Schema<PollOption>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true }
  },
  { _id: false }
);

const PollSchema = new Schema<PollDocument>(
  {
    question: { type: String, required: true, trim: true },
    options: { type: [PollOptionSchema], required: true },
    durationSeconds: { type: Number, required: true, min: 5, max: 60 },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["active", "completed"], required: true, index: true },
    expectedRespondentIds: { type: [String], default: [] }
  },
  { timestamps: true }
);

export const PollModel = model<PollDocument>("Poll", PollSchema);
