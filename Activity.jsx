import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";
import { apiGet, apiPost } from "./apiClient.js";

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
  const [conversations, setConversations] = useState([]);
  const [activeChatPartner, setActiveChatPartner] = useState(null); // If set, opens direct chat view
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Fetch activities and inbox conversations
  useEffect(() => {
    if (!user) {
      setActivities([]);
      setConversations([]);
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        const token = await user.getIdToken();
        
        // 1. Fetch activities
        const actRes = await fetch(`${API_URL}/api/activities?uid=${user.uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (actRes.ok) {
          const actData = await actRes.json();
          setActivities(actData.activities || []);
        }

        // 2. Fetch inbox conversations
        const msgRes = await apiGet(`/messages?userId=${user.uid}`);
        if (msgRes && msgRes.conversations) {
          setConversations(msgRes.conversations);
        }
      } catch (error) {
        console.error("Activity & Inbox loading error:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  // Fetch specific chat history when a partner is selected
  useEffect(() => {
    if (!user || !activeChatPartner) return;

    async function loadChat() {
      try {
        const res = await apiGet(`/messages?userId=${user.uid}&otherUserId=${activeChatPartner.id}`);
        if (res && res.messages) {
          setMessages(res.messages);
        }
      } catch (err) {
        console.error("Chat history load error:", err);
      }
    }

    loadChat();
    const interval = setInterval(loadChat, 4000); // Poll for new messages
    return () => clearInterval(interval);
  }, [user, activeChatPartner]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !activeChatPartner || !user || sending) return;

    setSending(true);
    try {
      const res = await apiPost("/messages", {
        senderId: user.uid,
        receiverId: activeChatPartner.id,
        text: replyText.trim(),
      });

      if (res && res.message) {
        setMessages((prev) => [...prev, res.message]);
        setReplyText("");
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  const handleItemClick = (item) => {
    if (item.postId) {
      window.dispatchEvent(
        new CustomEvent("vezlivo:open-post", { detail: { postId: item.postId } })
      );
    }
  };

  const unreadMessageCount = conversations.filter(c => c.read === false && c.sender_id !== user?.uid).length;

  // ==========================================
  // VIEW: DIRECT CHAT CONVERSATION SCREEN
  // ==========================================
  if (activeChatPartner) {
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          <button
            type="button"
            onClick={() => setActiveChatPartner(null)}
            style={styles.backButton}
            aria-label="Back to Activity"
          >
            ‹
          </button>
          <h1 style={styles.title}>{activeChatPartner.name || "Chat"}</h1>
          <div style={styles.headerSpacer} />
        </header>

        <div style={styles.chatContainer}>
          <div style={styles.messageList}>
            {messages.length === 0 ? (
              <div style={styles.centerChat}>
                <p style={{ color: "#71717a", fontSize: "14px" }}>No messages yet. Say hello! 👋</p>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender_id === user.uid;
                return (
                  <div key={m.id || m.created_at} style={{ ...styles.bubbleRow, justifyContent: isMe ? "flex-end" : "flex-start" }}>
                    <div style={{ ...styles.bubble, ...(isMe ? styles.myBubble : styles.theirBubble) }}>
                      {m.text}
                      <span style={{ ...styles.bubbleTime, color: isMe ? "rgba(255,255,255,0.7)" : "#71717a" }}>
                        {timeAgo(m.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleSendMessage} style={styles.replyForm}>
            <input
              type="text"
              placeholder="Type a message..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              disabled={sending}
              style={styles.replyInput}
            />
            <button type="submit" disabled={sending || !replyText.trim()} style={styles.sendButton}>
              {sending ? "..." : "Send"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: MAIN ACTIVITY & TOP INBOX SCREEN
  // ==========================================
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
        {/* 📬 TOP INBOX BANNER DROPDOWN */}
        <div 
          onClick={() => {
            // For demo/selection, open a prompt or picker if multiple conversations exist
            if (conversations.length > 0) {
              // Pick the first partner or show list
              setActiveChatPartner({ 
                id: conversations[0].partner_id, 
                name: `User ${conversations[0].partner_id.substring(0, 6)}` 
              });
            } else {
              alert("No direct messages yet. Visit a user's profile to start a chat!");
            }
          }}
          style={styles.inboxBanner}
        >
          <div style={styles.inboxBannerLeft}>
            <span style={{ fontSize: "22px" }}>✉️</span>
            <div>
              <strong style={{ display: "block", fontSize: "14px" }}>Direct Messages</strong>
              <span style={{ fontSize: "12px", color: "#71717a" }}>
                {conversations.length > 0 ? conversations[0].text : "Tap to check your inbox"}
              </span>
            </div>
          </div>
          {unreadMessageCount > 0 && (
            <span style={styles.badge}>{unreadMessageCount}</span>
          )}
        </div>

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
            {activities.map((item) => {
              const thumbnailSrc =
                item.postThumbnail ||
                (item.muxPlaybackId
                  ? `https://image.mux.com/${item.muxPlaybackId}/thumbnail.jpg`
                  : "");

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
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

                  {thumbnailSrc ? (
                    <img
                      src={thumbnailSrc}
                      alt=""
                      style={styles.thumbnail}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#ffffff",
    color: "#111111",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    height: "62px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 14px",
    borderBottom: "1px solid #e4e4e7",
    background: "#ffffff",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },
  backButton: {
    width: "40px",
    height: "40px",
    border: "none",
    background: "transparent",
    color: "#111111",
    fontSize: "34px",
    lineHeight: 1,
    cursor: "pointer",
  },
  title: {
    margin: 0,
    fontSize: "19px",
    fontWeight: "800",
    color: "#111111",
  },
  headerSpacer: {
    width: "40px",
  },
  content: {
    width: "100%",
    maxWidth: "680px",
    margin: "0 auto",
  },
  inboxBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    margin: "12px 14px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    cursor: "pointer",
  },
  inboxBannerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  badge: {
    background: "#ef4444",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: "800",
    padding: "2px 8px",
    borderRadius: "999px",
  },
  center: {
    minHeight: "60vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#71717a",
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
    borderBottom: "1px solid #f4f4f5",
    background: "transparent",
    color: "#111111",
    textAlign: "left",
    cursor: "pointer",
  },
  unread: {
    background: "#f8fafc",
  },
  icon: {
    width: "42px",
    height: "42px",
    borderRadius: "50%",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: "19px",
    color: "#0f172a",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  message: {
    fontSize: "14px",
    fontWeight: "650",
    lineHeight: 1.35,
    color: "#111111",
  },
  comment: {
    marginTop: "4px",
    color: "#52525b",
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
    background: "#e4e4e7",
    flexShrink: 0,
  },
  empty: {
    minHeight: "50vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#71717a",
    textAlign: "center",
    padding: "20px",
  },
  emptyIcon: {
    fontSize: "48px",
    marginBottom: "12px",
  },
  chatContainer: {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 62px)",
    maxWidth: "680px",
    margin: "0 auto",
  },
  messageList: {
    flex: 1,
    padding: "16px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  centerChat: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleRow: {
    display: "flex",
    width: "100%",
  },
  bubble: {
    maxWidth: "70%",
    padding: "10px 14px",
    borderRadius: "14px",
    fontSize: "14px",
    lineHeight: "1.4",
    wordBreak: "break-word",
  },
  myBubble: {
    background: "#2563eb",
    color: "#ffffff",
    borderBottomRightRadius: "4px",
  },
  theirBubble: {
    background: "#f1f5f9",
    color: "#1e293b",
    borderBottomLeftRadius: "4px",
  },
  bubbleTime: {
    display: "block",
    fontSize: "10px",
    marginTop: "4px",
    textAlign: "right",
  },
  replyForm: {
    display: "flex",
    padding: "12px 16px",
    borderTop: "1px solid #e4e4e7",
    background: "#ffffff",
    gap: "10px",
  },
  replyInput: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    outline: "none",
    fontSize: "14px",
  },
  sendButton: {
    padding: "0 18px",
    borderRadius: "10px",
    border: "none",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: "700",
    cursor: "pointer",
  },
};