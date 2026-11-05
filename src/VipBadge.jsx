import React from "react";

export default function VipBadge({ onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        padding: "2px 6px",
        borderRadius: "10px",
        background: "linear-gradient(135deg, #f59e0b, #d97706)",
        color: "#000000",
        fontSize: "10px",
        fontWeight: "900",
        cursor: "pointer",
        marginLeft: "6px",
        boxShadow: "0 0 8px rgba(245, 158, 11, 0.5)",
        verticalAlign: "middle",
      }}
      title="Vezlivo VIP Supporter"
    >
      👑 VIP
    </span>
  );
}