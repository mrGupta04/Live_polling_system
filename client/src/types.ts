export interface PollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
}

export interface Poll {
  id: string;
  question: string;
  status: "active" | "completed";
  durationSeconds: number;
  startedAt: string;
  endsAt: string;
  totalVotes: number;
  options: PollOption[];
}

export interface PollStateResponse {
  activePoll: Poll | null;
  latestCompletedPoll: Poll | null;
  studentVoteOptionId?: string | null;
}

export interface Participant {
  sessionId: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderName: string;
  role: "teacher" | "student";
  createdAt: number;
}

export type Persona = "teacher" | "student";
