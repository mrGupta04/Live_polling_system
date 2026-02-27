import { API_BASE } from "./config";
import { Poll, PollStateResponse } from "./types";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || "Request failed");
  }
  return data;
}

export async function fetchPollState(): Promise<PollStateResponse> {
  const response = await fetch(`${API_BASE}/polls/state`);
  return parseResponse<PollStateResponse>(response);
}

export async function fetchPollHistory(): Promise<Poll[]> {
  const response = await fetch(`${API_BASE}/polls/history`);
  const data = await parseResponse<{ polls: Poll[] }>(response);
  return data.polls;
}

export async function createPoll(payload: {
  question: string;
  options: Array<{ id: string; text: string }>;
  durationSeconds: number;
}): Promise<Poll> {
  const response = await fetch(`${API_BASE}/polls/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await parseResponse<{ poll: Poll }>(response);
  return data.poll;
}
