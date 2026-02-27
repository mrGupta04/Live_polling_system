import { Poll } from "../types";

interface PollResultsProps {
  poll: Poll;
  title?: string;
  showPercentages?: boolean;
}

export function PollResults({ poll, title = "Question", showPercentages = true }: PollResultsProps) {
  return (
    <section className="poll-block">
      {title && <h3 className="section-title">{title}</h3>}

      <div className="poll-board">
        <div className="poll-header-text">{poll.question}</div>

        <div className="poll-list">
          {poll.options.map((option, index) => (
            <div key={option.id} className="poll-option-row result">
              <div className="poll-option-fill" style={{ width: `${option.percentage}%` }} />
              <div className="poll-option-content">
                <span className="poll-option-label">
                  <span className="option-num">{index + 1}</span>
                  {option.text}
                </span>
                {showPercentages && <span className="poll-option-score">{option.percentage}%</span>}
            </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
