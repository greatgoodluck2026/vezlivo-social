import React, { useState } from "react";

export default function VipBadgeModal({ user, onClose }) {
  const [view, setView] = useState("benefits"); // "benefits" | "apply" | "submitted"
  const [reason, setReason] = useState("");
  const [promoLinks, setPromoLinks] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!user) return alert("Please sign in to apply.");
    if (!reason.trim()) return alert("Please tell us why you'd like to join.");

    const adminEmail = "greatgoodluckp@gmail.com";
    const username = user.username || user.displayName || "vezlivo_user";
    const uid = user.uid || "N/A";

    const subject = encodeURIComponent(`Vezlivo VIP Application - @${username}`);
    
    // Quick action links embedded inside the email body
    const approveLink = `mailto:${adminEmail}?subject=${encodeURIComponent(`Approved VIP: @${username}`)}&body=${encodeURIComponent(`Hello @${username},\n\nCongratulations! Your VIP application has been approved.\n\nUID: ${uid}`)}`;
    const rejectLink = `mailto:${adminEmail}?subject=${encodeURIComponent(`Rejected VIP: @${username}`)}&body=${encodeURIComponent(`Hello @${username},\n\nThank you for applying to be a Vezlivo VIP. Unfortunately, your application was not approved at this time.\n\nUID: ${uid}`)}`;

    const body = encodeURIComponent(
      `Hello Vezlivo Team,\n\nI would like to apply for the VIP Badge.\n\n` +
      `User Details:\n` +
      `- Username: @${username}\n` +
      `- Display Name: ${user.displayName || "Vezlivo Supporter"}\n` +
      `- User ID (UID): ${uid}\n\n` +
      `Reason for Applying:\n${reason.trim()}\n\n` +
      `Promotional Links / Social Posts:\n${promoLinks.trim() || "None provided"}\n\n` +
      `----------------------------------------\n` +
      `ADMIN QUICK ACTIONS (Tap to draft reply):\n` +
      `APPROVE LINK:\n${approveLink}\n\n` +
      `REJECT LINK:\n${rejectLink}\n` +
      `----------------------------------------\n\n` +
      `Thank you!`
    );

    // Triggers default email client without touching Firebase DB
    window.location.href = `mailto:${adminEmail}?subject=${subject}&body=${body}`;
    setView("submitted");
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>

        {view === "benefits" && (
          <div style={styles.content}>
            <div style={styles.headerCrown}>👑 VIP</div>
            <h2 style={styles.title}>Vezlivo VIP Badge</h2>
            <p style={styles.subtitle}>
              A Special Recognition for Our Valued Supporters!
            </p>

            <div style={styles.benefitList}>
              <div style={styles.benefitItem}>
                <span style={{ fontSize: "18px" }}>🥇</span>
                <div>
                  <strong>1. Special Recognition</strong>
                  <p style={styles.benefitText}>Your gold badge appears beside your username across Vezlivo.</p>
                </div>
              </div>

              <div style={styles.benefitItem}>
                <span style={{ fontSize: "18px" }}>💜</span>
                <div>
                  <strong>2. VIP Profile Border</strong>
                  <p style={styles.benefitText}>Stand out with a glowing VIP profile avatar border.</p>
                </div>
              </div>

              <div style={styles.benefitItem}>
                <span style={{ fontSize: "18px" }}>🚀</span>
                <div>
                  <strong>3. Early Access</strong>
                  <p style={styles.benefitText}>Get to try select new Vezlivo features before other users.</p>
                </div>
              </div>

              <div style={styles.benefitItem}>
                <span style={{ fontSize: "18px" }}>🎁</span>
                <div>
                  <strong>4. VIP Rewards</strong>
                  <p style={styles.benefitText}>Receive special gifts and community recognition.</p>
                </div>
              </div>

              <div style={styles.benefitItem}>
                <span style={{ fontSize: "18px" }}>📢</span>
                <div>
                  <strong>5. VIP Recognition</strong>
                  <p style={styles.benefitText}>Featured on official pages or in VIP supporter sections.</p>
                </div>
              </div>

              <div style={styles.benefitItem}>
                <span style={{ fontSize: "18px" }}>👑</span>
                <div>
                  <strong>6. VIP Community</strong>
                  <p style={styles.benefitText}>Join a special community to receive updates and share ideas.</p>
                </div>
              </div>
            </div>

            {user && (
              <button style={styles.goldButton} onClick={() => setView("apply")}>
                Become a VIP Supporter 🚀
              </button>
            )}
          </div>
        )}

        {view === "apply" && (
          <form style={styles.content} onSubmit={handleSubmit}>
            <h2 style={styles.title}>Apply for VIP Badge</h2>
            <p style={styles.subtitle}>
              Help promote Vezlivo and apply for recognition. Your application will be reviewed personally by our team.
            </p>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Why do you want to become a VIP?</label>
              <textarea
                style={styles.textarea}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell us how you have supported or promoted Vezlivo..."
                required
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Promotional Links / Social Posts (Optional)</label>
              <input
                style={styles.input}
                type="text"
                value={promoLinks}
                onChange={(e) => setPromoLinks(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <button type="submit" style={styles.goldButton}>
              Send Application via Email 🚀
            </button>
          </form>
        )}

        {view === "submitted" && (
          <div style={styles.content}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎉</div>
            <h2 style={styles.title}>Application Prepared!</h2>
            <p style={styles.subtitle}>
              Your email application draft has been launched. Once you hit send in your email app, our team will review it.
            </p>
            <button style={styles.goldButton} onClick={onClose}>
              Awesome! 👑
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    backdropFilter: "blur(8px)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  },
  modal: {
    position: "relative",
    width: "100%",
    maxWidth: "380px",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "linear-gradient(180deg, #2e1065 0%, #09090b 100%)",
    border: "1px solid #7c3aed",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 12px 40px rgba(124, 58, 237, 0.4)",
    color: "#ffffff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  closeBtn: {
    position: "absolute",
    top: "16px",
    right: "16px",
    background: "rgba(255,255,255,0.1)",
    border: "none",
    color: "#fff",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    cursor: "pointer",
    fontSize: "16px",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  headerCrown: {
    padding: "6px 16px",
    borderRadius: "20px",
    background: "linear-gradient(135deg, #f59e0b, #d97706)",
    fontSize: "14px",
    fontWeight: "800",
    color: "#000",
    marginBottom: "12px",
    boxShadow: "0 0 12px rgba(245, 158, 11, 0.6)",
  },
  title: {
    margin: "0 0 6px 0",
    fontSize: "20px",
    fontWeight: "800",
  },
  subtitle: {
    margin: "0 0 16px 0",
    fontSize: "12px",
    color: "#d8b4fe",
    lineHeight: "1.4",
  },
  benefitList: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginBottom: "20px",
    textAlign: "left",
  },
  benefitItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    fontSize: "13px",
  },
  benefitText: {
    margin: "2px 0 0 0",
    fontSize: "11px",
    color: "#a78bfa",
  },
  goldButton: {
    width: "100%",
    padding: "12px",
    border: "none",
    borderRadius: "20px",
    background: "linear-gradient(135deg, #f59e0b, #fbbf24)",
    color: "#000000",
    fontSize: "14px",
    fontWeight: "800",
    cursor: "pointer",
    boxShadow: "0 4px 15px rgba(245, 158, 11, 0.4)",
  },
  fieldGroup: {
    width: "100%",
    textAlign: "left",
    marginBottom: "14px",
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: "700",
    color: "#d8b4fe",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #7c3aed",
    backgroundColor: "#18181b",
    color: "#fff",
    fontSize: "13px",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #7c3aed",
    backgroundColor: "#18181b",
    color: "#fff",
    fontSize: "13px",
    minHeight: "75px",
  },
};