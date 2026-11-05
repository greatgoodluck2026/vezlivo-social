import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { push, ref, update } from "firebase/database";
import { auth, database as db } from "./firebase.js";

const REPORT_REASONS = [
  "Spam",
  "Harassment or bullying",
  "Hate or abusive behavior",
  "Inappropriate content",
  "Sexual or age-restricted content",
  "Violence or dangerous content",
  "Scam or fraud",
  "Other"
];

export default function Report({
  type = "post",
  targetId,
  targetOwnerId,
  commentId = "",
  onClose
}) {
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedReason, setSelectedReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });

    return () => unsubscribe();
  }, []);

  const sendReport = async () => {
    if (!currentUser) {
      alert("Please log in first.");
      return;
    }

    if (!targetId) {
      alert("This item cannot be reported right now.");
      return;
    }

    if (!selectedReason) {
      alert("Please select a reason for your report.");
      return;
    }

    setSending(true);

    try {
      const reportsRef = ref(db, "reports");
      const newReportRef = push(reportsRef);

      const reportData = {
        reporterId: currentUser.uid,
        targetId,
        targetOwnerId: targetOwnerId || "",
        type,
        commentId: commentId || "",
        reason: selectedReason,
        details: details.trim().slice(0, 500),
        status: "pending",
        createdAt: Date.now()
      };

      await update(newReportRef, reportData);

      setSubmitted(true);
    } catch (error) {
      console.error("Could not submit report:", error);
      alert("Could not submit the report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <div style={styles.overlay}>
        <div style={styles.panel}>
          <div style={styles.successIcon}>✓</div>
          <h2 style={styles.title}>Report submitted</h2>
          <p style={styles.message}>
            Thanks for helping keep Vezlivo safe. Your report has been
            submitted for review.
          </p>

          <button
            type="button"
            onClick={onClose}
            style={styles.primaryButton}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Report</h2>
            <p style={styles.subtitle}>
              Help us keep Vezlivo safe and respectful.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={styles.closeButton}
            disabled={sending}
          >
            ×
          </button>
        </div>

        <div style={styles.content}>
          <strong style={styles.question}>
            Why are you reporting this?
          </strong>

          <div style={styles.reasonList}>
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setSelectedReason(reason)}
                disabled={sending}
                style={{
                  ...styles.reasonButton,
                  ...(selectedReason === reason
                    ? styles.selectedReasonButton
                    : {})
                }}
              >
                <span
                  style={{
                    ...styles.radio,
                    ...(selectedReason === reason
                      ? styles.selectedRadio
                      : {})
                  }}
                >
                  {selectedReason === reason ? "✓" : ""}
                </span>

                <span>{reason}</span>
              </button>
            ))}
          </div>

          <label style={styles.detailsLabel}>
            Additional details (optional)
          </label>

          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={500}
            placeholder="Tell us anything else that may help..."
            disabled={sending}
            style={styles.textarea}
          />

          <div style={styles.characterCount}>
            {details.length}/500
          </div>
        </div>

        <div style={styles.footer}>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            style={styles.cancelButton}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={sendReport}
            disabled={sending || !selectedReason}
            style={{
              ...styles.primaryButton,
              ...(sending || !selectedReason
                ? styles.disabledButton
                : {})
            }}
          >
            {sending ? "Sending..." : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px",
    zIndex: 10000,
    boxSizing: "border-box"
  },

  panel: {
    width: "100%",
    maxWidth: "520px",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: "22px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
    boxSizing: "border-box"
  },

  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "15px",
    padding: "20px 20px 15px",
    borderBottom: "1px solid #eeeeee"
  },

  title: {
    margin: 0,
    fontSize: "22px",
    fontWeight: "800",
    color: "#171717"
  },

  subtitle: {
    margin: "5px 0 0",
    fontSize: "13px",
    lineHeight: "1.4",
    color: "#777777"
  },

  closeButton: {
    width: "38px",
    height: "38px",
    border: "none",
    borderRadius: "50%",
    background: "#f1f1f4",
    color: "#333333",
    fontSize: "26px",
    lineHeight: "1",
    cursor: "pointer",
    flexShrink: 0
  },

  content: {
    padding: "18px 20px"
  },

  question: {
    display: "block",
    marginBottom: "12px",
    color: "#222222",
    fontSize: "15px"
  },

  reasonList: {
    display: "flex",
    flexDirection: "column",
    gap: "7px"
  },

  reasonButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    border: "1px solid #e5e5e5",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#222222",
    padding: "12px",
    textAlign: "left",
    fontSize: "14px",
    cursor: "pointer",
    boxSizing: "border-box"
  },

  selectedReasonButton: {
    border: "1px solid #6c35ff",
    background: "#f5f1ff"
  },

  radio: {
    width: "20px",
    height: "20px",
    border: "2px solid #cfcfcf",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxSizing: "border-box",
    fontSize: "12px",
    fontWeight: "800"
  },

  selectedRadio: {
    border: "2px solid #6c35ff",
    background: "#6c35ff",
    color: "#ffffff"
  },

  detailsLabel: {
    display: "block",
    marginTop: "18px",
    marginBottom: "7px",
    fontSize: "13px",
    fontWeight: "700",
    color: "#333333"
  },

  textarea: {
    width: "100%",
    minHeight: "90px",
    resize: "vertical",
    border: "1px solid #dddddd",
    borderRadius: "12px",
    outline: "none",
    padding: "12px",
    fontSize: "14px",
    lineHeight: "1.4",
    fontFamily: "inherit",
    boxSizing: "border-box"
  },

  characterCount: {
    textAlign: "right",
    marginTop: "4px",
    color: "#999999",
    fontSize: "11px"
  },

  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "9px",
    padding: "14px 20px 20px",
    borderTop: "1px solid #eeeeee"
  },

  cancelButton: {
    height: "44px",
    border: "1px solid #dddddd",
    borderRadius: "22px",
    padding: "0 18px",
    background: "#ffffff",
    color: "#333333",
    fontWeight: "700",
    cursor: "pointer"
  },

  primaryButton: {
    height: "44px",
    border: "none",
    borderRadius: "22px",
    padding: "0 19px",
    background: "#6c35ff",
    color: "#ffffff",
    fontWeight: "700",
    cursor: "pointer"
  },

  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed"
  },

  successIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: "#6c35ff",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "34px",
    fontWeight: "800",
    margin: "30px auto 15px"
  },

  message: {
    margin: "8px 25px 25px",
    color: "#666666",
    fontSize: "14px",
    lineHeight: "1.5",
    textAlign: "center"
  }
};
