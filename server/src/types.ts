export type PollStatus = "active" | "completed";

export interface StudentSession {
  sessionId: string;
  name: string;
}

export interface PollOptionInput {
  id: string;
  text: string;
}

export interface CreatePollInput {
  question: string;
  options: PollOptionInput[];
  durationSeconds: number;
}

export interface PollResultOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
}

export interface PollResult {
  id: string;
  question: string;
  status: PollStatus;
  durationSeconds: number;
  startedAt: string;
  endsAt: string;
  totalVotes: number;
  options: PollResultOption[];
}
