import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { onValue, push, ref, update } from "firebase/database";
import { auth, database as db } from "./firebase.js";
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

  useEffect(() => {
    if (!postId || !postOwnerId) {
      setComments([]);
      setLoading(false);
      return;
    }

    const commentsRef = ref(
      db,
      `comments/${postOwnerId}/${postId}`
    );

    const unsubscribe = onValue(commentsRef, (snapshot) => {
      const data = snapshot.val() || {};

      const commentList = Object.entries(data).map(
        ([commentId, comment]) => ({
          commentId,
          ...comment,
        })
      );

      commentList.sort((a, b) => {
        return Number(a.createdAt || 0) - Number(b.createdAt || 0);
      });

      setComments(commentList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [postId, postOwnerId]);

  const sendComment = async () => {
    if (!currentUser) {
      alert("Please log in first.");
      return;
    }

    const text = commentText.trim();

    if (!text) {
      return;
    }

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
      const userRef = ref(db, `users/${currentUser.uid}`);

      let userData = {};

      await new Promise((resolve) => {
        onValue(
          userRef,
          (snapshot) => {
            userData = snapshot.val() || {};
            resolve();
          },
          {
            onlyOnce: true,
          }
        );
      });

      const commentsRef = ref(
        db,
        `comments/${postOwnerId}/${postId}`
      );

      const newCommentRef = push(commentsRef);

      const comment = {
        uid: currentUser.uid,
        displayName:
          userData.displayName ||
          currentUser.displayName ||
          "Vezlivo User",
        username:
          userData.username ||
          "user",
        photoURL:
          userData.photoURL ||
          userData.profileURL ||
          currentUser.photoURL ||
          "",
        text,
        createdAt: Date.now(),
      };

      await update(newCommentRef, comment);

      const postRef = ref(
        db,
        `posts/${postOwnerId}/${postId}`
      );

      const newCommentCount = comments.length + 1;

      await update(postRef, {
        comments: newCommentCount,
        commentsCount: newCommentCount,
      });

      const activityRef = ref(
        db,
        `activities/${postOwnerId}`
      );

      const newActivityRef = push(activityRef);

      await update(newActivityRef, {
        type: "comment",
        actorId: currentUser.uid,
        actorName:
          userData.displayName ||
          currentUser.displayName ||
          "Vezlivo User",
        actorUsername:
          userData.username ||
          "user",
        commentText: text,
        postId,
        createdAt: Date.now(),
        read: false,
      });

      setCommentText("");
    } catch (error) {
      console.error("Could not send comment:", error);
      alert("Could not send comment. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) {
      return "";
    }

    const date = new Date(Number(timestamp));

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const difference = Date.now() - date.getTime();

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (difference < minute) {
      return "Just now";
    }

    if (difference < hour) {
      return `${Math.floor(difference / minute)}m`;
    }

    if (difference < day) {
      return `${Math.floor(difference / hour)}h`;
    }

    if (difference < 7 * day) {
      return `${Math.floor(difference / day)}d`;
    }

    return date.toLocaleDateString();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Comments</h2>

            <span style={styles.commentCount}>
              {comments.length}{" "}
              {comments.length === 1 ? "comment" : "comments"}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={styles.closeButton}
          >
            ×
          </button>
        </div>

        <div style={styles.commentsArea}>
          {loading ? (
            <div style={styles.centerMessage}>
              Loading comments...
            </div>
          ) : comments.length === 0 ? (
            <div style={styles.centerMessage}>
              <div style={styles.emptyIcon}>💬</div>

              <strong>No comments yet</strong>

              <span style={styles.emptyText}>
                Be the first person to comment.
              </span>
            </div>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.commentId}
                style={styles.commentItem}
              >
                <img
                  src={
                    comment.photoURL ||
                    "https://via.placeholder.com/50"
                  }
                  alt=""
                  style={styles.avatar}
                />

                <div style={styles.commentBody}>
                  <div style={styles.commentTop}>
                    <strong style={styles.name}>
                      {comment.displayName || "Vezlivo User"}
                    </strong>

                    <span style={styles.username}>
                      @{comment.username || "user"}
                    </span>
                  </div>

                  <p style={styles.commentText}>
                    {comment.text}
                  </p>

                  <span style={styles.time}>
                    {formatTime(comment.createdAt)}
                  </span>
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
              ...(sending || !commentText.trim()
                ? styles.disabledButton
                : {}),
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
    background: "rgba(0, 0, 0, 0.55)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 9999,
  },

  panel: {
    width: "100%",
    maxWidth: "650px",
    height: "70vh",
    background: "#ffffff",
    borderRadius: "22px 22px 0 0",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.2)",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 18px",
    borderBottom: "1px solid #eeeeee",
  },

  title: {
    margin: 0,
    fontSize: "20px",
    fontWeight: "800",
  },

  commentCount: {
    display: "block",
    marginTop: "3px",
    color: "#777777",
    fontSize: "12px",
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
  },

  commentsArea: {
    flex: 1,
    overflowY: "auto",
    padding: "14px 18px",
  },

  commentItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    marginBottom: "17px",
  },

  avatar: {
    width: "42px",
    height: "42px",
    borderRadius: "50%",
    objectFit: "cover",
    background: "#eeeeee",
    flexShrink: 0,
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
    fontSize: "14px",
    color: "#222222",
  },

  username: {
    fontSize: "12px",
    color: "#888888",
  },

  commentText: {
    margin: "5px 0 3px",
    fontSize: "14px",
    lineHeight: "1.45",
    color: "#333333",
    wordBreak: "break-word",
  },

  time: {
    fontSize: "11px",
    color: "#999999",
  },

  inputArea: {
    display: "flex",
    gap: "8px",
    padding: "12px 14px",
    borderTop: "1px solid #eeeeee",
    background: "#ffffff",
  },

  input: {
    flex: 1,
    minWidth: 0,
    height: "44px",
    border: "1px solid #dddddd",
    borderRadius: "22px",
    outline: "none",
    padding: "0 16px",
    fontSize: "14px",
    boxSizing: "border-box",
  },

  sendButton: {
    height: "44px",
    border: "none",
    borderRadius: "22px",
    padding: "0 17px",
    background: "#6c35ff",
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
    color: "#666666",
    textAlign: "center",
  },

  emptyIcon: {
    fontSize: "42px",
    marginBottom: "5px",
  },

  emptyText: {
    color: "#999999",
    fontSize: "13px",
  },
};