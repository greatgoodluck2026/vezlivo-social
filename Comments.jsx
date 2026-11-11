import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";
import { checkComment } from "./CommentFilter";

export default function Comments({ postId, postOwnerId, onClose }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Fetch comments from Cloudflare Worker / Neon PostgreSQL backend
  useEffect(() => {
    if (!postId) {
      setComments([]);
      setLoading(false);
      return;
    }

    const fetchComments = async () => {
      try {
        const response = await fetch(`/comments?postId=${postId}`);
        const data = await response.json();
        if (data.success) {
          setComments(data.comments || []);
        }
      } catch (err) {
        console.error("Failed to load comments:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [postId]);

  const sendComment = async () => {
    if (!currentUser) {
      alert("Please log in first.");
      return;
    }

    const text = commentText.trim();
    if (!text) return;

    const filterResult = checkComment(text);
    if (!filterResult.allowed) {
      alert(filterResult.reason);
      return;
    }

    if (!postId || !postOwnerId) {
      alert("This post cannot receive comments yet.");
      return;
    }

    setSending(true);

    try {
      const response = await fetch("/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: postId,
          postOwnerId: postOwnerId,
          userId: currentUser.uid,
          text: text,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setCommentText("");
        // Optimistically update UI
        setComments((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            user_id: currentUser.uid,
            displayName: currentUser.displayName || "Vezlivo User",
            username: "user",
            photoURL: currentUser.photoURL || "",
            text,
            createdAt: Date.now(),
          },
        ]);
      } else {
        throw new Error(data.error || "Failed to post comment.");
      }
    } catch (error) {
      console.error("Could not send comment:", error);
      alert("Could not send comment. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(Number(timestamp));
    if (Number.isNaN(date.getTime())) return "";

    const difference = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (difference < minute) return "Just now";
    if (difference < hour) return `${Math.floor(difference / minute)}m`;
    if (difference < day) return `${Math.floor(difference / hour)}h`;
    if (difference < 7 * day) return `${Math.floor(difference / day)}d`;

    return date.toLocaleDateString();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Comments</h2>
            <span style={styles.commentCount}>
              {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </span>
          </div>

          <button type="button" onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        <div style={styles.commentsArea}>
          {loading ? (
            <div style={styles.centerMessage}>Loading comments...</div>
          ) : comments.length === 0 ? (
            <div style={styles.centerMessage}>
              <div style={styles.emptyIcon}>💬</div>
              <strong>No comments yet</strong>
              <span style={styles.emptyText}>Be the first person to comment.</span>
            </div>
          ) : (
            comments.map((comment, index) => (
              <div key={comment.id || comment.commentId || index} style={styles.commentItem}>
                <img
                  src={comment.photoURL || comment.profile_url || "https://via.placeholder.com/50"}
                  alt=""
                  style={styles.avatar}
                />

                <div style={styles.commentBody}>
                  <div style={styles.commentTop}>
                    <strong style={styles.name}>
                      {comment.displayName || comment.display_name || "Vezlivo User"}
                    </strong>
                    <span style={styles.username}>
                      @{comment.username || "user"}
                    </span>
                  </div>

                  <p style={styles.commentText}>{comment.text}</p>

                  <span style={styles.time}>{formatTime(comment.createdAt || comment.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={styles.inputArea}>
          <input
            type="text"
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                sendComment();
              }
            }}
            placeholder="Write a comment..."
            maxLength={500}
            style={styles.input}
          />

          <button
            type="button"
            onClick={sendComment}
            disabled={sending || !commentText.trim()}
            style={{
              ...styles.sendButton,
              ...(sending || !commentText.trim() ? styles.disabledButton : {}),
            }}
          >
            {sending ? "..." : "Send"}
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
    background: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 9999,
  },
  panel: {
    width: "100%",
    maxWidth: "600px",
    height: "75vh",
    maxHeight: "80vh",
    background: "#09090b", // Dark theme background matching app
    color: "#ffffff",
    borderRadius: "22px 22px 0 0",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
    boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.5)",
    borderTop: "1px solid #27272a",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 18px",
    borderBottom: "1px solid #27272a",
  },
  title: {
    margin: 0,
    fontSize: "18px",
    fontWeight: "800",
    color: "#ffffff",
  },
  commentCount: {
    display: "block",
    marginTop: "3px",
    color: "#a1a1aa",
    fontSize: "12px",
  },
  closeButton: {
    width: "36px",
    height: "36px",
    border: "none",
    borderRadius: "50%",
    background: "#27272a",
    color: "#ffffff",
    fontSize: "22px",
    lineHeight: "1",
    cursor: "pointer",
  },
  commentsArea: {
    flex: 1,
    overflowY: "auto",
    padding: "14px 18px",
    paddingBottom: "80px",
  },
  commentItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "16px",
  },
  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    objectFit: "cover",
    background: "#27272a",
    flexShrink: 0,
    border: "1px solid #3f3f46",
  },
  commentBody: {
    flex: 1,
    minWidth: 0,
  },
  commentTop: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    flexWrap: "wrap",
  },
  name: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#ffffff",
  },
  username: {
    fontSize: "12px",
    color: "#71717a",
  },
  commentText: {
    margin: "4px 0 2px",
    fontSize: "14px",
    lineHeight: "1.4",
    color: "#d4d4d8",
    wordBreak: "break-word",
  },
  time: {
    fontSize: "11px",
    color: "#71717a",
  },
  inputArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    gap: "10px",
    padding: "12px 16px",
    borderTop: "1px solid #27272a",
    background: "#18181b",
    zIndex: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: "44px",
    border: "1px solid #3f3f46",
    borderRadius: "22px",
    outline: "none",
    padding: "0 16px",
    fontSize: "14px",
    background: "#09090b",
    color: "#ffffff",
    boxSizing: "border-box",
  },
  sendButton: {
    height: "44px",
    border: "none",
    borderRadius: "22px",
    padding: "0 20px",
    background: "#6366f1",
    color: "#ffffff",
    fontWeight: "700",
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  centerMessage: {
    minHeight: "220px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    color: "#a1a1aa",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "40px",
    marginBottom: "5px",
  },
  emptyText: {
    color: "#71717a",
    fontSize: "13px",
  },
};