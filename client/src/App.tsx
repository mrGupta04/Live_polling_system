import { useState } from "react";
import { TeacherPage } from "./pages/TeacherPage";
import { StudentPage } from "./pages/StudentPage";
import { Persona } from "./types";
import { useSocket } from "./hooks/useSocket";
import { BrandPill } from "./components/BrandPill";

function PersonaSelect({ onSelect }: { onSelect: (value: Persona) => void }) {
  const [selected, setSelected] = useState<Persona>("student");

  return (
    <main className="onboarding-screen">
      <section className="onboarding-card">
        <BrandPill />

        <h1 className="onboarding-title">
          Welcome to the <strong>Live Polling System</strong>
        </h1>
        <p className="onboarding-subtitle">
          Please select the role that best describes you to begin using the live polling system
        </p>

        <div className="role-grid">
          <button
            type="button"
            className={selected === "student" ? "role-card selected" : "role-card"}
            onClick={() => setSelected("student")}
          >
            <h3>I’m a Student</h3>
            <p>Submit answers and view live poll results in real-time.</p>
          </button>

          <button
            type="button"
            className={selected === "teacher" ? "role-card selected" : "role-card"}
            onClick={() => setSelected("teacher")}
          >
            <h3>I’m a Teacher</h3>
            <p>Submit answers and view live poll results in real-time.</p>
          </button>
        </div>

        <button className="continue-btn" onClick={() => onSelect(selected)}>
          Continue
        </button>
      </section>
    </main>
  );
}

export default function App() {
  const [persona, setPersona] = useState<Persona | null>(null);
  const { socket, connected } = useSocket();

  if (!persona) {
    return <PersonaSelect onSelect={setPersona} />;
  }

  return persona === "teacher" ? <TeacherPage socket={socket} connected={connected} /> : <StudentPage socket={socket} connected={connected} />;
}
