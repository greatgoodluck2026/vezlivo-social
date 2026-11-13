import React, { useEffect, useState, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";
import { checkComment } from "./CommentFilter";

const API_URL = "https://vezlivo-api.vezlivo-api.workers.dev";

export default function Comments({ postId, postOwnerId, onClose }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [replyingTo, setReplyingTo] = useState(null); // stores { commentId, displayName }
  const [expandedThreads, setExpandedThreads] = useState({}); // tracks which threads have their replies shown

  const inputRef = useRef(null); // Reference to auto-focus input on reply click
  const fileInputRef = useRef(null); // Reference for sticker/image uploads
  
  // Lock background body scroll completely so the browser cannot pan the feed
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalWidth = document.body.style.width;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.width = originalWidth;
    };
  }, []);

  // Visual Viewport listener to anchor smoothly to mobile keyboard without shifting the layout
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
        setKeyboardOffset(window.visualViewport.offsetTop);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
      window.visualViewport.addEventListener("scroll", handleResize);
      setViewportHeight(window.visualViewport.height);
      setKeyboardOffset(window.visualViewport.offsetTop);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleResize);
        window.visualViewport.removeEventListener("scroll", handleResize);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!postId) {
      setComments([]);
      setLoading(false);
      return;
    }

    const fetchComments = async () => {
      try {
        const response = await fetch(`${API_URL}/comments?postId=${postId}`);
        const data = await response.json();
        if (data.success) {
          const sorted = (data.comments || []).sort((a, b) => {
            const timeA = Number(a.createdAt || a.created_at || 0);
            const timeB = Number(b.createdAt || b.created_at || 0);
            return timeB - timeA;
          });
          setComments(sorted);
        }
      } catch (err) {
        console.error("Failed to load comments:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [postId]);

  const sendComment = async (textToSend) => {
    if (!currentUser) return;

    const text = (textToSend !== undefined ? textToSend : commentText).trim();
    if (!text) return;

    if (!postId || !postOwnerId) return;

    setSending(true);

    try {
      const response = await fetch(`${API_URL}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: postId,
          postOwnerId: postOwnerId,
          userId: currentUser.uid,
          text: text,
          parentId: replyingTo ? replyingTo.commentId : null,
          parent_id: replyingTo ? replyingTo.commentId : null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const targetParentId = replyingTo ? replyingTo.commentId : null;
        
        // Ensure immediate profile data capture from currentUser
        const userDisplayName = currentUser.displayName || currentUser.email?.split("@")[0] || "Vezlivo User";
        const userPhotoURL = currentUser.photoURL || "";

        const newCommentObj = {
          id: Date.now().toString(),
          user_id: currentUser.uid,
          userId: currentUser.uid,
          displayName: userDisplayName,
          display_name: userDisplayName,
          photoURL: userPhotoURL,
          profile_url: userPhotoURL,
          text,
          createdAt: Date.now(),
          parentId: targetParentId,
          parent_id: targetParentId,
        };

        setCommentText("");
        if (replyingTo) {
          setExpandedThreads((prev) => ({ ...prev, [replyingTo.commentId]: true }));
        }
        setReplyingTo(null);
        setComments((prev) => [newCommentObj, ...prev]);
      } else {
        throw new Error(data.error || "Failed to post comment.");
      }
    } catch (error) {
      console.error("Could not send comment:", error);
    } finally {
      setSending(false);
    }
  };

  const handleStickerSelect = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;

    const reader = new FileReader();
    reader.onload = async (uploadEvent) => {
      const stickerDataUrl = uploadEvent.target.result;
      await sendComment(stickerDataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
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
    <div 
      style={{
        ...styles.overlay,
        ...(viewportHeight ? { height: `${viewportHeight}px`, top: `${keyboardOffset}px` } : {})
      }} 
      onClick={onClose}
    >
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Comments</h2>
            <span style={styles.commentCount}>
              {comments.filter(c => {
                const p = c.parent_id || c.parentId;
                return !p || p === "" || p === null || p === "null" || p === undefined;
              }).length} comments
            </span>
          </div>
          <button type="button" onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        {/* Scrollable Comments List */}
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
            (() => {
              const topLevelComments = comments.filter((c) => {
                const pId = c.parent_id || c.parentId;
                return !pId || pId === "" || pId === null || pId === "null" || pId === undefined;
              });

              const repliesMap = {};
              comments.forEach((c) => {
                const pId = c.parent_id || c.parentId;
                if (pId && pId !== "" && pId !== null && pId !== "null" && pId !== undefined) {
                  if (!repliesMap[pId]) repliesMap[pId] = [];
                  if (!repliesMap[pId].some((existing) => String(existing.id || existing.commentId) === String(c.id || c.commentId))) {
                    repliesMap[pId].push(c);
                  }
                }
              });

              return topLevelComments.map((comment, index) => {
                const commentId = comment.id || comment.commentId;
                const currentDisplayName = comment.displayName || comment.display_name || "Vezlivo User";
                const userPhoto = comment.photoURL || comment.profile_url;
                const commentReplies = repliesMap[commentId] || [];
                const hasReplies = commentReplies.length > 0;
                const isExpanded = !!expandedThreads[commentId];
                const isSticker = comment.text && comment.text.startsWith("data:image");

                return (
                  <div key={commentId || index} style={styles.commentThreadWrapper}>
                    {/* Top Level Comment Item */}
                    <div style={styles.commentItem}>
                      {userPhoto ? (
                        <img src={userPhoto} alt="" style={styles.avatar} />
                      ) : (
                        <div style={styles.avatarFallback}>
                          {currentDisplayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div style={styles.commentBody}>
                        <div style={styles.commentTop}>
                          <strong style={styles.name}>{currentDisplayName}</strong>
                        </div>
                        {isSticker ? (
                          <img src={comment.text} alt="sticker" style={styles.commentStickerImage} />
                        ) : (
                          <p style={styles.commentText}>{comment.text}</p>
                        )}
                        <div style={styles.commentFooterRow}>
                          <span style={styles.time}>{formatTime(comment.createdAt || comment.created_at)}</span>
                          <button
                            type="button"
                            style={styles.replyTriggerBtn}
                            onClick={() => {
                              setReplyingTo({
                                commentId: commentId,
                                displayName: currentDisplayName,
                              });
                              setCommentText(""); 
                              if (inputRef.current) {
                                inputRef.current.focus();
                              }
                            }}
                          >
                            Reply
                          </button>
                        </div>

                        {/* Vezlivo Show/Hide Replies Toggle */}
                        {hasReplies && (
                          <button
                            type="button"
                            style={styles.toggleRepliesBtn}
                            onClick={() => {
                              setExpandedThreads((prev) => ({
                                ...prev,
                                [commentId]: !prev[commentId],
                              }));
                            }}
                          >
                            <span style={styles.replyArrow}>↳</span> {isExpanded ? "Hide replies" : `Show ${commentReplies.length} ${commentReplies.length === 1 ? "reply" : "replies"}`}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Nested Replies Section */}
                    {hasReplies && isExpanded && (
                      <div style={styles.repliesContainer}>
                        {commentReplies.map((reply, rIndex) => {
                          const replyDisplayName = reply.displayName || reply.display_name || "Vezlivo User";
                          const replyPhoto = reply.photoURL || reply.profile_url;
                          const isReplySticker = reply.text && reply.text.startsWith("data:image");
                          return (
                            <div key={reply.id || reply.commentId || rIndex} style={styles.replyItem}>
                              {replyPhoto ? (
                                <img src={replyPhoto} alt="" style={styles.replyAvatar} />
                              ) : (
                                <div style={styles.replyAvatarFallback}>
                                  {replyDisplayName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div style={styles.commentBody}>
                                <div style={styles.commentTop}>
                                  <strong style={styles.name}>{replyDisplayName}</strong>
                                </div>
                                {isReplySticker ? (
                                  <img src={reply.text} alt="sticker" style={styles.commentStickerImage} />
                                ) : (
                                  <p style={styles.commentText}>{reply.text}</p>
                                )}
                                <div style={styles.commentFooterRow}>
                                  <span style={styles.time}>{formatTime(reply.createdAt || reply.created_at)}</span>
                                  <button
                                    type="button"
                                    style={styles.replyTriggerBtn}
                                    onClick={() => {
                                      setReplyingTo({
                                        commentId: commentId,
                                        displayName: replyDisplayName,
                                      });
                                      setCommentText("");
                                      if (inputRef.current) {
                                        inputRef.current.focus();
                                      }
                                    }}
                                  >
                                    Reply
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
        </div>

        {/* Replying Banner */}
        {replyingTo && (
          <div style={styles.replyingBanner}>
            <span>Replying to <strong>{replyingTo.displayName}</strong></span>
            <button
              type="button"
              onClick={() => {
                setReplyingTo(null);
                setCommentText("");
              }}
              style={styles.cancelReplyBtn}
            >
              ×
            </button>
          </div>
        )}

        {/* Quick Reaction Emoji Bar */}
        <div style={styles.quickEmojiBar}>
          {["❤️", "🥰", "😂", "😭", "🔥", "🙏", "😊"].map((emoji) => (
            <button
              key={emoji}
              type="button"
              style={styles.quickEmojiBtn}
              onClick={() => {
                setCommentText((prev) => prev + emoji);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Input Bar pinned cleanly inside the fixed panel */}
        <div style={styles.inputArea}>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept="image/*"
            onChange={handleStickerSelect}
          />

          <button
            type="button"
            style={styles.stickerBtn}
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.click();
              }
            }}
            title="Send sticker or image"
          >
            🖼️
          </button>

          <input
            ref={inputRef}
            type="text"
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                sendComment();
              }
            }}
            placeholder={replyingTo ? `Replying to ${replyingTo.displayName}...` : "Add a comment..."}
            maxLength={500}
            style={styles.input}
          />
          <button
            type="button"
            onClick={() => sendComment()}
            disabled={sending || !commentText.trim()}
            style={{
              ...styles.sendButton,
              ...(sending || !commentText.trim() ? styles.disabledButton : {}),
            }}
          >
            {sending ? "..." : "Post"}
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
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 999999,
  },
  panel: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: "600px",
    height: "65vh",
    maxHeight: "70dvh",
    background: "#ffffff",
    color: "#000000",
    borderRadius: "24px 24px 0 0",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.4)",
    overflow: "hidden",
    zIndex: 1000000,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid #f0f0f0",
    background: "#ffffff",
    borderTopLeftRadius: "24px",
    borderTopRightRadius: "24px",
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: "17px",
    fontWeight: "800",
    color: "#111",
  },
  commentCount: {
    display: "block",
    marginTop: "2px",
    color: "#888",
    fontSize: "12px",
  },
  closeButton: {
    width: "36px",
    height: "36px",
    border: "none",
    borderRadius: "50%",
    background: "#f1f1f4",
    color: "#333",
    fontSize: "22px",
    lineHeight: "1",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  commentsArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px",
    background: "#ffffff",
  },
  commentItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "18px",
  },
  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    objectFit: "cover",
    background: "#eee",
    flexShrink: 0,
  },
  avatarFallback: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: "#3b82f6",
    color: "#ffffff",
    fontWeight: "700",
    fontSize: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  commentBody: {
    flex: 1,
    minWidth: 0,
  },
  commentTop: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  name: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#111",
  },
  commentText: {
    margin: "4px 0 3px",
    fontSize: "14px",
    lineHeight: "1.4",
    color: "#222",
    wordBreak: "break-word",
  },
  commentStickerImage: {
    maxWidth: "120px",
    maxHeight: "120px",
    borderRadius: "8px",
    marginTop: "4px",
    objectFit: "cover",
  },
  commentFooterRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginTop: "2px",
  },
  time: {
    fontSize: "11px",
    color: "#999",
  },
  replyTriggerBtn: {
    background: "transparent",
    border: "none",
    color: "#6366f1",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    padding: 0,
  },
  toggleRepliesBtn: {
    background: "transparent",
    border: "none",
    color: "#3b82f6",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    padding: 0,
    marginTop: "6px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  replyArrow: {
    fontSize: "13px",
  },
  replyingBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    background: "#f0f4f8",
    borderTop: "1px solid #e2e8f0",
    fontSize: "13px",
    color: "#333",
  },
  cancelReplyBtn: {
    background: "transparent",
    border: "none",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    color: "#555",
  },
  quickEmojiBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    padding: "10px 16px",
    background: "#ffffff",
    borderTop: "1px solid #f0f0f0",
  },
  quickEmojiBtn: {
    background: "transparent",
    border: "none",
    fontSize: "22px",
    cursor: "pointer",
    padding: "4px",
    transition: "transform 0.1s ease",
  },
  inputArea: {
    position: "relative",
    marginTop: "auto",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    borderTop: "1px solid #eee",
    background: "#ffffff",
    zIndex: 10,
  },
  stickerBtn: {
    background: "transparent",
    border: "none",
    fontSize: "20px",
    cursor: "pointer",
    padding: "0 2px",
    flexShrink: "0",
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: "46px",
    border: "1px solid #ddd",
    borderRadius: "24px",
    outline: "none",
    padding: "0 18px",
    fontSize: "14px",
    background: "#f9f9f9",
    color: "#111",
    boxSizing: "border-box",
  },
  sendButton: {
    height: "46px",
    border: "none",
    borderRadius: "24px",
    padding: "0 22px",
    background: "linear-gradient(135deg, #6366f1, #38bdf8)",
    color: "#ffffff",
    fontWeight: "700",
    fontSize: "14px",
    cursor: "pointer",
    flexShrink: 0,
    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
  },
  disabledButton: {
    opacity: 0.4,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  centerMessage: {
    minHeight: "180px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    color: "#666",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "42px",
    marginBottom: "4px",
  },
  emptyText: {
    color: "#888",
    fontSize: "13px",
  },
  commentThreadWrapper: {
    marginBottom: "18px",
  },
  repliesContainer: {
    marginTop: "10px",
    marginLeft: "28px",
    paddingLeft: "12px",
    borderLeft: "2px solid #f0f0f0",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  replyItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
  },
  replyAvatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    objectFit: "cover",
    background: "#eee",
    flexShrink: 0,
  },
  replyAvatarFallback: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "#3b82f6",
    color: "#ffffff",
    fontWeight: "700",
    fontSize: "13px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};