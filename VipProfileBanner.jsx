import React, { useState } from "react";
import VipBadgeModal from "./VipBadgeModal.jsx";

export default function VipProfileBanner({ user }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div style={styles.bannerCard} onClick={() => setShowModal(true)}>
        <div style={styles.leftBadge}>
          <span style={{ fontSize: "28px" }}>👑</span>
          <div style={styles.vipText}>VIP</div>
        </div>
        <div style={styles.infoArea}>
          <h4 style={styles.title}>VIP Badge Benefits</h4>
          <ul style={styles.list}>
            <li>Stand out with a VIP badge</li>
            <li>Get exclusive features</li>
            <li>Enjoy priority support</li>
            <li>Earn special rewards</li>
            <li>Be recognised as a Vezlivo supporter</li>
          </ul>
        </div>
        <div style={styles.rightText}>
          <span style={styles.tagline}>Let's grow<br/>Vezlivo together!</span>
        </div>
      </div>

      {showModal && <VipBadgeModal user={user} onClose={() => setShowModal(false)} />}
    </>
  );
}

const styles = {
  bannerCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "linear-gradient(135deg, #180536 0%, #09090b 100%)",
    border: "2px solid #f59e0b",
    borderRadius: "20px",
    padding: "14px 16px",
    margin: "12px 16px",
    cursor: "pointer",
    boxShadow: "0 0 20px rgba(245, 158, 11, 0.4), inset 0 0 10px rgba(124, 58, 237, 0.3)",
    color: "#ffffff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  leftBadge: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 12px rgba(245, 158, 11, 0.7)",
    border: "1px solid #fde047",
    flexShrink: 0,
  },
  vipText: {
    fontSize: "10px",
    fontWeight: "900",
    color: "#000",
    letterSpacing: "0.5px",
    marginTop: "-4px",
  },
  infoArea: {
    flex: 1,
    marginLeft: "12px",
  },
  title: {
    margin: "0 0 4px 0",
    fontSize: "14px",
    fontWeight: "800",
    color: "#f59e0b",
  },
  list: {
    margin: 0,
    paddingLeft: "14px",
    fontSize: "10px",
    color: "#d1d5db",
    lineHeight: "1.3",
  },
  rightText: {
    textAlign: "right",
    flexShrink: 0,
    marginLeft: "8px",
  },
  tagline: {
    fontStyle: "italic",
    fontSize: "11px",
    color: "#fbbf24",
    fontFamily: "Georgia, serif",
    lineHeight: "1.2",
    display: "block",
  },
};