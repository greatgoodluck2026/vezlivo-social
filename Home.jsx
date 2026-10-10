import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { get, onValue, push, ref, runTransaction, set, update } from "firebase/database";
import { auth, database as db } from "./firebase.js";
import Comments from "./Comments";
import Report from "./Report.jsx";

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
    const postsRef = ref(db, "posts");

    const unsubscribe = onValue(postsRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        setPosts([]);
        setLoading(false);
        return;
      }

      const allPosts = [];

      Object.entries(data).forEach(([uid, userPosts]) => {
        if (!userPosts || typeof userPosts !== "object") return;

        Object.entries(userPosts).forEach(([postId, post]) => {
          if (!post || typeof post !== "object") return;

          allPosts.push({
            ...post,
            uid,
            postId,
          });
        });
      });

      allPosts.sort(
        (a, b) =>
          Number(b.createdAt || 0) - Number(a.createdAt || 0)
      );

      setPosts(allPosts);
      setLoading(false);
    });

    return () => unsubscribe();
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

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.logo}>V</div>
          <span style={styles.brandText}>Vezlivo</span>
        </div>

        <div style={styles.headerButtons}>

          <button
            type="button"
            style={styles.iconButton}
            onClick={() => setShowSearch(!showSearch)}
            aria-label="Search"
          >
            🔍
          </button>

          <button
            type="button"
            style={styles.iconButton}
            onClick={() => openSection("Inbox")}
            aria-label="Inbox"
          >
            💬
          </button>

          <button
            type="button"
            style={styles.iconButton}
            onClick={() => openSection("Activity")}
            aria-label="Notifications"
          >
            🔔
          </button>
        </div>
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

      <div style={styles.tabs}>
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
            const videoUrl =
              post.mediaURL || post.videoURL || post.videoUrl || post.url;

            const profileUrl =
              post.profileURL || post.photoURL;

            return (
              <article
                key={`${post.uid}-${post.postId}`}
                style={styles.post}
              >
                <div style={styles.userRow}>
                  <div style={styles.avatar}>
                    {profileUrl ? (
                      <img
                        src={profileUrl}
                        alt=""
                        style={styles.avatarImage}
                      />
                    ) : (
                      <span>
                        {(
                          post.displayName ||
                          post.username ||
                          "V"
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div style={styles.userDetails}>
                    <strong style={styles.displayName}>
                      {post.displayName ||
                        post.username ||
                        "Vezlivo User"}
                    </strong>

                    <span style={styles.username}>
                      @{post.username || post.uid.slice(0, 8)}
                    </span>
                  </div>

                  {user && post.uid !== user.uid && (
                    <button
                      type="button"
                      style={{
                        ...styles.followButton,
                        ...(followingIds[post.uid] ? styles.followingButton : {}),
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

                            setFollowingIds((current) => ({
                              ...current,
                              [targetUid]: false,
                            }));
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

                            const activityRef = push(ref(db, `activities/${targetUid}`));
                            await set(activityRef, {
                              type: "follow",
                              actorId: user.uid,
                              actorName:
                                user.displayName ||
                                user.email?.split("@")[0] ||
                                "Vezlivo User",
                              actorUsername: user.username || "",
                              createdAt: now,
                              read: false,
                            });

                            setFollowingIds((current) => ({
                              ...current,
                              [targetUid]: true,
                            }));
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

                {videoUrl ? (
                  <video
                    src={videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    onPlay={() => increaseViews(post)}
                    style={styles.video}
                  />
                ) : (
                  <div style={styles.videoUnavailable}>
                    <span style={styles.videoIcon}>🎬</span>
                    <span>Video unavailable</span>
                  </div>
                )}

                {post.caption && (
                  <p style={styles.caption}>{post.caption}</p>
                )}

                <div style={styles.actions}>
                  <button
                    type="button"
                    style={{
                      ...styles.actionButton,
                      ...(likedIds[post.postId] ? styles.actionButtonActive : {}),
                    }}
                    onClick={() => likePost(post)}
                  >
                    {likedIds[post.postId] ? "♥" : "♡"}{" "}
                    {Number(post.likes || post.likesCount || 0)}
                  </button>

                  <button
                    type="button"
                    style={styles.actionButton}
                    onClick={() => openComments(post)}
                  >
                    💬 {Number(post.comments || post.commentsCount || 0)}
                  </button>

                  <button
                    type="button"
                    style={styles.actionButton}
                    onClick={() => sharePost(post)}
                  >
                    ↗️ {Number(post.shares || post.sharesCount || 0)}
                  </button>

                  <button
                    type="button"
                    style={{
                      ...styles.actionButton,
                      ...(savedIds[post.postId] ? styles.actionButtonActive : {}),
                    }}
                    onClick={() => savePost(post)}
                    aria-label={savedIds[post.postId] ? "Remove from favorites" : "Add to favorites"}
                  >
                    {savedIds[post.postId] ? "★" : "☆"}
                  </button>

                  <button
                    type="button"
                    style={styles.actionButton}
                    onClick={() => copyPostLink(post)}
                    aria-label="Copy video link"
                  >
                    📋
                  </button>

                  <button
                    type="button"
                    style={styles.moreButton}
                    onClick={() =>
                      setOpenMenuPostId(
                        openMenuPostId === post.postId ? null : post.postId
                      )
                    }
                    aria-label="Video options"
                  >
                    ⋯
                  </button>

                  <span style={styles.views}>
                    {Number(post.views || post.viewsCount || 0)} views
                  </span>
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

      <nav
        style={styles.bottomNav}
        aria-label="Main navigation"
      >
        <button
          type="button"
          style={{
            ...styles.navButton,
            ...(activeSection === "Home"
              ? styles.navButtonActive
              : {}),
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
    minHeight: "100vh",
    backgroundColor: "#09090b", // Rich deep zinc/black
    color: "#ffffff",
    paddingBottom: "88px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },

  header: {
    height: "62px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 15px",
    backgroundColor: "#09090b",
    borderBottom: "1px solid #27272a",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  logo: {
    width: "38px",
    height: "38px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(135deg, #6366f1, #38bdf8)", // Sleek Indigo to Sky Blue
    fontSize: "22px",
    fontWeight: "900",
  },

  brandText: {
    fontSize: "22px",
    fontWeight: "800",
    letterSpacing: "-0.5px",
  },

  headerButtons: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },

  iconButton: {
    width: "40px",
    height: "40px",
    border: "none",
    background: "transparent",
    color: "#a1a1aa",
    fontSize: "18px",
    cursor: "pointer",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  searchBox: {
    padding: "12px 16px",
    backgroundColor: "#121216",
    borderBottom: "1px solid #27272a",
  },

  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid #27272a",
    backgroundColor: "#18181b",
    color: "#ffffff",
    fontSize: "15px",
    outline: "none",
  },

  searchStatus: {
    padding: "10px 4px",
    color: "#71717a",
    fontSize: "13px",
  },

  searchError: {
    padding: "10px 4px",
    color: "#f87171",
    fontSize: "13px",
  },

  searchUserRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 6px",
    border: "none",
    borderBottom: "1px solid #1e1e24",
    background: "transparent",
    color: "#fff",
    textAlign: "left",
    cursor: "pointer",
  },

  searchUserAvatar: {
    width: "40px",
    height: "40px",
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
    gap: "2px",
  },

  searchUserUsername: {
    color: "#71717a",
    fontSize: "12px",
  },

  searchArrow: {
    color: "#71717a",
    fontSize: "20px",
  },

  tabs: {
    height: "46px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "28px",
    borderBottom: "1px solid #27272a",
    backgroundColor: "#09090b",
  },

  tab: {
    height: "46px",
    border: "none",
    background: "transparent",
    color: "#71717a",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    padding: "0 4px",
  },

  activeTab: {
    color: "#ffffff",
    borderBottom: "2px solid #6366f1",
  },

  feed: {
    width: "100%",
    maxWidth: "600px",
    margin: "0 auto",
  },

  post: {
    borderBottom: "1px solid #27272a",
    paddingBottom: "16px",
    marginBottom: "12px",
    backgroundColor: "#0f0f12",
  },

  userRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px",
  },

  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    backgroundColor: "#6366f1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    fontSize: "16px",
    fontWeight: "700",
    flexShrink: 0,
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  userDetails: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },

  displayName: {
    fontSize: "14px",
    fontWeight: "600",
  },

  username: {
    fontSize: "12px",
    color: "#71717a",
  },

  followButton: {
    border: "1px solid #6366f1",
    backgroundColor: "transparent",
    color: "#818cf8",
    borderRadius: "8px",
    padding: "6px 14px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  followingButton: {
    borderColor: "#3f3f46",
    backgroundColor: "#18181b",
    color: "#e4e4e7",
  },

  video: {
    width: "100%",
    maxHeight: "600px",
    display: "block",
    backgroundColor: "#000000",
    objectFit: "contain",
  },

  videoUnavailable: {
    height: "280px",
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

  caption: {
    margin: "12px 16px 0",
    fontSize: "14px",
    lineHeight: "1.5",
    color: "#e4e4e7",
  },

  actions: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "12px 16px 0",
  },

  actionButton: {
    border: "none",
    background: "transparent",
    color: "#a1a1aa",
    fontSize: "14px",
    padding: 0,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },

  actionButtonActive: {
    color: "#f43f5e",
  },

  moreButton: {
    border: "none",
    background: "transparent",
    color: "#a1a1aa",
    fontSize: "20px",
    padding: "0 2px",
    cursor: "pointer",
    lineHeight: 1,
  },

  postMenu: {
    margin: "4px 16px 0",
    padding: "6px",
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "12px",
    boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
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
    marginLeft: "auto",
    color: "#71717a",
    fontSize: "12px",
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
    background:
      "linear-gradient(135deg, #6366f1, #38bdf8)",
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
    height: "64px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#0f0f12",
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
    background:
      "linear-gradient(135deg, #6366f1, #38bdf8)",
    color: "#ffffff",
    fontSize: "22px",
    fontWeight: "800",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
};