import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { get, onValue, push, ref, runTransaction, set, update } from "firebase/database";
import { auth, database as db } from "./firebase.js";
import Comments from "./Comments";
import Report from "./Report.jsx";
import { apiGet } from "./apiClient.js"; 
import '@mux/mux-video';

export default function Home({ onNavigate }) {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState("For You");
  const [showComments, setShowComments] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [activeSection, setActiveSection] = useState("Home");
  const [users, setUsers] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [followingIds, setFollowingIds] = useState({});
  const [likedIds, setLikedIds] = useState({});
  const [savedIds, setSavedIds] = useState({});
  const [openMenuPostId, setOpenMenuPostId] = useState(null);
  const [reportPost, setReportPost] = useState(null);
  const [viewedPostIds, setViewedPostIds] = useState({});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFeedPosts() {
      try {
        const data = await apiGet("/posts");
        
        if (cancelled) return;

        const postList = Array.isArray(data) ? data : (data.posts || []);

        postList.sort(
          (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
        );

        setPosts(postList);
      } catch (error) {
        console.error("Failed to load feed posts:", error);
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFeedPosts();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setFollowingIds({});
      return;
    }

    const followingRef = ref(db, `users/${user.uid}/following`);
    const unsubscribe = onValue(followingRef, (snapshot) => {
      setFollowingIds(snapshot.val() || {});
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || posts.length === 0) {
      setLikedIds({});
      setSavedIds({});
      return undefined;
    }

    const unsubscribers = posts.map((post) => {
      if (!post.postId) return () => {};

      const likeRef = ref(db, `postLikes/${post.postId}/${user.uid}`);
      const saveRef = ref(db, `savedPosts/${user.uid}/${post.postId}`);

      const unsubscribeLike = onValue(likeRef, (snapshot) => {
        setLikedIds((current) => ({
          ...current,
          [post.postId]: snapshot.exists(),
        }));
      });

      const unsubscribeSave = onValue(saveRef, (snapshot) => {
        setSavedIds((current) => ({
          ...current,
          [post.postId]: snapshot.exists(),
        }));
      });

      return () => {
        unsubscribeLike();
        unsubscribeSave();
      };
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [user, posts]);

  useEffect(() => {
    if (!showSearch) return;

    let cancelled = false;
    setSearchingUsers(true);
    setSearchError("");

    get(ref(db, "usersPublic"))
      .then((snapshot) => {
        if (cancelled) return;
        const data = snapshot.val() || {};
        const list = Object.entries(data)
          .map(([uid, profile]) => ({ uid, ...(profile || {}) }))
          .filter((profile) => !profile.disabled)
          .sort((a, b) =>
            String(a.displayName || a.username || "").localeCompare(
              String(b.displayName || b.username || "")
            )
          );
        setUsers(list);
      })
      .catch((error) => {
        console.error("Vezlivo user search error:", error);
        if (!cancelled) {
          setSearchError(
            "User search could not load. Check your Firebase users read rules."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSearchingUsers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showSearch]);

  const increaseViews = async (post) => {
    if (!post.uid || !post.postId || viewedPostIds[post.postId]) return;

    setViewedPostIds((current) => ({
      ...current,
      [post.postId]: true,
    }));

    try {
      await runTransaction(
        ref(db, `posts/${post.uid}/${post.postId}`),
        (currentPost) => {
          if (!currentPost || typeof currentPost !== "object") {
            return currentPost;
          }
          const nextViews = Math.max(
            Number(currentPost.views || 0),
            Number(currentPost.viewsCount || 0)
          ) + 1;
          return {
            ...currentPost,
            views: nextViews,
            viewsCount: nextViews,
          };
        }
      );
    } catch (error) {
      setViewedPostIds((current) => ({
        ...current,
        [post.postId]: false,
      }));
      console.error("View update error:", error);
    }
  };

  const likePost = async (post) => {
    if (!user || !post.uid || !post.postId) return;

    const likeRef = ref(db, `postLikes/${post.postId}/${user.uid}`);
    const likesRef = ref(db, `posts/${post.uid}/${post.postId}/likes`);
    const wasLiked = Boolean(likedIds[post.postId]);

    try {
      if (wasLiked) {
        await set(likeRef, null);
        await runTransaction(likesRef, (value) =>
          Math.max(0, Number(value || 0) - 1)
        );
        setLikedIds((current) => ({ ...current, [post.postId]: false }));
      } else {
        await set(likeRef, {
          uid: user.uid,
          createdAt: Date.now(),
        });
        await runTransaction(likesRef, (value) =>
          Number(value || 0) + 1
        );
        setLikedIds((current) => ({ ...current, [post.postId]: true }));

        if (post.uid !== user.uid) {
          const activityRef = push(ref(db, `activities/${post.uid}`));
          await set(activityRef, {
            type: "like",
            actorId: user.uid,
            actorName: user.displayName || user.email?.split("@")[0] || "Vezlivo User",
            postId: post.postId,
            createdAt: Date.now(),
            read: false,
          });
        }
      }
    } catch (error) {
      console.error("Like error:", error);
    }
  };

  const savePost = async (post) => {
    if (!user || !post.postId) return;

    const saveRef = ref(db, `savedPosts/${user.uid}/${post.postId}`);
    const wasSaved = Boolean(savedIds[post.postId]);

    try {
      if (wasSaved) {
        await set(saveRef, null);
        setSavedIds((current) => ({ ...current, [post.postId]: false }));
      } else {
        await set(saveRef, {
          postId: post.postId,
          ownerId: post.uid,
          savedAt: Date.now(),
        });
        setSavedIds((current) => ({ ...current, [post.postId]: true }));
      }
    } catch (error) {
      console.error("Save error:", error);
    }
  };

  const copyPostLink = async (post) => {
    const shareUrl =
      window.location.origin +
      `/?post=${encodeURIComponent(`${post.uid}:${post.postId}`)}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Vezlivo video link copied.");
    } catch (error) {
      console.error("Copy link error:", error);
      alert("Could not copy the link.");
    }
  };

  const sharePost = async (post) => {
    try {
      const shareUrl =
        window.location.origin +
        `/?post=${encodeURIComponent(`${post.uid}:${post.postId}`)}`;

      if (navigator.share) {
        await navigator.share({
          title: "Vezlivo",
          text: post.caption || "Watch this video on Vezlivo.",
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert("Vezlivo video link copied.");
      }

      await runTransaction(
        ref(db, `posts/${post.uid}/${post.postId}/shares`),
        (value) => Number(value || 0) + 1
      );
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Share error:", error);
      }
    }
  };

  const openComments = (post) => {
    setSelectedPost(post);
    setShowComments(true);
  };

  const closeComments = () => {
    setShowComments(false);
    setSelectedPost(null);
  };

  const openSection = (section) => {
    setActiveSection(section);

    if (typeof onNavigate === "function") {
      onNavigate(section);
    }

    window.dispatchEvent(
      new CustomEvent("vezlivo:navigate", {
        detail: { section },
      })
    );
  };

  const normalizedSearch = search.trim().toLowerCase();

  const filteredUsers = users
    .filter((profile) => {
      if (!normalizedSearch) return false;

      const username = String(profile.username || "")
        .replace(/^@/, "")
        .toLowerCase();

      const displayName = String(profile.displayName || "").toLowerCase();

      return (
        username.includes(normalizedSearch.replace(/^@/, "")) ||
        displayName.includes(normalizedSearch)
      );
    })
    .slice(0, 30);

  const filteredPosts = posts
    .filter((post) => {
      if (!search.trim()) return true;

      const text = search.toLowerCase();

      return (
        String(post.caption || "").toLowerCase().includes(text) ||
        String(post.username || "").toLowerCase().includes(text) ||
        String(post.displayName || "").toLowerCase().includes(text)
      );
    })
    .filter((post) => {
      if (activeTab !== "Following") return true;

      if (!user) return false;

      return post.uid === user.uid || Boolean(followingIds[post.uid]);
    })
    .sort((a, b) => {
      if (activeTab === "Trending") {
        const scoreA =
          Number(a.viewsCount || 0) +
          Number(a.likesCount || 0) * 3 +
          Number(a.commentsCount || 0) * 2;

        const scoreB =
          Number(b.viewsCount || 0) +
          Number(b.likesCount || 0) * 3 +
          Number(b.commentsCount || 0) * 2;

        return scoreB - scoreA;
      }

      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });

  // Strict IntersectionObserver for single-video playback with automatic sound and zero multi-playback
  useEffect(() => {
    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        const videoEl = entry.target.querySelector("video, mux-video");
        if (!videoEl) return;

        if (entry.isIntersecting) {
          videoEl.muted = false;
          videoEl.play().catch(() => {
            videoEl.muted = true;
            videoEl.play().catch(() => {});
          });
        } else {
          videoEl.pause();
          videoEl.currentTime = 0;
          videoEl.muted = true;
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, { threshold: 0.75 });
    const postElements = document.querySelectorAll("article");
    postElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [posts, activeTab]);

  return (
    <div style={styles.page}>
      <header style={styles.floatingHeader}>
        <div style={styles.floatingTabs}>
          {["For You", "Following", "Trending"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                ...styles.tab,
                ...(activeTab === tab ? styles.activeTab : {}),
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          type="button"
          style={styles.floatingSearchBtn}
          onClick={() => setShowSearch(!showSearch)}
          aria-label="Search"
        >
          🔍
        </button>
      </header>

      {showSearch && (
        <div style={styles.searchBox}>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people by name or username"
            style={styles.searchInput}
            autoFocus
          />

          {searchingUsers && (
            <div style={styles.searchStatus}>Searching people...</div>
          )}

          {searchError && (
            <div style={styles.searchError}>{searchError}</div>
          )}

          {!searchingUsers &&
            !searchError &&
            normalizedSearch &&
            filteredUsers.length === 0 && (
              <div style={styles.searchStatus}>
                No Vezlivo users found.
              </div>
            )}

          {!normalizedSearch && (
            <div style={styles.searchStatus}>
              Type a name or username to find friends.
            </div>
          )}

          {filteredUsers.map((profile) => {
            const photo =
              profile.photoURL ||
              profile.profileURL ||
              profile.avatarURL ||
              "";

            const username = String(profile.username || "").replace(
              /^@/,
              ""
            );

            return (
              <button
                key={profile.uid}
                type="button"
                style={styles.searchUserRow}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("vezlivo:open-user-profile", {
                      detail: { uid: profile.uid },
                    })
                  )
                }
              >
                <div style={styles.searchUserAvatar}>
                  {photo ? (
                    <img
                      src={photo}
                      alt=""
                      style={styles.searchUserImage}
                    />
                  ) : (
                    (profile.displayName || username || "V")
                      .charAt(0)
                      .toUpperCase()
                  )}
                </div>

                <div style={styles.searchUserText}>
                  <strong>
                    {profile.displayName ||
                      username ||
                      "Vezlivo User"}
                  </strong>

                  <span style={styles.searchUserUsername}>
                    @{username || "vezlivo_user"}
                  </span>
                </div>

                <span style={styles.searchArrow}>›</span>
              </button>
            );
          })}
        </div>
      )}

      <main style={styles.feed}>
        {loading ? (
          <div style={styles.centerMessage}>
            <div style={styles.loading}>Loading Vezlivo...</div>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>🎬</div>
            <h2 style={styles.emptyTitle}>No videos yet</h2>
            <p style={styles.emptyText}>
              Videos posted on Vezlivo will appear here.
            </p>
            <p style={styles.emptySmall}>
              Use Create to record or upload your first video.
            </p>
            <button
              type="button"
              style={styles.emptyCreateButton}
              onClick={() => openSection("Create")}
            >
              ＋ Create
            </button>
          </div>
        ) : (
          filteredPosts.map((post) => {
            const media = post.media || post.video || post.asset || {};
            const muxPlaybackId =
              post.muxPlaybackId || post.mux_playback_id ||
              media.playbackId || media.playback_id || "";
            const rawVideoUrl =
              (typeof post.mediaURL === "string" && post.mediaURL) ||
              (typeof post.mediaUrl === "string" && post.mediaUrl) ||
              (typeof post.videoURL === "string" && post.videoURL) ||
              (typeof post.videoUrl === "string" && post.videoUrl) ||
              (typeof post.video_url === "string" && post.video_url) ||
              (typeof post.url === "string" && post.url) ||
              (typeof post.secure_url === "string" && post.secure_url) ||
              (typeof post.fileUrl === "string" && post.fileUrl) ||
              (typeof post.fileURL === "string" && post.fileURL) ||
              media.url || media.playbackUrl || media.playback_url || "";
            const videoUrl = rawVideoUrl || (muxPlaybackId
              ? `https://stream.mux.com/${muxPlaybackId}/high.mp4`
              : "");
            const posterUrl = post.coverURL || post.coverUrl || post.thumbnailURL || post.thumbnail_url || media.poster || "";
            const profileUrl = post.profileURL || post.photoURL || post.avatarURL || "";
            const postIdKey = post.postId || videoUrl;

            return (
              <article
                key={`${post.uid || "user"}-${postIdKey}`}
                style={styles.post}
              >
                <div 
                  style={styles.mediaFrame}
                  onClick={(e) => {
                    const videoEl = e.currentTarget.querySelector("video, mux-video");
                    if (videoEl) {
                      if (videoEl.paused) {
                        videoEl.play();
                      } else {
                        videoEl.pause();
                      }
                    }
                  }}
                >
                  {muxPlaybackId ? (
                    <mux-video
                      playback-id={muxPlaybackId}
                      muted
                      loop
                      playsinline
                      style={styles.video}
                      onPlay={() => increaseViews(post)}
                    ></mux-video>
                  ) : videoUrl ? (
                    <video
                      src={videoUrl}
                      poster={posterUrl || undefined}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onPlay={() => increaseViews(post)}
                      style={styles.video}
                    />
                  ) : posterUrl ? (
                    <img src={posterUrl} alt={post.caption || "Vezlivo post"} style={styles.imagePost} />
                  ) : (
                    <div style={styles.videoUnavailable}>
                      <span style={styles.videoIcon}>▶</span>
                      <span>Media unavailable</span>
                    </div>
                  )}

                  {/* Vertical Action Stack Overlay */}
                  <div style={styles.videoRightActions} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      style={styles.sideActionButton}
                      onClick={() => likePost(post)}
                    >
                      <span style={{ fontSize: "22px" }}>{likedIds[post.postId] ? "♥" : "♡"}</span>
                      <span style={styles.sideActionCount}>
                        {Number(post.likes || post.likesCount || 0)}
                      </span>
                    </button>

                    <button
                      type="button"
                      style={styles.sideActionButton}
                      onClick={() => openComments(post)}
                    >
                      <span style={{ fontSize: "20px" }}>💬</span>
                      <span style={styles.sideActionCount}>
                        {Number(post.comments || post.commentsCount || 0)}
                      </span>
                    </button>

                    <button
                      type="button"
                      style={styles.sideActionButton}
                      onClick={() => sharePost(post)}
                    >
                      <span style={{ fontSize: "20px" }}>↗️</span>
                      <span style={styles.sideActionCount}>
                        {Number(post.shares || post.sharesCount || 0)}
                      </span>
                    </button>

                    <button
                      type="button"
                      style={styles.sideActionButton}
                      onClick={() => savePost(post)}
                      aria-label="Save to favorites"
                    >
                      <span style={{ fontSize: "20px" }}>{savedIds[post.postId] ? "★" : "☆"}</span>
                    </button>

                    <button
                      type="button"
                      style={styles.sideActionButton}
                      onClick={() =>
                        setOpenMenuPostId(
                          openMenuPostId === post.postId ? null : post.postId
                        )
                      }
                      aria-label="Video options"
                    >
                      <span style={{ fontSize: "18px" }}>⋯</span>
                    </button>
                  </div>

                  {/* Bottom-Left Overlay Info */}
                  <div style={styles.videoLeftInfo} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={styles.avatarMini}>
                        {profileUrl ? (
                          <img src={profileUrl} alt="" style={styles.avatarImage} />
                        ) : (
                          <span>{(post.displayName || post.username || "V").charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <strong style={{ fontSize: "15px", color: "#ffffff", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
                        @{post.username || post.uid?.slice(0, 8) || "user"}
                      </strong>

                      {user && post.uid !== user.uid && (
                        <button
                          type="button"
                          style={{
                            border: "1px solid #ffffff",
                            backgroundColor: followingIds[post.uid] ? "rgba(255,255,255,0.25)" : "#6366f1",
                            color: "#ffffff",
                            borderRadius: "4px",
                            padding: "3px 10px",
                            fontSize: "11px",
                            fontWeight: "600",
                            cursor: "pointer",
                          }}
                          onClick={async () => {
                            const targetUid = post.uid;
                            if (!user || !targetUid || targetUid === user.uid) return;
                            const isFollowing = Boolean(followingIds[targetUid]);
                            const now = Date.now();
                            try {
                              if (isFollowing) {
                                await update(ref(db), {
                                  [`users/${user.uid}/following/${targetUid}`]: null,
                                  [`users/${targetUid}/followers/${user.uid}`]: null,
                                });
                                await runTransaction(
                                  ref(db, `users/${targetUid}/followersCount`),
                                  (value) => Math.max(0, Number(value || 0) - 1)
                                );
                                setFollowingIds((current) => ({ ...current, [targetUid]: false }));
                              } else {
                                await update(ref(db), {
                                  [`users/${user.uid}/following/${targetUid}`]: {
                                    uid: targetUid,
                                    username: post.username || "",
                                    displayName: post.displayName || "",
                                    createdAt: now,
                                  },
                                  [`users/${targetUid}/followers/${user.uid}`]: {
                                    uid: user.uid,
                                    username: user.username || "",
                                    displayName: user.displayName || "",
                                    createdAt: now,
                                  },
                                });
                                await runTransaction(
                                  ref(db, `users/${targetUid}/followersCount`),
                                  (value) => Number(value || 0) + 1
                                );
                                setFollowingIds((current) => ({ ...current, [targetUid]: true }));
                              }
                            } catch (error) {
                              console.error("Follow error:", error);
                            }
                          }}
                        >
                          {followingIds[post.uid] ? "Following" : "Follow"}
                        </button>
                      )}
                    </div>

                    {post.caption && (
                      <p style={{ margin: "0", fontSize: "14px", color: "#f4f4f5", textShadow: "0 1px 2px rgba(0,0,0,0.8)", overflowWrap: "anywhere" }}>
                        {post.caption}
                      </p>
                    )}

                    <span style={styles.views}>
                      {Number(post.views || post.viewsCount || 0)} views
                    </span>
                  </div>
                </div>

                {openMenuPostId === post.postId && (
                  <div style={styles.postMenu}>
                    <button
                      type="button"
                      style={styles.menuItem}
                      onClick={() => {
                        setOpenMenuPostId(null);
                        setReportPost(post);
                      }}
                    >
                      🚩 Report video
                    </button>

                    <button
                      type="button"
                      style={styles.menuItem}
                      onClick={() => {
                        setOpenMenuPostId(null);
                        copyPostLink(post);
                      }}
                    >
                      📋 Copy link
                    </button>

                    <button
                      type="button"
                      style={styles.menuItem}
                      onClick={() => setOpenMenuPostId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </main>

      <nav style={styles.bottomNav} aria-label="Main navigation">
        <button
          type="button"
          style={{
            ...styles.navButton,
            ...(activeSection === "Home" ? styles.navButtonActive : {}),
          }}
          onClick={() => setActiveSection("Home")}
        >
          <span style={styles.navIcon}>🏠</span>
          <span>Home</span>
        </button>

        <button
          type="button"
          style={styles.navButton}
          onClick={() => openSection("Discover")}
        >
          <span style={styles.navIcon}>🔎</span>
          <span>Discover</span>
        </button>

        <button
          type="button"
          style={styles.createButton}
          onClick={() => openSection("Create")}
          aria-label="Create"
        >
          ＋
        </button>

        <button
          type="button"
          style={styles.navButton}
          onClick={() => openSection("Activity")}
        >
          <span style={styles.navIcon}>🔔</span>
          <span>Activity</span>
        </button>

        <button
          type="button"
          style={styles.navButton}
          onClick={() => openSection("Profile")}
        >
          <span style={styles.navIcon}>👤</span>
          <span>Profile</span>
        </button>
      </nav>

      {showComments && selectedPost && (
        <Comments
          postId={selectedPost.postId}
          postOwnerId={selectedPost.uid}
          onClose={closeComments}
        />
      )}

      {reportPost && (
        <Report
          type="post"
          targetId={reportPost.postId}
          targetOwnerId={reportPost.uid}
          onClose={() => setReportPost(null)}
        />
      )}
    </div>
  );
}

const styles = {
  page: {
    position: "relative",
    width: "100vw",
    height: "100vh",
    background: "#000000",
    color: "#ffffff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    overflow: "hidden",
  },

  floatingHeader: {
    position: "absolute",
    top: "12px",
    left: 0,
    right: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 25,
    pointerEvents: "none",
  },

  floatingTabs: {
    display: "flex",
    alignItems: "center",
    gap: "18px",
    pointerEvents: "auto",
  },

  tab: {
    height: "36px",
    border: "none",
    background: "transparent",
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    padding: "0 4px",
    textShadow: "0 1px 4px rgba(0, 0, 0, 0.8)",
  },

  activeTab: {
    color: "#ffffff",
    borderBottom: "2px solid #ffffff",
  },

  floatingSearchBtn: {
    position: "absolute",
    right: "16px",
    border: "none",
    background: "transparent",
    color: "#ffffff",
    fontSize: "18px",
    cursor: "pointer",
    pointerEvents: "auto",
    textShadow: "0 1px 4px rgba(0, 0, 0, 0.8)",
  },

  searchBox: {
    position: "absolute",
    top: "54px",
    left: "12px",
    right: "12px",
    padding: "12px",
    backgroundColor: "rgba(24, 24, 27, 0.95)",
    backdropFilter: "blur(12px)",
    borderRadius: "16px",
    border: "1px solid #27272a",
    zIndex: 35,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
  },

  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #3f3f46",
    backgroundColor: "#18181b",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
  },

  searchStatus: {
    padding: "8px 4px",
    color: "#a1a1aa",
    fontSize: "13px",
  },

  searchError: {
    padding: "8px 4px",
    color: "#f87171",
    fontSize: "13px",
  },

  searchUserRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px 4px",
    border: "none",
    borderBottom: "1px solid #27272a",
    background: "transparent",
    color: "#fff",
    textAlign: "left",
    cursor: "pointer",
  },

  searchUserAvatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    backgroundColor: "#6366f1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    fontWeight: "700",
    flexShrink: 0,
  },

  searchUserImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  searchUserText: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },

  searchUserUsername: {
    color: "#a1a1aa",
    fontSize: "12px",
  },

  searchArrow: {
    color: "#71717a",
    fontSize: "18px",
  },

  feed: {
    width: "100vw",
    height: "calc(100vh - 68px)",
    overflowY: "scroll",
    scrollSnapType: "y mandatory",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  },

  post: {
    position: "relative",
    width: "100%",
    height: "100%",
    scrollSnapAlign: "start",
    scrollSnapStop: "always",
    background: "#000000",
    overflow: "hidden",
  },

  mediaFrame: {
    position: "relative",
    width: "100%",
    height: "100%",
    background: "#000000",
    overflow: "hidden",
  },

  video: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    backgroundColor: "#000000",
  },

  imagePost: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    background: "#050505",
  },

  videoUnavailable: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#121216",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    color: "#71717a",
  },

  videoIcon: {
    fontSize: "40px",
  },

  videoRightActions: {
    position: "absolute",
    right: "12px",
    bottom: "85px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "14px",
    zIndex: 10,
  },

  sideActionButton: {
    border: "none",
    background: "rgba(0, 0, 0, 0.4)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    color: "#ffffff",
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "2px",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  },

  sideActionCount: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#ffffff",
    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
  },

  videoLeftInfo: {
    position: "absolute",
    left: "0",
    bottom: "16px",
    right: "60px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    zIndex: 10,
    padding: "16px",
    background: "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.4), transparent)",
  },

  avatarMini: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    backgroundColor: "#6366f1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    fontSize: "12px",
    fontWeight: "700",
    flexShrink: 0,
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  postMenu: {
    position: "absolute",
    right: "16px",
    bottom: "70px",
    width: "160px",
    padding: "6px",
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "12px",
    boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
    zIndex: 30,
  },

  menuItem: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#ffffff",
    textAlign: "left",
    padding: "11px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
  },

  views: {
    color: "#d4d4d8",
    fontSize: "11px",
    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
  },

  centerMessage: {
    minHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "30px",
  },

  loading: {
    color: "#a1a1aa",
    fontSize: "15px",
  },

  empty: {
    minHeight: "65vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "30px",
  },

  emptyIcon: {
    fontSize: "48px",
    marginBottom: "12px",
  },

  emptyTitle: {
    margin: "4px 0",
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: "600",
  },

  emptyText: {
    color: "#a1a1aa",
    margin: "6px 0",
    fontSize: "14px",
  },

  emptySmall: {
    color: "#71717a",
    fontSize: "12px",
  },

  emptyCreateButton: {
    marginTop: "16px",
    border: "none",
    borderRadius: "20px",
    background: "linear-gradient(135deg, #6366f1, #38bdf8)",
    color: "#ffffff",
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
  },

  bottomNav: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    height: "68px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(15,15,18,.97)",
    borderTop: "1px solid #27272a",
    zIndex: 30,
    padding: "0 8px",
  },

  navButton: {
    minWidth: "56px",
    height: "50px",
    border: "none",
    background: "transparent",
    color: "#71717a",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    fontSize: "10px",
    fontWeight: "600",
    cursor: "pointer",
  },

  navButtonActive: {
    color: "#ffffff",
  },

  navIcon: {
    fontSize: "18px",
    lineHeight: 1,
  },

  createButton: {
    width: "44px",
    height: "32px",
    border: "none",
    borderRadius: "8px",
    background: "linear-gradient(135deg, #6366f1, #38bdf8)",
    color: "#ffffff",
    fontSize: "22px",
    fontWeight: "800",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
};