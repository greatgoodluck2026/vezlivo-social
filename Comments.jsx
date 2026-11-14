import React, { useEffect, useState, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";

const API_URL = "https://vezlivo-api.vezlivo-api.workers.dev";

export default function Comments({ postId, postOwnerId, onClose }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [viewportHeight, setViewportHeight] = useState(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [replyingTo, setReplyingTo] = useState(null);
  const [expandedThreads, setExpandedThreads] = useState({});
  const [likedComments, setLikedComments] = useState({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

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
        } else {
          setErrorMessage("Could not load comments from server.");
        }
      } catch (err) {
        console.error("Failed to load comments:", err);
        setErrorMessage("Network error: Unable to connect to server.");
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [postId]);

  const toggleLike = (commentId) => {
    setLikedComments((prev) => ({
      ...prev,
      [commentId]: !prev[commentId],
    }));
  };

  const sendComment = async () => {
    if (!currentUser) {
      setErrorMessage("You must be logged in to send a comment.");
      return;
    }

    const text = commentText.trim();
    if (!text && selectedImages.length === 0) {
      setErrorMessage("Please type a message or attach at least one picture before sending.");
      return;
    }

    if (!postId || !postOwnerId) {
      setErrorMessage("Error: Missing post reference information.");
      return;
    }

    setSending(true);
    setErrorMessage(null);

    try {
      if (text && text.length > 500) {
        setErrorMessage("Comment is too long (maximum 500 characters).");
        setSending(false);
        return;
      }

      const targetParentId = replyingTo ? replyingTo.commentId : null;

      const response = await fetch(`${API_URL}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: postId,
          post_id: postId,
          postOwnerId: postOwnerId,
          post_owner_id: postOwnerId,
          userId: currentUser.uid,
          user_id: currentUser.uid,
          text: text,
          mediaUrls: selectedImages,
          media_urls: selectedImages,
          parentId: targetParentId,
          parent_id: targetParentId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const userDisplayName = currentUser.displayName || currentUser.email?.split("@")[0] || "Vezlivo User";
        const userPhotoURL = currentUser.photoURL || "";

        const newCommentObj = {
          id: data.commentId || Date.now().toString(),
          user_id: currentUser.uid,
          userId: currentUser.uid,
          displayName: userDisplayName,
          display_name: userDisplayName,
          photoURL: userPhotoURL,
          profile_url: userPhotoURL,
          text: text,
          mediaUrls: selectedImages,
          media_urls: selectedImages,
          createdAt: Date.now(),
          parentId: targetParentId,
          parent_id: targetParentId,
        };

        setCommentText("");
        setSelectedImages([]);
        setShowEmojiPicker(false);
        if (replyingTo) {
          setExpandedThreads((prev) => ({ ...prev, [replyingTo.commentId]: true }));
        }
        setReplyingTo(null);
        setComments((prev) => [newCommentObj, ...prev]);
      } else {
        throw new Error(data.error || "Server failed to save comment.");
      }
    } catch (error) {
      console.error("Could not send comment:", error);
      setErrorMessage(error.message || "Failed to send comment. Please check your connection.");
    } finally {
      setSending(false);
    }
  };

  const handleStickerSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (selectedImages.length >= 2) {
      setErrorMessage("You can only attach a maximum of 2 images.");
      return;
    }

    const remainingSlots = 2 - selectedImages.length;
    const filesToProcess = files.slice(0, remainingSlots);

    filesToProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        setSelectedImages((prev) => {
          if (prev.length >= 2) return prev;
          return [...prev, uploadEvent.target.result];
        });
      };
      reader.readAsDataURL(file);
    });

    e.target.value = "";
  };

  const removeImage = (indexToRemove) => {
    setSelectedImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
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

  const renderCommentContent = (comment) => {
    const media = comment.mediaUrls || comment.media_urls || [];
    let parsedImages = [];

    try {
      if (comment.text && comment.text.startsWith("{") && comment.text.includes("images")) {
        const parsed = JSON.parse(comment.text);
        if (parsed.images) parsedImages = parsed.images;
        if (parsed.text) comment.text = parsed.text;
      }
    } catch (e) {
      // ignore
    }

    const allImages = [...media, ...parsedImages];

    return (
      <div>
        {allImages.length > 0 && (
          <div style={styles.commentImagesGrid}>
            {allImages.map((imgSrc, i) => (
              <img key={i} src={imgSrc} alt="attachment" style={styles.commentStickerImage} />
            ))}
          </div>
        )}
        {comment.text && !comment.text.startsWith("{") && (
          <p style={styles.commentText}>{comment.text}</p>
        )}
      </div>
    );
  };

  const renderCommentItem = (comment, isReply = false) => {
    const commentId = comment.id || comment.commentId;
    const displayName = comment.displayName || comment.display_name || "Vezlivo User";
    const userPhoto = comment.photoURL || comment.profile_url;
    const isLiked = !!likedComments[commentId];

    return (
      <div style={isReply ? styles.replyItem : styles.commentItem} key={commentId}>
        {userPhoto ? (
          <img src={userPhoto} alt="" style={isReply ? styles.replyAvatar : styles.avatar} />
        ) : (
          <div style={isReply ? styles.replyAvatarFallback : styles.avatarFallback}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={styles.commentBody}>
          <div style={styles.commentTop}>
            <strong style={styles.name}>{displayName}</strong>
          </div>
          {renderCommentContent(comment)}
          <div style={styles.commentFooterRow}>
            <span style={styles.time}>{formatTime(comment.createdAt || comment.created_at)}</span>
            <button
              type="button"
              style={styles.replyTriggerBtn}
              onClick={() => {
                setReplyingTo({
                  commentId: isReply ? comment.parent_id || comment.parentId : commentId,
                  displayName: displayName,
                });
                setCommentText("");
                if (inputRef.current) inputRef.current.focus();
              }}
            >
              Reply
            </button>
          </div>
        </div>

        {/* TikTok-style Heart Like Button on the Right */}
        <div style={styles.likeActionWrapper}>
          <button
            type="button"
            onClick={() => toggleLike(commentId)}
            style={styles.likeButton}
          >
            <span style={{ fontSize: "16px", color: isLiked ? "#fe2c55" : "#888" }}>
              {isLiked ? "❤️" : "🤍"}
            </span>
          </button>
          <span style={styles.likeCountText}>{isLiked ? 1 : 0}</span>
        </div>
      </div>
    );
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
        {errorMessage && (
          <div style={styles.errorPopup}>
            <span>⚠️ {errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} style={styles.closeErrorBtn}>
              ×
            </button>
          </div>
        )}

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
                const commentReplies = repliesMap[commentId] || [];
                const hasReplies = commentReplies.length > 0;
                const isExpanded = !!expandedThreads[commentId];

                return (
                  <div key={commentId || index} style={styles.commentThreadWrapper}>
                    {renderCommentItem(comment, false)}

                    {hasReplies && (
                      <div style={styles.viewRepliesWrapper}>
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
                          <span style={styles.replyArrow}>──────</span> {isExpanded ? "Hide replies" : `View replies (${commentReplies.length})`}
                        </button>
                      </div>
                    )}

                    {hasReplies && isExpanded && (
                      <div style={styles.repliesContainer}>
                        {commentReplies.map((reply) => renderCommentItem(reply, true))}
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
        </div>

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

        {selectedImages.length > 0 && (
          <div style={styles.imagePreviewContainer}>
            {selectedImages.map((imgSrc, idx) => (
              <div key={idx} style={styles.previewThumbWrapper}>
                <img src={imgSrc} alt="Preview" style={styles.previewThumbnail} />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  style={styles.removePreviewBtn}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Emoji Quick Picker Popup */}
        {showEmojiPicker && (
          <div style={styles.emojiPopupBar}>
            {["❤️", "🥰", "😂", "😭", "🔥", "🙏", "😊", "👏", "🔥", "💯"].map((emoji) => (
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
        )}

        {/* TikTok-style Bottom Input Bar with embedded action buttons */}
        <div style={styles.inputArea}>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept="image/*"
            multiple
            onChange={handleStickerSelect}
          />

          <div style={styles.inputWrapperContainer}>
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
              placeholder={replyingTo ? `Replying to ${replyingTo.displayName}...` : "Add comment..."}
              maxLength={500}
              style={styles.input}
            />

            <div style={styles.inputIconsRight}>
              <button
                type="button"
                style={styles.inlineActionBtn}
                onClick={() => {
                  if (selectedImages.length >= 2) {
                    setErrorMessage("You can only attach a maximum of 2 images.");
                    return;
                  }
                  if (fileInputRef.current) fileInputRef.current.click();
                }}
                title="Attach Image"
              >
                🖼️
              </button>
              <button
                type="button"
                style={styles.inlineActionBtn}
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                title="Add Emoji"
              >
                😊
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={sendComment}
            disabled={sending || (!commentText.trim() && selectedImages.length === 0)}
            style={{
              ...styles.sendButton,
              ...(sending || (!commentText.trim() && selectedImages.length === 0) ? styles.disabledButton : {}),
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
    height: "68vh",
    maxHeight: "72dvh",
    background: "#ffffff",
    color: "#000000",
    borderRadius: "24px 24px 0 0",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.4)",
    overflow: "hidden",
    zIndex: 1000000,
  },
  errorPopup: {
    background: "#fee2e2",
    color: "#b91c1c",
    padding: "10px 16px",
    fontSize: "13px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #fca5a5",
    zIndex: 10,
  },
  closeErrorBtn: {
    background: "transparent",
    border: "none",
    color: "#b91c1c",
    fontSize: "18px",
    fontWeight: "bold",
    cursor: "pointer",
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
    marginBottom: "16px",
  },
  replyItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
  },
  avatar: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    objectFit: "cover",
    background: "#eee",
    flexShrink: 0,
  },
  avatarFallback: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    background: "#3b82f6",
    color: "#ffffff",
    fontWeight: "700",
    fontSize: "15px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  replyAvatar: {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    objectFit: "cover",
    background: "#eee",
    flexShrink: 0,
  },
  replyAvatarFallback: {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    background: "#3b82f6",
    color: "#ffffff",
    fontWeight: "700",
    fontSize: "12px",
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
    color: "#555",
  },
  commentText: {
    margin: "3px 0 4px",
    fontSize: "14px",
    lineHeight: "1.4",
    color: "#111",
    wordBreak: "break-word",
  },
  commentImagesGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "4px",
  },
  commentStickerImage: {
    maxWidth: "130px",
    maxHeight: "130px",
    borderRadius: "8px",
    objectFit: "cover",
    display: "block",
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
    color: "#555",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    padding: 0,
  },
  likeActionWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "8px",
    flexShrink: 0,
    width: "36px",
  },
  likeButton: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  likeCountText: {
    fontSize: "11px",
    color: "#888",
    marginTop: "-2px",
  },
  viewRepliesWrapper: {
    marginLeft: "50px",
    marginTop: "4px",
    marginBottom: "10px",
  },
  toggleRepliesBtn: {
    background: "transparent",
    border: "none",
    color: "#555",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  replyArrow: {
    fontSize: "10px",
    color: "#ccc",
    letterSpacing: "-2px",
  },
  repliesContainer: {
    marginTop: "8px",
    marginLeft: "40px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  replyingBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    background: "#f1f1f4",
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
  imagePreviewContainer: {
    display: "flex",
    gap: "8px",
    padding: "8px 16px",
    background: "#f9f9f9",
    borderTop: "1px solid #eee",
    overflowX: "auto",
  },
  previewThumbWrapper: {
    position: "relative",
    flexShrink: 0,
  },
  previewThumbnail: {
    width: "60px",
    height: "60px",
    objectFit: "cover",
    borderRadius: "6px",
    border: "1px solid #ddd",
  },
  removePreviewBtn: {
    position: "absolute",
    top: "-6px",
    right: "-6px",
    background: "#333",
    color: "#fff",
    border: "none",
    borderRadius: "50%",
    width: "20px",
    height: "20px",
    fontSize: "12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emojiPopupBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    padding: "8px 16px",
    background: "#fafafa",
    borderTop: "1px solid #eee",
  },
  quickEmojiBtn: {
    background: "transparent",
    border: "none",
    fontSize: "22px",
    cursor: "pointer",
    padding: "4px",
  },
  inputArea: {
    position: "relative",
    marginTop: "auto",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 16px",
    borderTop: "1px solid #eee",
    background: "#ffffff",
    zIndex: 10,
  },
  inputWrapperContainer: {
    flex: 1,
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  input: {
    width: "100%",
    height: "44px",
    border: "1px solid #e2e2e2",
    borderRadius: "22px",
    outline: "none",
    padding: "0 80px 0 16px",
    fontSize: "14px",
    background: "#f8f8f8",
    color: "#111",
    boxSizing: "border-box",
  },
  inputIconsRight: {
    position: "absolute",
    right: "10px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  inlineActionBtn: {
    background: "transparent",
    border: "none",
    fontSize: "18px",
    cursor: "pointer",
    padding: "2px",
  },
  sendButton: {
    height: "44px",
    border: "none",
    borderRadius: "22px",
    padding: "0 18px",
    background: "#fe2c55",
    color: "#ffffff",
    fontWeight: "700",
    fontSize: "14px",
    cursor: "pointer",
    flexShrink: 0,
  },
  disabledButton: {
    opacity: 0.4,
    cursor: "not-allowed",
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
    marginBottom: "16px",
  },
};