import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { get, onValue, push, ref, runTransaction, set, update } from "firebase/database";
import { auth, database as db } from "./firebase.js";
import Comments from "./Comments";
import Report from "./Report.jsx";
import SoundFeed from "./SoundFeed.jsx";
import { apiGet, apiPost } from "./apiClient.js"; 
import '@mux/mux-video';

export default function Home({ onNavigate, onCreate, onProfile, onActivity, onDiscover }) {
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
  
  // Clean Modal & Toast states
  const [deleteConfirmPost, setDeleteConfirmPost] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Save scroll position when scrolling the feed
  useEffect(() => {
    const feedElement = document.querySelector("main[style*='overflowY']");
    if (!feedElement) return;

    const handleScroll = () => {
      sessionStorage.setItem("vezlivo_home_scroll", feedElement.scrollTop);
    };

    feedElement.addEventListener("scroll", handleScroll);
    return () => feedElement.removeEventListener("scroll", handleScroll);
  }, []);

  // Restore scroll position once posts load
  useEffect(() => {
    if (loading || posts.length === 0) return;
    const savedScroll = sessionStorage.getItem("vezlivo_home_scroll");
    if (savedScroll) {
      const feedElement = document.querySelector("main[style*='overflowY']");
      if (feedElement) {
        feedElement.scrollTop = Number(savedScroll);
      }
    }
  }, [loading, posts]);

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

  // Load user liked states from backend database so they persist on refresh
  useEffect(() => {
    if (!user) {
      setLikedIds({});
      setSavedIds({});
      return;
    }

    async function fetchUserLikes() {
      try {
        const res = await apiGet(`/users/${user.uid}/likes`);
        if (res && res.success && res.likedIds) {
          setLikedIds(res.likedIds);
        }
      } catch (err) {
        console.error("Failed to fetch user likes:", err);
      }
    }

    fetchUserLikes();
  }, [user, posts]);

  useEffect(() => {
    if (!user || posts.length === 0) {
      return undefined;
    }

    const unsubscribers = posts.map((post) => {
      const postId = post.postId || post.id;
      if (!postId) return () => {};

      const saveRef = ref(db, `savedPosts/${user.uid}/${postId}`);
      const unsubscribeSave = onValue(saveRef, (snapshot) => {
        setSavedIds((current) => ({
          ...current,
          [postId]: snapshot.exists(),
        }));
      });

      return () => {
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
    const postOwnerUid = post.user_id || post.uid;
    const postId = post.postId || post.id;
    if (!postOwnerUid || !postId || viewedPostIds[postId]) return;

    setViewedPostIds((current) => ({
      ...current,
      [postId]: true,
    }));

    try {
      await runTransaction(
        ref(db, `posts/${postOwnerUid}/${postId}`),
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
        [postId]: false,
      }));
      console.error("View update error:", error);
    }
  };

 const likePost = async (post) => {
    const postId = String(post.id || post.postId || "");
    if (!user || !postId) return;

    const wasLiked = Boolean(likedIds[postId]);
    const newAction = wasLiked ? "unlike" : "like";

    // 1. Instant optimistic UI update
    setLikedIds((current) => ({ ...current, [postId]: !wasLiked }));
    setPosts((currentPosts) =>
      currentPosts.map((p) => {
        const pId = String(p.id || p.postId || "");
        if (pId === postId) {
          const currentCount = Number(p.likes || p.likes_count || 0);
          const nextCount = wasLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
          return { ...p, likes: nextCount, likes_count: nextCount };
        }
        return p;
      })
    );

    try {
      const res = await apiPost("/like", {
        userId: user.uid,
        postId: postId,
        action: newAction,
      });

      if (!res.success) {
        // Revert if backend rejects
        setLikedIds((current) => ({ ...current, [postId]: wasLiked }));
        setPosts((currentPosts) =>
          currentPosts.map((p) => {
            const pId = String(p.id || p.postId || "");
            if (pId === postId) {
              const currentCount = Number(p.likes || p.likes_count || 0);
              const nextCount = wasLiked ? currentCount + 1 : Math.max(0, currentCount - 1);
              return { ...p, likes: nextCount, likes_count: nextCount };
            }
            return p;
          })
        );
      }
    } catch (error) {
      console.error("Like error:", error);
      // Revert on error
      setLikedIds((current) => ({ ...current, [postId]: wasLiked }));
    }
  };
  const savePost = async (post) => {
    const postId = post.postId || post.id;
    if (!user || !postId) return;

    const wasSaved = Boolean(savedIds[postId]);
    const action = wasSaved ? "unsave" : "save";

    setSavedIds((current) => ({ ...current, [postId]: !wasSaved }));

    try {
      const res = await apiPost("/save", {
        userId: user.uid,
        postId: postId,
        action: action,
      });

      if (!res.success) {
        setSavedIds((current) => ({ ...current, [postId]: wasSaved }));
      }
    } catch (error) {
      console.error("Save error:", error);
      setSavedIds((current) => ({ ...current, [postId]: wasSaved }));
    }
  };

  const copyPostLink = async (post) => {
    const postOwnerUid = post.user_id || post.uid;
    const postId = post.postId || post.id;
    const shareUrl =
      window.location.origin +
      `/?post=${encodeURIComponent(`${postOwnerUid}:${postId}`)}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setToastMessage("Vezlivo video link copied.");
    } catch (error) {
      console.error("Copy link error:", error);
      setToastMessage("Could not copy the link.");
    }
    setTimeout(() => setToastMessage(""), 3000);
  };

  const sharePost = async (post) => {
    const postOwnerUid = post.user_id || post.uid;
    const postId = post.postId || post.id;
    try {
      const shareUrl =
        window.location.origin +
        `/?post=${encodeURIComponent(`${postOwnerUid}:${postId}`)}`;

      if (navigator.share) {
        await navigator.share({
          title: "Vezlivo",
          text: post.caption || "Watch this video on Vezlivo.",
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setToastMessage("Vezlivo video link copied.");
      }

      await runTransaction(
        ref(db, `posts/${postOwnerUid}/${postId}/shares`),
        (value) => Number(value || 0) + 1
      );
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Share error:", error);
      }
    }
    setTimeout(() => setToastMessage(""), 3000);
  };

  const handleDeletePostClick = (post) => {
    setOpenMenuPostId(null);
    setDeleteConfirmPost(post);
  };

  const confirmDeleteVideo = async () => {
    if (!deleteConfirmPost) return;
    const targetId = deleteConfirmPost.id || deleteConfirmPost.postId;
    setDeleteConfirmPost(null);

    try {
      const res = await apiPost(`/posts/${targetId}/delete`, {});
      if (res && res.success) {
        setPosts((currentPosts) =>
          currentPosts.filter((p) => p.id !== targetId && p.postId !== targetId)
        );
        setToastMessage("Video deleted successfully.");
      } else {
        setToastMessage("Could not delete the video.");
      }
    } catch (error) {
      console.error("Delete error:", error);
      setToastMessage("Error deleting video.");
    }
    setTimeout(() => setToastMessage(""), 3000);
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

    const lower = section.toLowerCase();
    if (lower === "create" && typeof onCreate === "function") {
      onCreate();
      return;
    }
    if (lower === "profile" && typeof onProfile === "function") {
      onProfile();
      return;
    }
    if (lower === "activity" && typeof onActivity === "function") {
      onActivity();
      return;
    }
    if (lower === "discover" && typeof onDiscover === "function") {
      onDiscover();
      return;
    }

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

      const postOwnerUid = post.user_id || post.uid;
      return postOwnerUid === user.uid || Boolean(followingIds[postOwnerUid]);
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
      {/* Global CSS injection to force Mux & HTML videos to cover 100% screen with zero cutoff boxes */}
      <style>{`
        mux-video, video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          background-color: #000000 !important;
        }
        mux-video::part(video) {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        @keyframes spinner-rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .vezlivo-loader {
          width: 42px;
          height: 42px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-top: 4px solid #38bdf8;
          border-right: 4px solid #6366f1;
          border-radius: 50%;
          animation: spinner-rotate 0.8s linear infinite;
        }
      `}</style>

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
            <div className="vezlivo-loader"></div>
            <span style={{ marginTop: "12px", color: "#a1a1aa", fontSize: "14px", fontWeight: "600" }}>
              Loading feed...
            </span>
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
            const profileUrl = post.profile_url || post.profileURL || post.photoURL || post.avatarURL || "";
           const postIdKey = String(post.id || post.postId || "");
            const postOwnerUid = post.user_id || post.uid;

            const isOwner = user && postOwnerUid === user.uid;
            const isLiked = Boolean(likedIds[postIdKey]);

            return (
              <article
                key={`${postOwnerUid || "user"}-${postIdKey}`}
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
                      onError={(e) => {
                        console.error("Mux stream failed (404/Invalid):", e);
                        e.target.style.display = "none";
                      }}
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
                      onError={(e) => {
                        console.error("Video load error:", e);
                        e.target.style.display = "none";
                      }}
                    />
                  ) : posterUrl ? (
                    <img src={posterUrl} alt={post.caption || "Vezlivo post"} style={styles.imagePost} />
                  ) : (
                    <div style={styles.videoUnavailable}>
                      <span style={styles.videoIcon}>▶</span>
                      <span>Media unavailable</span>
                    </div>
                  )}

                  {/* Right Action Buttons - Clean Vezlivo Style */}
                  <div style={styles.videoRightActions} onClick={(e) => e.stopPropagation()}>
                    {/* 1. Floating Avatar */}
                    <div 
                      style={styles.floatingAvatarWrapper}
                      onClick={(e) => {
                        e.stopPropagation();
                        const targetUid = post.user_id || post.uid;
                        if (!targetUid) return;
                        if (user && targetUid === user.uid) {
                          if (typeof onProfile === "function") onProfile();
                          else window.dispatchEvent(new CustomEvent("vezlivo:navigate", { detail: { section: "Profile" } }));
                        } else {
                          window.dispatchEvent(new CustomEvent("vezlivo:open-user-profile", { detail: { uid: targetUid } }));
                        }
                      }}
                    >
                      <div style={styles.avatarMiniLarge}>
                        {profileUrl ? (
                          <img src={profileUrl} alt="Profile" style={styles.avatarImage} />
                        ) : (
                          <span>{(post.display_name || post.displayName || post.username || "V").charAt(0).toUpperCase()}</span>
                        )}
                      </div>

                      {/* Follow Plus Badge */}
                      {user && postOwnerUid && postOwnerUid !== user.uid && !followingIds[postOwnerUid] && (
                        <button 
                          style={styles.vezlivoPlusButton} 
                          aria-label="Follow user"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const now = Date.now();
                            try {
                              await update(ref(db), {
                                [`users/${user.uid}/following/${postOwnerUid}`]: {
                                  uid: postOwnerUid,
                                  username: post.username || "",
                                  displayName: post.display_name || post.displayName || "",
                                  createdAt: now,
                                },
                                [`users/${postOwnerUid}/followers/${user.uid}`]: {
                                  uid: user.uid,
                                  username: post.username || "",
                                  displayName: post.display_name || post.displayName || "",
                                  createdAt: now,
                                },
                              });
                              await runTransaction(
                                ref(db, `users/${postOwnerUid}/followersCount`),
                                (value) => Number(value || 0) + 1
                              );
                              setFollowingIds((current) => ({ ...current, [postOwnerUid]: true }));
                            } catch (error) {
                              console.error("Follow error:", error);
                            }
                          }}
                        >
                          ＋
                        </button>
                      )}
                    </div>

                    {/* 2. Like Button */}
                    <button
                      type="button"
                      style={styles.vezlivoActionBtn}
                      onClick={() => likePost(post)}
                    >
                      <span style={{ 
                        fontSize: "28px",
                        color: isLiked ? "#38bdf8" : "#ffffff",
                        filter: isLiked ? "drop-shadow(0 2px 6px rgba(56, 189, 248, 0.5))" : "drop-shadow(0 1px 3px rgba(0,0,0,0.8))"
                      }}>
                        {isLiked ? "♥" : "♡"}
                      </span>
                      <span style={styles.sideActionCount}>
                        {Number(post.likes || post.likes_count || 0)}
                      </span>
                    </button>

                    {/* 3. Comment Button */}
                    <button
                      type="button"
                      style={styles.vezlivoActionBtn}
                      onClick={() => openComments(post)}
                    >
                      <span style={{ fontSize: "26px", color: "#ffffff", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}>💬</span>
                      <span style={styles.sideActionCount}>
                        {Number(post.comments || post.commentsCount || 0)}
                      </span>
                    </button>

                    {/* 4. Share & Options Menu Button */}
                    <button
                      type="button"
                      style={styles.vezlivoActionBtn}
                      onClick={() =>
                        setOpenMenuPostId(
                          openMenuPostId === postIdKey ? null : postIdKey
                        )
                      }
                      aria-label="Share and options"
                    >
                      <span style={{ fontSize: "26px", color: "#ffffff", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}>↗️</span>
                      <span style={styles.sideActionCount}>
                        {Number(post.shares || post.sharesCount || 0)}
                      </span>
                    </button>

                    {/* 5. Save/Favorite Button */}
                    <button
                      type="button"
                      style={styles.vezlivoActionBtn}
                      onClick={() => savePost(post)}
                      aria-label="Save to favorites"
                    >
                      <span style={{ fontSize: "26px", color: savedIds[post.postId || post.id] ? "#38bdf8" : "#ffffff", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}>
                        {savedIds[post.postId || post.id] ? "★" : "☆"}
                      </span>
                      <span style={styles.sideActionCount}>Save</span>
                    </button>

                    {/* 6. Rotating Sound Disc */}
                    <div
                      style={styles.soundDiscButton}
                      onClick={() => {
                        const soundName = post.audioName || post.soundName || "Original Audio";
                        const soundId = post.audioId || post.soundId || "original";
                        window.dispatchEvent(
                          new CustomEvent("vezlivo:open-sound", {
                            detail: { soundId, soundName },
                          })
                        );
                      }}
                      title="View sound feed"
                    >
                      <div style={styles.soundDiscInner}>
                        {profileUrl ? (
                          <img src={profileUrl} alt="" style={styles.avatarImage} />
                        ) : (
                          <span>🎵</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom-Left Clean Text Overlay */}
                  <div style={styles.videoLeftInfo}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <strong style={{ fontSize: "15px", color: "#ffffff", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
                        {post.display_name || post.displayName || post.username || "Vezlivo User"}
                      </strong>
                      <span style={{ fontSize: "12px", color: "#d4d4d8", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
                        {post.username ? (post.username.startsWith("@") ? post.username : `@${post.username}`) : "@user"}
                      </span>
                    </div>

                    {post.caption && (
                      <p style={{ margin: "2px 0 0 0", fontSize: "14px", color: "#f4f4f5", textShadow: "0 1px 2px rgba(0,0,0,0.8)", overflowWrap: "anywhere" }} onClick={(e) => e.stopPropagation()}>
                        {post.caption}
                      </p>
                    )}

                    {/* Audio Track Badge */}
                    <div 
                      style={styles.audioBadge} 
                      onClick={(e) => {
                        e.stopPropagation();
                        const soundName = post.audioName || post.soundName || "Original Audio";
                        const soundId = post.audioId || post.soundId || "original";
                        window.dispatchEvent(
                          new CustomEvent("vezlivo:open-sound", {
                            detail: { soundId, soundName },
                          })
                        );
                      }}
                    >
                      <span style={{ fontSize: "12px" }}>🎵</span>
                      <span style={styles.audioText}>{post.audioName || post.soundName || "Original Audio"}</span>
                    </div>

                    <span style={styles.views}>
                      {Number(post.views || post.viewsCount || 0)} views
                    </span>
                  </div>
                </div>

                {/* Combined Share & Options Menu Sheet */}
                {openMenuPostId === postIdKey && (
                  <div style={styles.postMenu}>
                    <button
                      type="button"
                      style={styles.menuItem}
                      onClick={() => {
                        setOpenMenuPostId(null);
                        sharePost(post);
                      }}
                    >
                      ↗️ Share Video
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

                    {isOwner && (
                      <button
                        type="button"
                        style={{ ...styles.menuItem, color: "#f87171", fontWeight: "700" }}
                        onClick={() => handleDeletePostClick(post)}
                      >
                        🗑️ Delete Video
                      </button>
                    )}

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

      {deleteConfirmPost && (
        <div style={styles.modalOverlay}>
          <div style={styles.whiteModalCard}>
            <h3 style={styles.modalTitle}>Delete video?</h3>
            <p style={styles.modalText}>
              Are you sure you want to delete this video? This cannot be undone.
            </p>
            <div style={styles.modalButtons}>
              <button
                type="button"
                style={styles.modalCancelBtn}
                onClick={() => setDeleteConfirmPost(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={styles.modalDeleteBtn}
                onClick={confirmDeleteVideo}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div style={styles.toastCard}>
          {toastMessage}
        </div>
      )}

      <nav style={styles.bottomNav} aria-label="Main navigation">
        <button
          type="button"
          style={{
            ...styles.navButton,
            ...(activeSection === "Home" ? styles.navButtonActive : {}),
          }}
          onClick={() => {
            setActiveSection("Home");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
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
          postId={selectedPost.postId || selectedPost.id}
          postOwnerId={selectedPost.user_id || selectedPost.uid}
          onClose={closeComments}
        />
      )}

      {reportPost && (
        <Report
          type="post"
          targetId={reportPost.postId || reportPost.id}
          targetOwnerId={reportPost.user_id || reportPost.uid}
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
    position: "relative",
    background: "#000000",
  },

  post: {
    position: "relative",
    width: "100vw",
    height: "calc(100vh - 68px)",
    scrollSnapAlign: "start",
    scrollSnapStop: "always",
    background: "#000000",
    overflow: "hidden",
  },

 mediaFrame: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    background: "#000000",
    overflow: "hidden",
  },

  video: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    backgroundColor: "#000000",
    position: "absolute",
    inset: 0,
  },

  videoLeftInfo: {
    position: "absolute",
    left: "0",
    bottom: "75px",
    right: "70px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    zIndex: 10,
    padding: "12px 16px",
    background: "transparent",
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
    gap: "10px",
    zIndex: 20,
  },

  floatingAvatarWrapper: {
    position: "relative",
    width: "44px",
    height: "44px",
    marginBottom: "4px",
    cursor: "pointer",
  },

  avatarMiniLarge: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    backgroundColor: "#6366f1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    border: "2px solid #ffffff",
  },

  vezlivoPlusButton: {
    position: "absolute",
    bottom: "-2px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1, #38bdf8)",
    color: "#ffffff",
    border: "2px solid #000000",
    fontSize: "12px",
    fontWeight: "800",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,210,255,0.4)",
  },

  vezlivoActionBtn: {
    border: "none",
    background: "transparent",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "2px",
    cursor: "pointer",
    padding: 0,
  },

  sideActionCount: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#ffffff",
    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
  },

  soundDiscButton: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #18181b, #27272a)",
    border: "2px solid #3f3f46",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    marginTop: "2px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
    animation: "spin 4s linear infinite",
  },

  soundDiscInner: {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    color: "#ffffff",
    backgroundColor: "#6366f1",
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  audioBadge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    padding: "4px 10px",
    borderRadius: "12px",
    width: "fit-content",
    cursor: "pointer",
    marginTop: "4px",
    backdropFilter: "blur(4px)",
  },

  audioText: {
    fontSize: "12px",
    color: "#ffffff",
    fontWeight: "600",
    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
  },

  postMenu: {
    position: "absolute",
    right: "16px",
    bottom: "70px",
    width: "165px",
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
    zIndex: 2147483647,
    pointerEvents: "auto",
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
    pointerEvents: "auto",
    zIndex: 2147483647,
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
    pointerEvents: "auto",
    zIndex: 2147483647,
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    padding: "20px",
  },

  whiteModalCard: {
    width: "100%",
    maxWidth: "320px",
    backgroundColor: "#ffffff",
    color: "#000000",
    borderRadius: "16px",
    padding: "24px",
    textAlign: "center",
    boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
  },

  modalTitle: {
    margin: "0 0 8px 0",
    fontSize: "18px",
    fontWeight: "700",
    color: "#111111",
  },

  modalText: {
    margin: "0 0 20px 0",
    fontSize: "14px",
    color: "#555555",
    lineHeight: "1.4",
  },

  modalButtons: {
    display: "flex",
    gap: "12px",
  },

  modalCancelBtn: {
    flex: 1,
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    backgroundColor: "#f3f4f6",
    color: "#374151",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },

  modalDeleteBtn: {
    flex: 1,
    padding: "12px",
    borderRadius: "10px",
    border: "none",
    backgroundColor: "#ef4444",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },

  toastCard: {
    position: "fixed",
    bottom: "90px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#ffffff",
    color: "#000000",
    padding: "12px 24px",
    borderRadius: "24px",
    fontSize: "14px",
    fontWeight: "600",
    boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
    zIndex: 99998,
  },
};