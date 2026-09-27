import { useState } from "react";

interface Props {
  label: string;
  // For buttons whose label is a sign rather than words, so they keep a name.
  ariaLabel?: string;
  // Shown for a moment after the action goes through.
  doneLabel?: string;
  disabled?: boolean;
  onAction: () => Promise<unknown>;
}

type Status = "idle" | "running" | "done" | "failed";

const DONE_FOR_MS = 2500;

// Every button of the site goes through here, so pressing one always looks the
// same: out of reach while the request travels, a word when it went through, the
// reason next to it when it did not.
export function ActionButton({
  label,
  ariaLabel,
  doneLabel = "Done",
  disabled = false,
  onAction,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState<string | null>(null);

  async function run(): Promise<void> {
    setStatus("running");
    setReason(null);
    try {
      await onAction();
      setStatus("done");
      window.setTimeout(() => {
        setStatus((current) => (current === "done" ? "idle" : current));
      }, DONE_FOR_MS);
    } catch (e: unknown) {
      setStatus("failed");
      setReason(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <button
        aria-label={ariaLabel}
        disabled={disabled || status === "running"}
        onClick={() => void run()}
      >
        {status === "running" ? `${label}...` : label}
      </button>
      {status === "done" && <span className="tag">{doneLabel}</span>}
      {status === "failed" && (
        <span className="tag" role="alert">
          {reason}
        </span>
      )}
    </>
  );
}
