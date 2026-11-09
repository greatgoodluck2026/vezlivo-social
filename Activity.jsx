import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";

const API_URL = "https://vezlivo-api.vezlivo-api.workers.dev";

function timeAgo(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return new Date(value).toLocaleDateString();
}

function activityText(item) {
  const actor = item.actorName || "Someone";

  switch (item.type) {
    case "like":
      return `${actor} liked your video`;
    case "comment":
      return `${actor} commented on your video`;
    case "follow":
      return `${actor} followed you`;
    case "share":
      return `${actor} shared your video`;
    case "favorite":
      return `${actor} saved your video`;
    default:
      return `${actor} interacted with your account`;
  }
}

function activityIcon(type) {
  switch (type) {
    case "like":
      return "♥";
    case "comment":
      return "💬";
    case "follow":
      return "👤";
    case "share":
      return "↗";
    case "favorite":
      return "★";
    default:
      return "🔔";
  }
}

export default function Activity({ onBack }) {
  const [user, setUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setActivities([]);
      setLoading(false);
      return;
    }

    async function fetchActivities() {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${API_URL}/api/activities?uid=${user.uid}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to load activities");
        }

        const data = await response.json();
        setActivities(data.activities || []);
      } catch (error) {
        console.error("Activity loading error:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchActivities();
  }, [user]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button
          type="button"
          onClick={onBack}
          style={styles.backButton}
          aria-label="Back"
        >
          ‹
        </button>

        <h1 style={styles.title}>Activity</h1>

        <div style={styles.headerSpacer} />
      </header>

      <main style={styles.content}>
        {loading ? (
          <div style={styles.center}>
            <span>Loading activity...</span>
          </div>
        ) : activities.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>🔔</div>
            <h2>No activity yet</h2>
            <p>
              When people like, comment on, or follow you,
              their activity will appear here.
            </p>
          </div>
        ) : (
          <div style={styles.list}>
            {activities.map((item) => (
              <div
                key={item.id}
                style={{
                  ...styles.row,
                  ...(item.read === false ? styles.unread : {}),
                }}
              >
                <div style={styles.icon}>
                  {activityIcon(item.type)}
                </div>

                <div style={styles.body}>
                  <div style={styles.message}>
                    {activityText(item)}
                  </div>

                  {item.commentText && (
                    <div style={styles.comment}>
                      “{item.commentText}”
                    </div>
                  )}

                  <div style={styles.time}>
                    {timeAgo(item.createdAt)}
                  </div>
                </div>

                {item.postThumbnail ? (
                  <img
                    src={item.postThumbnail}
                    alt=""
                    style={styles.thumbnail}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#09090b",
    color: "#ffffff",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    height: "62px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 14px",
    borderBottom: "1px solid #27272a",
    background: "#09090b",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },
  backButton: {
    width: "40px",
    height: "40px",
    border: "none",
    background: "transparent",
    color: "#ffffff",
    fontSize: "34px",
    lineHeight: 1,
    cursor: "pointer",
  },
  title: {
    margin: 0,
    fontSize: "19px",
    fontWeight: "800",
  },
  headerSpacer: {
    width: "40px",
  },
  content: {
    width: "100%",
    maxWidth: "680px",
    margin: "0 auto",
  },
  center: {
    minHeight: "60vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#a1a1aa",
  },
  list: {
    width: "100%",
  },
  row: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px",
    borderBottom: "1px solid #1f1f23",
    background: "transparent",
    color: "#ffffff",
    textAlign: "left",
  },
  unread: {
    background: "#111118",
  },
  icon: {
    width: "42px",
    height: "42px",
    borderRadius: "50%",
    background: "#18181b",
    border: "1px solid #27272a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: "19px",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  message: {
    fontSize: "14px",
    fontWeight: "650",
    lineHeight: 1.35,
  },
  comment: {
    marginTop: "4px",
    color: "#a1a1aa",
    fontSize: "13px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  time: {
    marginTop: "5px",
    color: "#71717a",
    fontSize: "12px",
  },
  thumbnail: {
    width: "46px",
    height: "62px",
    objectFit: "cover",
    borderRadius: "7px",
    background: "#18181b",
    flexShrink: 0,
  },
  empty: {
    minHeight: "65vh",
    padding: "30px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    color: "#a1a1aa",
  },
  emptyIcon: {
    fontSize: "48px",
    marginBottom: "10px",
  },
};