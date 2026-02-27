import { useEffect, useMemo, useState } from "react";
import { Socket } from "socket.io-client";
import { Poll } from "../types";
import { PollResults } from "../components/PollResults";
import { usePollTimer } from "../hooks/usePollTimer";
import { fetchPollState } from "../api";
import { BrandPill } from "../components/BrandPill";
import { FloatingPanel } from "../components/FloatingPanel";

interface StudentPageProps {
  socket: Socket;
  connected: boolean;
}

function getTabSessionId() {
  const existing = sessionStorage.getItem("student_session_id");
  if (existing) return existing;
  const next = Math.random().toString(36).slice(2, 12);
  sessionStorage.setItem("student_session_id", next);
  return next;
}

export function StudentPage({ socket, connected }: StudentPageProps) {
  const [name, setName] = useState(sessionStorage.getItem("student_name") || "");
  const [registered, setRegistered] = useState(Boolean(sessionStorage.getItem("student_name")));
  const [initializing, setInitializing] = useState(true);
  const [kickedOut, setKickedOut] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [activePoll, setActivePoll] = useState<Poll | null>(null);
  const [latestCompletedPoll, setLatestCompletedPoll] = useState<Poll | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverTimeMs, setServerTimeMs] = useState<number | null>(Date.now());

  const sessionId = useMemo(() => getTabSessionId(), []);
  const remaining = usePollTimer(activePoll, serverTimeMs);

  const handleKicked = (message: string) => {
    sessionStorage.removeItem("student_name");
    sessionStorage.removeItem("student_session_id");
    setError(message);
    setRegistered(false);
    setKickedOut(true);
  };

  const applyRecoveredState = (state: { activePoll: Poll | null; latestCompletedPoll: Poll | null; studentVoteOptionId?: string | null }) => {
    setActivePoll(state.activePoll);
    setLatestCompletedPoll(state.latestCompletedPoll);

    if (state.activePoll && state.studentVoteOptionId) {
      setSubmitted(true);
      setSelectedOptionId(state.studentVoteOptionId);
      return;
    }

    if (!state.activePoll) {
      setSelectedOptionId(null);
      setSubmitted(false);
    }
  };

  useEffect(() => {
    const restore = async () => {
      const storedName = sessionStorage.getItem("student_name");
      if (!storedName) {
        setRegistered(false);
        setInitializing(false);
        return;
      }

      try {
        const state = await fetchPollState();
        applyRecoveredState(state);
        const shouldResumeSession = Boolean(state.activePoll);
        setRegistered(shouldResumeSession);
      } catch {
        setRegistered(false);
      } finally {
        setInitializing(false);
      }
    };

    restore();
  }, []);

  useEffect(() => {
    const onCreated = (payload: { poll: Poll; serverTime: number }) => {
      setActivePoll(payload.poll);
      setServerTimeMs(payload.serverTime);
      setSelectedOptionId(null);
      setSubmitted(false);
    };
    const onUpdated = (payload: { poll: Poll; serverTime: number }) => {
      setActivePoll(payload.poll);
      setServerTimeMs(payload.serverTime);
    };
    const onCompleted = (payload: { poll: Poll; serverTime: number }) => {
      setActivePoll(null);
      setLatestCompletedPoll(payload.poll);
      setServerTimeMs(payload.serverTime);
    };

    socket.on("poll:created", onCreated);
    socket.on("poll:updated", onUpdated);
    socket.on("poll:completed", onCompleted);

    const onKicked = (payload: { message?: string; sessionId?: string }, ack?: () => void) => {
      if (payload?.sessionId && payload.sessionId !== sessionId) {
        ack?.();
        return;
      }
      handleKicked(payload?.message || "You were removed by the teacher");
      ack?.();
    };
    socket.on("room:kicked", onKicked);

    return () => {
      socket.off("poll:created", onCreated);
      socket.off("poll:updated", onUpdated);
      socket.off("poll:completed", onCompleted);
      socket.off("room:kicked", onKicked);
    };
  }, [socket]);

  useEffect(() => {
    if (!registered || !connected) {
      return;
    }

    socket.emit("student:register", { sessionId, name: name.trim() }, (response: any) => {
      if (!response?.ok) {
        if (String(response?.message || "").toLowerCase().includes("removed")) {
          handleKicked(response?.message || "You were removed by the teacher");
        }
        return;
      }

      if (!response.state) {
        return;
      }

      applyRecoveredState(response.state);
      setServerTimeMs(response.serverTime);
      setError(null);
    });
  }, [connected, name, registered, sessionId, socket]);

  const register = () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    if (!connected) {
      socket.connect();
      setError("Connecting to server... please wait");
    }

    setRegistering(true);

    let resolved = false;
    const ackTimeout = window.setTimeout(() => {
      if (resolved) {
        return;
      }
      setRegistering(false);
      setError("Server did not respond. Please try again");
    }, 5000);

    socket.emit("student:register", { sessionId, name: name.trim() }, (response: any) => {
      resolved = true;
      window.clearTimeout(ackTimeout);
      setRegistering(false);

      if (!response?.ok) {
        if (String(response?.message || "").toLowerCase().includes("removed")) {
          handleKicked(response?.message || "You were removed by the teacher");
          return;
        }
        setError(response?.message || "Registration failed");
        return;
      }

      sessionStorage.setItem("student_name", name.trim());
      setRegistered(true);
      setError(null);
      setServerTimeMs(response.serverTime);
      if (response.state) {
        applyRecoveredState(response.state);
        if (!response.state.activePoll) {
          setLatestCompletedPoll(null);
        }
      }
    });
  };

  const submitVote = () => {
    if (!activePoll || !selectedOptionId || submitted) return;

    setSubmitted(true);
    setError(null);

    socket.emit(
      "poll:vote",
      {
        pollId: activePoll.id,
        optionId: selectedOptionId,
        studentSessionId: sessionId,
        studentName: name
      },
      (response: any) => {
        if (!response?.ok) {
          if (response?.message?.includes("already voted")) {
            setSubmitted(true);
            setError(response?.message || "Could not submit vote");
            return;
          }
          setSubmitted(false);
          setError(response?.message || "Could not submit vote");
          return;
        }

        setActivePoll(response.poll);
        setServerTimeMs(response.serverTime);
      }
    );
  };

  if (kickedOut) {
    return (
      <main className="onboarding-screen kicked-screen">
        <section className="kicked-card">
          <BrandPill />
          <h1 className="kicked-title">You’ve been Kicked out !</h1>
          <p className="kicked-subtitle">Looks like the teacher had removed you from the poll system .Please Try again sometime.</p>
        </section>
      </main>
    );
  }

  if (initializing) {
    return (
      <main className="onboarding-screen">
        <section className="student-start-card">
          <BrandPill />
          <p className="status-text status-warn">Loading session...</p>
        </section>
      </main>
    );
  }

  if (!registered) {
    return (
      <main className="onboarding-screen">
        <section className="student-start-card">
          <BrandPill />
          <h1 className="setup-title centered">
            Let’s <strong>Get Started</strong>
          </h1>
          <p className="setup-subtitle centered">
            If you're a student, you'll be able to <strong>submit your answers</strong>, participate in live polls, and see how your responses compare with your classmates
          </p>

          {error && <p className="error">{error}</p>}
          <label className="field-label student-name-field">
            Enter your Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your Name" className="plain-input" />
          </label>
          <p className={connected ? "status-text status-ok" : "status-text status-warn"}>
            {connected ? "Connected" : "Reconnecting..."}
          </p>
          <button className="primary-pill" onClick={register} disabled={registering}>
            {registering ? "Please wait..." : "Continue"}
          </button>
        </section>
      </main>
    );
  }

  const showCompletedResults = Boolean(!activePoll && submitted && latestCompletedPoll);

  if (!activePoll && !showCompletedResults) {
    return (
      <main className="wait-screen">
        <div className="wait-body">
          <BrandPill />
          <div className="spinner-ring" />
          <h2 className="wait-title">Wait for the teacher to ask questions..</h2>
        </div>
        <FloatingPanel
          socket={socket}
          connected={connected}
          sessionId={sessionId}
          displayName={name}
          onKickedOut={handleKicked}
        />
      </main>
    );
  }

  const displayPoll = activePoll || (showCompletedResults ? latestCompletedPoll : null);
  if (!displayPoll) {
    return null;
  }

  return (
    <main className="dashboard-screen student-dashboard">
      <section className="results-stage">
        <div className="timer-line">
          <strong>Question 1</strong>
          {activePoll && <span className="timer-red">◔ 00:{String(Math.max(0, remaining)).padStart(2, "0")}</span>}
        </div>

        {error && <p className="error">{error}</p>}

        {activePoll && !submitted && remaining > 0 ? (
          <section className="poll-block">
            <div className="poll-board">
              <div className="poll-header-text">{displayPoll.question}</div>

              <div className="poll-list">
                {displayPoll.options.map((option, index) => (
                  <button
                    key={option.id}
                    className={selectedOptionId === option.id ? "poll-option-row vote selected" : "poll-option-row vote"}
                    onClick={() => setSelectedOptionId(option.id)}
                  >
                    <span className="poll-option-label">
                      <span className="option-num">{index + 1}</span>
                      {option.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <PollResults poll={displayPoll} showPercentages title="" />
        )}

        {activePoll && (
          <button className="primary-pill small submit-align" onClick={submitVote} disabled={!selectedOptionId || submitted || remaining === 0}>
            {submitted ? "Submitted" : "Submit"}
          </button>
        )}

        {(submitted || remaining === 0 || showCompletedResults) && <p className="wait-text">Wait for the teacher to ask a new question</p>}
      </section>

      <FloatingPanel
        socket={socket}
        connected={connected}
        sessionId={sessionId}
        displayName={name}
        onKickedOut={handleKicked}
      />
    </main>
  );
}
