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

export default function Activity({ onBack }) {
  const [user, setUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeFilter, setActiveFilter] = useState("likes"); // Default strictly to likes, no "all" mixing
  const [activeChatPartner, setActiveChatPartner] = useState(null);
  const [messages, setMessages] = useState("");
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showInboxView, setShowInboxView] = useState(false); // Isolated DM view toggle

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

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
        
        const actRes = await fetch(`${API_URL}/api/activities?uid=${user.uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (actRes.ok) {
          const actData = await actRes.json();
          setActivities(actData.activities || []);
        }

        const msgRes = await apiGet(`/messages?userId=${user.uid}`);
        if (msgRes && msgRes.conversations) {
          setConversations(msgRes.conversations);
        }
      } catch (error) {
        console.error("Activity loading error:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  useEffect(() => {
    if (!user || !activeChatPartner) return;

    async function loadChat() {
      try {
        const res = await apiGet(`/messages?userId=${user.uid}&otherUserId=${activeChatPartner.id}`);
        if (res && res.messages) {
          setMessages(res.messages);
        }
      } catch (err) {
        console.error("Chat error:", err);
      }
    }

    loadChat();
    const interval = setInterval(loadChat, 4000);
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

  // Strictly filter items per tab so likes never mix with comments or follows
  const filteredActivities = activities.filter((act) => {
    if (activeFilter === "likes") return act.type === "like";
    if (activeFilter === "comments") return act.type === "comment";
    if (activeFilter === "follows") return act.type === "follow";
    return false;
  });

  const unreadCount = conversations.filter((c) => !c.read && c.sender_id !== user?.uid).length;

  // 1. CHAT CONVERSATION VIEW
  if (activeChatPartner) {
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          <button type="button" onClick={() => setActiveChatPartner(null)} style={styles.backButton}>‹</button>
          <h1 style={styles.title}>{activeChatPartner.name || "Chat"}</h1>
          <div style={styles.headerSpacer} />
        </header>

        <div style={styles.chatContainer}>
          <div style={styles.messageList}>
            {!messages || messages.length === 0 ? (
              <div style={styles.centerChat}>
                <p style={{ color: "#a1a1aa", fontSize: "14px" }}>No messages yet. Send a greeting! 👋</p>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender_id === user.uid;
                return (
                  <div key={m.id || m.created_at} style={{ ...styles.bubbleRow, justifyContent: isMe ? "flex-end" : "flex-start" }}>
                    <div style={{ ...styles.bubble, ...(isMe ? styles.myBubble : styles.theirBubble) }}>
                      {m.text}
                      <span style={{ ...styles.bubbleTime, color: isMe ? "rgba(255,255,255,0.7)" : "#a1a1aa" }}>
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
              placeholder="Write a message..."
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

  // 2. ISOLATED DIRECT MESSAGES INBOX VIEW (Separated from activity)
  if (showInboxView) {
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          <button type="button" onClick={() => setShowInboxView(false)} style={styles.backButton}>‹</button>
          <h1 style={styles.title}>Direct Messages</h1>
          <div style={styles.headerSpacer} />
        </header>
        <main style={styles.content}>
          {conversations.length === 0 ? (
            <div style={styles.emptyCard}>
              <div style={styles.emptyGlowIcon}>📬</div>
              <h2 style={styles.emptyTitle}>No messages yet</h2>
              <p style={styles.emptySub}>Visit any user profile and tap message to start chatting privately.</p>
            </div>
          ) : (
            <div style={styles.list}>
              {conversations.map((conv) => (
                <div
                  key={conv.partner_id}
                  onClick={() => setActiveChatPartner({ id: conv.partner_id, name: `User ${conv.partner_id.substring(0, 6)}` })}
                  style={styles.row}
                >
                  <div style={styles.body}>
                    <div style={styles.message}>User {conv.partner_id.substring(0, 6)}</div>
                    <div style={styles.comment}>{conv.text}</div>
                    <div style={styles.time}>{timeAgo(conv.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // 3. MAIN ACTIVITY SCREEN (Isolated Tabs for Likes, Comments, Follows with NO DM banner)
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button type="button" onClick={onBack} style={styles.backButton}>‹</button>
        <h1 style={styles.title}>Activity</h1>
        {/* Isolated DM Button on top right */}
        <button type="button" onClick={() => setShowInboxView(true)} style={styles.dmHeaderBtn}>
          💬 {unreadCount > 0 && <span style={styles.headerBadge}>{unreadCount}</span>}
        </button>
      </header>

      <main style={styles.content}>
        {/* 🎨 CATEGORY TABS: Likes, Comments, Follows (Strictly separated) */}
        <div style={styles.filterRow}>
          {[
            { key: "likes", label: "Likes" },
            { key: "comments", label: "Comments" },
            { key: "follows", label: "Follows" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              style={{
                ...styles.filterPill,
                ...(activeFilter === tab.key ? styles.activeFilterPill : {}),
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ACTIVITY LIST FOR CURRENT TAB */}
        {loading ? (
          <div style={styles.center}>
            <span>Loading {activeFilter}s...</span>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div style={styles.emptyCard}>
            <div style={styles.emptyGlowIcon}>
              {activeFilter === "likes" ? "❤️" : activeFilter === "comments" ? "💬" : "👤"}
            </div>
            <h2 style={styles.emptyTitle}>No {activeFilter} yet</h2>
            <p style={styles.emptySub}>
              When users {activeFilter} your content or account, they will show up right here.
            </p>
          </div>
        ) : (
          <div style={styles.list}>
            {filteredActivities.map((item) => {
              const thumbnailSrc = item.post_thumbnail || item.postThumbnail;
              const avatarSrc = item.actor_avatar || item.actorAvatar;
              const actor = item.actor_name || item.actorName || "Someone";

              let actionText = "interacted with your account";
              if (item.type === "like") actionText = "liked your video.";
              if (item.type === "comment") actionText = "commented on your video.";
              if (item.type === "follow") actionText = "started following you.";

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    const targetPostId = item.postId || item.post_id;
                    if (targetPostId) {
                      window.dispatchEvent(
                        new CustomEvent("vezlivo:open-post", { detail: { postId: targetPostId } })
                      );
                    }
                  }}
                  style={{
                    ...styles.row,
                    ...(item.read === false ? styles.unread : {}),
                  }}
                >
                  {/* ACTUAL USER PROFILE AVATAR */}
                  <img
                    src={avatarSrc || "/default-avatar.png"}
                    alt={actor}
                    style={styles.actorAvatar}
                    onError={(e) => { e.target.src = "/default-avatar.png"; }}
                  />

                  <div style={styles.body}>
                    <div style={styles.message}>
                      <span style={{ fontWeight: "700", color: "#fff" }}>{actor}</span> {actionText}
                    </div>
                    {item.commentText && <div style={styles.comment}>“{item.commentText}”</div>}
                    <div style={styles.time}>{timeAgo(item.createdAt || item.created_at)}</div>
                  </div>

                  {/* VIDEO THUMBNAIL ON THE RIGHT */}
                  {thumbnailSrc && (
                    <img src={thumbnailSrc} alt="Post Thumbnail" style={styles.thumbnail} />
                  )}
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
    background: "#09090b",
    color: "#ffffff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    paddingBottom: "80px",
  },
  header: {
    height: "60px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    background: "rgba(15, 15, 18, 0.85)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid #18181b",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },
  backButton: {
    width: "36px",
    height: "36px",
    border: "none",
    background: "transparent",
    color: "#ffffff",
    fontSize: "30px",
    cursor: "pointer",
  },
  dmHeaderBtn: {
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "20px",
    padding: "6px 12px",
    color: "#fff",
    fontSize: "14px",
    cursor: "pointer",
    position: "relative",
  },
  headerBadge: {
    background: "#ef4444",
    color: "#fff",
    fontSize: "10px",
    padding: "2px 6px",
    borderRadius: "10px",
    marginLeft: "4px",
  },
  title: {
    margin: 0,
    fontSize: "18px",
    fontWeight: "800",
    letterSpacing: "-0.3px",
  },
  headerSpacer: { width: "36px" },
  content: { width: "100%", maxWidth: "600px", margin: "0 auto", padding: "16px 14px" },
  filterRow: { display: "flex", gap: "8px", marginBottom: "16px", overflowX: "auto" },
  filterPill: {
    flex: 1,
    padding: "10px 16px",
    borderRadius: "12px",
    border: "1px solid #27272a",
    background: "#18181b",
    color: "#a1a1aa",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    textAlign: "center",
  },
  activeFilterPill: {
    background: "#ffffff",
    color: "#000000",
    border: "1px solid #ffffff",
    fontWeight: "700",
  },
  center: {
    minHeight: "45vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#a1a1aa",
  },
  emptyCard: {
    minHeight: "45vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "30px 20px",
    background: "#18181b",
    borderRadius: "20px",
    border: "1px solid #27272a",
  },
  emptyGlowIcon: {
    fontSize: "50px",
    marginBottom: "12px",
    filter: "drop-shadow(0 0 16px rgba(99, 102, 241, 0.5))",
  },
  emptyTitle: { margin: "0 0 6px 0", fontSize: "18px", fontWeight: "700", color: "#fff" },
  emptySub: { margin: 0, fontSize: "13px", color: "#a1a1aa", maxWidth: "300px", lineHeight: 1.4 },
  list: { display: "flex", flexDirection: "column", gap: "8px" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 14px",
    background: "#18181b",
    borderRadius: "14px",
    border: "1px solid #27272a",
    cursor: "pointer",
  },
  unread: { background: "#27272a", border: "1px solid #3f3f46" },
  actorAvatar: {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
    border: "1px solid #3f3f46",
  },
  body: { flex: 1, minWidth: 0 },
  message: { fontSize: "14px", fontWeight: "600", color: "#ffffff", lineHeight: 1.3 },
  comment: { marginTop: "3px", color: "#d4d4d8", fontSize: "13px" },
  time: { marginTop: "4px", color: "#71717a", fontSize: "11px" },
  thumbnail: { width: "42px", height: "54px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 },
  chatContainer: { display: "flex", flexDirection: "column", height: "calc(100vh - 60px)" },
  messageList: { flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" },
  centerChat: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
  bubbleRow: { display: "flex", width: "100%" },
  bubble: { maxWidth: "72%", padding: "10px 14px", borderRadius: "16px", fontSize: "14px" },
  myBubble: { background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#ffffff" },
  theirBubble: { background: "#27272a", color: "#ffffff" },
  bubbleTime: { display: "block", fontSize: "10px", marginTop: "4px", textAlign: "right" },
  replyForm: { display: "flex", padding: "12px 16px", background: "#18181b", gap: "10px", borderTop: "1px solid #27272a" },
  replyInput: { flex: 1, padding: "12px 16px", borderRadius: "24px", border: "1px solid #3f3f46", background: "#09090b", color: "#ffffff", outline: "none" },
  sendButton: { padding: "0 20px", borderRadius: "24px", border: "none", background: "#6366f1", color: "#ffffff", fontWeight: "700", cursor: "pointer" },
};