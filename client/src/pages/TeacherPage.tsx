import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPoll, fetchPollHistory, fetchPollState } from "../api";
import { Poll } from "../types";
import { PollResults } from "../components/PollResults";
import { usePollTimer } from "../hooks/usePollTimer";
import { Socket } from "socket.io-client";
import { BrandPill } from "../components/BrandPill";
import { FloatingPanel } from "../components/FloatingPanel";

interface TeacherPageProps {
  socket: Socket;
  connected: boolean;
}

function makeOptionId() {
  return Math.random().toString(36).slice(2, 10);
}

export function TeacherPage({ socket, connected }: TeacherPageProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correctFlags, setCorrectFlags] = useState([true, false]);
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [activePoll, setActivePoll] = useState<Poll | null>(null);
  const [latestCompletedPoll, setLatestCompletedPoll] = useState<Poll | null>(null);
  const [history, setHistory] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverTimeMs, setServerTimeMs] = useState<number | null>(Date.now());
  const [showHistory, setShowHistory] = useState(false);

  const remaining = usePollTimer(activePoll, serverTimeMs);

  const canCreate = useMemo(() => !activePoll, [activePoll]);

  useEffect(() => {
    const load = async () => {
      try {
        const state = await fetchPollState();
        setActivePoll(state.activePoll);
        setLatestCompletedPoll(state.activePoll ? state.latestCompletedPoll : null);
        const historyData = await fetchPollHistory();
        setHistory(historyData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize");
      }
    };
    load();
  }, []);

  useEffect(() => {
    const onCreated = (payload: { poll: Poll; serverTime: number }) => {
      setActivePoll(payload.poll);
      setServerTimeMs(payload.serverTime);
      setError(null);
    };
    const onUpdated = (payload: { poll: Poll; serverTime: number }) => {
      setActivePoll(payload.poll);
      setServerTimeMs(payload.serverTime);
    };
    const onCompleted = async (payload: { poll: Poll; serverTime: number }) => {
      setActivePoll(null);
      setLatestCompletedPoll(payload.poll);
      setServerTimeMs(payload.serverTime);
      try {
        const historyData = await fetchPollHistory();
        setHistory(historyData);
      } catch {
        return;
      }
    };

    socket.on("poll:created", onCreated);
    socket.on("poll:updated", onUpdated);
    socket.on("poll:completed", onCompleted);

    return () => {
      socket.off("poll:created", onCreated);
      socket.off("poll:updated", onUpdated);
      socket.off("poll:completed", onCompleted);
    };
  }, [socket]);

  const onCreatePoll = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      setError("A poll is currently active");
      return;
    }

    const cleanedOptions = options.map((opt) => opt.trim()).filter(Boolean);
    if (question.trim().length < 3 || cleanedOptions.length < 2) {
      setError("Please provide a valid question and at least 2 options");
      return;
    }

    setLoading(true);
    setError(null);

    const optimisticPoll: Poll = {
      id: `optimistic-${Date.now()}`,
      question,
      status: "active",
      durationSeconds,
      startedAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
      totalVotes: 0,
      options: cleanedOptions.map((text) => ({ id: makeOptionId(), text, votes: 0, percentage: 0 }))
    };

    setActivePoll(optimisticPoll);

    try {
      const poll = await createPoll({
        question: question.trim(),
        options: cleanedOptions.map((text) => ({ id: makeOptionId(), text })),
        durationSeconds
      });
      setActivePoll(poll);
      setQuestion("");
      setOptions(["", ""]);
      setCorrectFlags([true, false]);
    } catch (err) {
      setActivePoll(null);
      setError(err instanceof Error ? err.message : "Poll creation failed");
    } finally {
      setLoading(false);
    }
  };

  if (!activePoll && !latestCompletedPoll) {
    return (
      <main className="dashboard-screen teacher-create-mode">
        <section className="teacher-setup-shell">
          <BrandPill />
          <h1 className="setup-title">Let’s Get Started</h1>
          <p className="setup-subtitle">
            you'll have the ability to create and manage polls, ask questions, and monitor your students' responses in real-time.
          </p>

          {error && <p className="error">{error}</p>}

          <form id="teacher-create-form" onSubmit={onCreatePoll} className="teacher-form-grid">
            <div className="question-head-row">
              <label className="field-label">Enter your question</label>
              <select
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(Number(event.target.value))}
                className="duration-select"
              >
                <option value={60}>60 seconds</option>
                <option value={45}>45 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={15}>15 seconds</option>
              </select>
            </div>

            <div className="question-input-box">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value.slice(0, 100))}
                placeholder="Enter your question"
                className="question-textarea"
              />
              <span className="char-count">{question.length}/100</span>
            </div>

            <div className="options-area">
              <div className="option-headings">
                <span>Edit Options</span>
                <span>Is it Correct?</span>
              </div>

              {options.map((option, index) => (
                <div key={index} className="option-edit-row">
                  <div className="option-edit-input-wrap">
                    <span className="small-index">{index + 1}</span>
                    <input
                      className="option-edit-input"
                      value={option}
                      onChange={(event) => {
                        const next = [...options];
                        next[index] = event.target.value;
                        setOptions(next);
                      }}
                      placeholder={`Option ${index + 1}`}
                    />
                  </div>

                  <div className="correct-toggle">
                    <label>
                      <input
                        type="radio"
                        checked={Boolean(correctFlags[index])}
                        onChange={() => {
                          const next = [...correctFlags];
                          next[index] = true;
                          setCorrectFlags(next);
                        }}
                      />
                      Yes
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={!correctFlags[index]}
                        onChange={() => {
                          const next = [...correctFlags];
                          next[index] = false;
                          setCorrectFlags(next);
                        }}
                      />
                      No
                    </label>
                  </div>
                </div>
              ))}

              {options.length < 6 && (
                <button
                  type="button"
                  className="add-option-link"
                  onClick={() => {
                    setOptions((prev) => [...prev, ""]);
                    setCorrectFlags((prev) => [...prev, false]);
                  }}
                >
                  + Add More option
                </button>
              )}
            </div>

          </form>
        </section>

        <footer className="teacher-create-footer">
          <button
            type="submit"
            form="teacher-create-form"
            className="primary-pill ask-btn"
            disabled={!canCreate || loading}
          >
            {loading ? "Creating..." : "Ask Question"}
          </button>
        </footer>
      </main>
    );
  }

  const displayPoll = activePoll || latestCompletedPoll;
  if (!displayPoll) {
    return null;
  }

  if (showHistory) {
    return (
      <main className="dashboard-screen teacher-history-view">
        <section className="teacher-history-shell">
          <h1 className="history-heading">
            View <strong>Poll History</strong>
          </h1>

          {history.length === 0 ? (
            <p className="muted">No historical polls yet.</p>
          ) : (
            <div className="teacher-history-list">
              {history.map((poll, index) => (
                <PollResults key={poll.id} poll={poll} title={`Question ${index + 1}`} />
              ))}
            </div>
          )}
        </section>
        <FloatingPanel socket={socket} teacherMode connected={connected} displayName="Teacher" />
      </main>
    );
  }

  return (
    <main className="dashboard-screen teacher-dashboard">
      <div className="screen-top-actions">
        <button className="primary-pill small" onClick={() => setShowHistory((value) => !value)}>
          👁 View Poll history
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="results-stage">
        {activePoll && (
          <div className="timer-line">
            <strong>Question 1</strong>
            <span className="timer-red">◔ 00:{String(Math.max(0, remaining)).padStart(2, "0")}</span>
          </div>
        )}

        <PollResults poll={displayPoll} />

        {!activePoll && (
          <button className="primary-pill small submit-align" onClick={() => setLatestCompletedPoll(null)}>
            + Ask a new question
          </button>
        )}
      </section>

      {!activePoll && latestCompletedPoll && !showHistory && <p className="wait-text">Wait for the teacher to ask a new question</p>}
      <FloatingPanel socket={socket} teacherMode connected={connected} displayName="Teacher" />
    </main>
  );
}
