import { FormEvent, useEffect, useMemo, useState } from "react";
import { Socket } from "socket.io-client";
import { ChatMessage, Participant } from "../types";

interface FloatingPanelProps {
  socket: Socket;
  teacherMode?: boolean;
  connected: boolean;
  sessionId?: string;
  displayName?: string;
  onKickedOut?: (message: string) => void;
}

export function FloatingPanel({ socket, teacherMode = false, connected, sessionId, displayName, onKickedOut }: FloatingPanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "participants">(teacherMode ? "participants" : "chat");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const myRole = useMemo<"teacher" | "student">(() => (teacherMode ? "teacher" : "student"), [teacherMode]);

  useEffect(() => {
    if (!connected) {
      return;
    }

    if (teacherMode) {
      socket.emit("teacher:register", undefined, () => undefined);
    }

    socket.emit("room:participants", undefined, (response: any) => {
      if (!response?.ok) {
        return;
      }
      setParticipants(response.participants || []);
      setMessages(response.messages || []);
    });

    const onParticipantsUpdate = (payload: { participants: Participant[] }) => {
      setParticipants(payload.participants || []);
    };

    const onChatNew = (message: ChatMessage) => {
      setMessages((prev) => [...prev, message].slice(-80));
    };

    const onKickedHandler = (payload: { message?: string }) => {
      onKickedOut?.(payload?.message || "You were removed by the teacher");
    };

    socket.on("participants:update", onParticipantsUpdate);
    socket.on("chat:new", onChatNew);
    socket.on("room:kicked", onKickedHandler);

    return () => {
      socket.off("participants:update", onParticipantsUpdate);
      socket.off("chat:new", onChatNew);
      socket.off("room:kicked", onKickedHandler);
    };
  }, [connected, onKickedOut, socket, teacherMode]);

  const removeParticipant = (targetSessionId: string) => {
    socket.emit("teacher:kick", { sessionId: targetSessionId }, (response: any) => {
      if (!response?.ok) {
        setError(response?.message || "Unable to remove student");
      }
    });
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!messageText.trim() || !connected) {
      return;
    }

    const text = messageText.trim();
    setMessageText("");
    setError(null);

    socket.emit(
      "chat:send",
      {
        text,
        sessionId,
        senderName: displayName || (teacherMode ? "Teacher" : "Student"),
        role: myRole
      },
      (response: any) => {
        if (!response?.ok) {
          setError(response?.message || "Unable to send message");
        }
      }
    );
  };

  return (
    <>
      {open && (
        <aside className="floating-panel">
          <div className="panel-tabs">
            <button className={tab === "chat" ? "panel-tab active" : "panel-tab"} onClick={() => setTab("chat")}>
              Chat
            </button>
            <button
              className={tab === "participants" ? "panel-tab active" : "panel-tab"}
              onClick={() => setTab("participants")}
            >
              Participants
            </button>
          </div>

          {tab === "chat" ? (
            <div className="panel-chat">
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <p className="muted">No messages yet.</p>
                ) : (
                  messages.map((message) => {
                    const isMine = teacherMode ? message.role === "teacher" : message.senderName === displayName;
                    return (
                      <div key={message.id}>
                        <p className={isMine ? "chat-name right" : "chat-name"}>{message.senderName}</p>
                        <div className={isMine ? "chat-bubble right" : "chat-bubble left"}>{message.text}</div>
                      </div>
                    );
                  })
                )}
              </div>

              <form className="chat-compose" onSubmit={sendMessage}>
                <input
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  className="chat-input"
                  placeholder="Type a message"
                  maxLength={300}
                />
                <button type="submit" className="chat-send-btn" disabled={!connected || !messageText.trim()}>
                  Send
                </button>
              </form>
            </div>
          ) : (
            <div className={teacherMode ? "panel-participants with-action" : "panel-participants"}>
              <div className="participant-header">
                <span>Name</span>
                {teacherMode && <span>Action</span>}
              </div>
              {participants.length === 0 ? (
                <p className="muted">No participants yet</p>
              ) : (
                participants.map((participant) => (
                  <div key={participant.sessionId} className="participant-row">
                    <span>{participant.name}</span>
                    {teacherMode && (
                      <button className="kick-btn" onClick={() => removeParticipant(participant.sessionId)}>
                        Kick out
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {error && <p className="error">{error}</p>}
        </aside>
      )}

      <button className="chat-fab" onClick={() => setOpen((value) => !value)} aria-label="Open chat panel">
        💬
      </button>
    </>
  );
}
