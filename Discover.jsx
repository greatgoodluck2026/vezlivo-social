import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "./apiClient.js";

export default function Discover({ onBack }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [videos, setVideos] = useState([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("trending");
  const [loading, setLoading] = useState(true);
  const [followingMap, setFollowingMap] = useState({});

  // Sovereign auth listener via localStorage
  useEffect(() => {
    const loadSavedUser = () => {
      try {
        const saved = localStorage.getItem("vezlivo_current_user");
        setCurrentUser(saved ? JSON.parse(saved) : null);
      } catch {
        setCurrentUser(null);
      }
    };

    loadSavedUser();
    window.addEventListener("storage", loadSavedUser);
    return () => window.removeEventListener("storage", loadSavedUser);
  }, []);

  // Fetch users from backend search endpoint
  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      try {
        const response = await apiGet(`/search/users?q=${encodeURIComponent(search)}`);
        if (!cancelled && response && response.success) {
          const mappedUsers = (response.users || []).map((u) => ({
            uid: u.uid,
            displayName: u.display_name,
            username: u.username,
            photoURL: u.profile_url,
          }));
          setUsers(mappedUsers);
        }
      } catch (error) {
        console.error("User search error:", error);
      }
    };

    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  // Fetch posts from backend API
  useEffect(() => {
    let cancelled = false;

    async function loadPosts() {
      try {
        const data = await apiGet("/posts");
        if (cancelled) return;

        const list = Array.isArray(data) ? data : (data?.posts || []);
        const normalized = list
          .filter((post) => post && typeof post === "object")
          .map((post, index) => ({
            uid: post.user_id || post.uid || "",
            postId: post.postId || post.id || String(index),
            ...post,
          }))
          .sort((a, b) => {
            const aViews = Number(a.viewsCount || a.views || 0);
            const bViews = Number(b.viewsCount || b.views || 0);
            return bViews - aViews;
          });

        setVideos(normalized);
      } catch (error) {
        console.error("Discover posts load error:", error);
        if (!cancelled) setVideos([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPosts();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentUid = currentUser?.uid || currentUser?.id;
  const normalizedSearch = search.trim().toLowerCase();

  const filteredUsers = users;

  const filteredVideos = videos.filter((video) => {
    if (!normalizedSearch) {
      return true;
    }

    const caption = String(video.caption || "").toLowerCase();
    const name = String(video.displayName || video.display_name || "").toLowerCase();
    const username = String(video.username || "").toLowerCase();

    return (
      caption.includes(normalizedSearch) ||
      name.includes(normalizedSearch) ||
      username.includes(normalizedSearch)
    );
  });

  const displayedVideos =
    activeTab === "trending" || activeTab === "videos"
      ? filteredVideos
      : [];

  const getVideoUrl = (video) => {
    return (
      video.video_url ||
      video.videoUrl ||
      video.mediaURL ||
      video.mediaUrl ||
      video.videoURL ||
      video.url ||
      ""
    );
  };

  const getUserPhoto = (user) => {
    return (
      user.photoURL ||
      user.profileURL ||
      user.profile_url ||
      user.profileUrl ||
      "https://via.placeholder.com/100"
    );
  };

  const getVideoUser = (video) => {
    const matchingUser = users.find((user) => user.uid === video.uid);

    if (matchingUser) {
      return matchingUser;
    }

    return {
      uid: video.uid,
      displayName: video.displayName || video.display_name || "Vezlivo User",
      username: video.username || "user",
      photoURL: video.photoURL || video.profileURL || video.profile_url || "",
    };
  };

  const handleFollow = async (targetUid) => {
    if (!currentUid || !targetUid || targetUid === currentUid) return;

    setFollowingMap((prev) => ({ ...prev, [targetUid]: true }));
    try {
      await apiPost("/follow", {
        userId: currentUid,
        targetUserId: targetUid,
      });
    } catch (error) {
      console.error("Follow error:", error);
      setFollowingMap((prev) => ({ ...prev, [targetUid]: false }));
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <button
          type="button"
          onClick={() => (onBack ? onBack() : window.history.back())}
          style={{ border: "none", background: "transparent", fontSize: "24px", cursor: "pointer", padding: "0 8px 0 0" }}
          aria-label="Back"
        >
          ‹
        </button>
        <div>
          <h1 style={styles.title}>Discover</h1>
          <p style={styles.subtitle}>Find people and videos on Vezlivo</p>
        </div>
      </header>

      <div style={styles.searchBox}>
        <span style={styles.searchIcon}>⌕</span>

        <input
          type="text"
          placeholder="Search people or videos..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={styles.searchInput}
        />
      </div>

      <div style={styles.tabs}>
        <button
          type="button"
          onClick={() => setActiveTab("trending")}
          style={
            activeTab === "trending"
              ? { ...styles.tabButton, ...styles.activeTab }
              : styles.tabButton
          }
        >
          Trending
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("people")}
          style={
            activeTab === "people"
              ? { ...styles.tabButton, ...styles.activeTab }
              : styles.tabButton
          }
        >
          People
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("videos")}
          style={
            activeTab === "videos"
              ? { ...styles.tabButton, ...styles.activeTab }
              : styles.tabButton
          }
        >
          Videos
        </button>
      </div>

      {activeTab === "people" && (
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>People</h2>
            <span style={styles.count}>{filteredUsers.length}</span>
          </div>

          {filteredUsers.length === 0 ? (
            <div style={styles.emptyBox}>
              <div style={styles.emptyIcon}>👤</div>
              <h3 style={styles.emptyTitle}>No people found</h3>
              <p style={styles.emptyText}>
                Try searching with another name or username.
              </p>
            </div>
          ) : (
            <div style={styles.peopleList}>
              {filteredUsers.map((user) => (
                <div key={user.uid} style={styles.personCard}>
                  <img
                    src={getUserPhoto(user)}
                    alt=""
                    style={styles.personPhoto}
                  />

                  <div style={styles.personInfo}>
                    <strong style={styles.personName}>
                      {user.displayName || "Vezlivo User"}
                    </strong>

                    <span style={styles.personUsername}>
                      @{user.username || "user"}
                    </span>
                  </div>

                  {currentUid && currentUid !== user.uid && (
                    <button
                      type="button"
                      onClick={() => handleFollow(user.uid)}
                      style={styles.followButton}
                    >
                      {followingMap[user.uid] ? "Following" : "Follow"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {(activeTab === "trending" || activeTab === "videos") && (
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>
              {activeTab === "trending" ? "Trending videos" : "Videos"}
            </h2>

            <span style={styles.count}>{displayedVideos.length}</span>
          </div>

          {loading ? (
            <div style={styles.emptyBox}>
              <div style={styles.spinner}>Loading...</div>
            </div>
          ) : displayedVideos.length === 0 ? (
            <div style={styles.emptyBox}>
              <div style={styles.emptyIcon}>🎬</div>

              <h3 style={styles.emptyTitle}>No videos yet</h3>

              <p style={styles.emptyText}>
                Videos posted on Vezlivo will appear here.
              </p>
            </div>
          ) : (
            <div style={styles.videoGrid}>
              {displayedVideos.map((video) => {
                const videoUrl = getVideoUrl(video);
                const videoUser = getVideoUser(video);

                if (!videoUrl) {
                  return null;
                }

                return (
                  <article
                    key={`${video.uid || "user"}-${video.postId}`}
                    style={styles.videoCard}
                  >
                    <video
                      src={videoUrl}
                      controls
                      playsInline
                      preload="metadata"
                      style={styles.video}
                    />

                    <div style={styles.videoInfo}>
                      <div style={styles.videoUser}>
                        <img
                          src={getUserPhoto(videoUser)}
                          alt=""
                          style={styles.videoAvatar}
                        />

                        <div>
                          <strong style={styles.videoUserName}>
                            {videoUser.displayName || "Vezlivo User"}
                          </strong>

                          <span style={styles.videoUsername}>
                            @{videoUser.username || "user"}
                          </span>
                        </div>
                      </div>

                      {video.caption && (
                        <p style={styles.caption}>{video.caption}</p>
                      )}

                      <div style={styles.videoStats}>
                        <span>
                          ❤️ {Number(video.likesCount || video.likes || 0)}
                        </span>

                        <span>
                          💬{" "}
                          {Number(
                            video.commentsCount || video.comments || 0
                          )}
                        </span>

                        <span>
                          👁️ {Number(video.viewsCount || video.views || 0)}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f7f7fb",
    padding: "20px",
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif",
    color: "#17171c",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "18px",
  },
  title: {
    margin: 0,
    fontSize: "30px",
    fontWeight: "800",
  },
  subtitle: {
    margin: "6px 0 0",
    color: "#777",
    fontSize: "14px",
  },
  searchBox: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    background: "#ffffff",
    border: "1px solid #e4e4e8",
    borderRadius: "14px",
    padding: "0 14px",
    boxSizing: "border-box",
    marginBottom: "18px",
  },
  searchIcon: {
    fontSize: "24px",
    color: "#777",
    marginRight: "8px",
  },
  searchInput: {
    width: "100%",
    height: "48px",
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: "15px",
  },
  tabs: {
    display: "flex",
    gap: "8px",
    marginBottom: "22px",
  },
  tabButton: {
    border: "none",
    background: "#ffffff",
    color: "#666",
    padding: "10px 18px",
    borderRadius: "20px",
    fontWeight: "700",
    cursor: "pointer",
  },
  activeTab: {
    background: "#6c35ff",
    color: "#ffffff",
  },
  section: {
    marginBottom: "28px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "12px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "20px",
    fontWeight: "800",
  },
  count: {
    background: "#e9e4ff",
    color: "#6c35ff",
    borderRadius: "12px",
    padding: "3px 8px",
    fontSize: "12px",
    fontWeight: "700",
  },
  peopleList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  personCard: {
    display: "flex",
    alignItems: "center",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "12px",
    border: "1px solid #e7e7eb",
  },
  personPhoto: {
    width: "52px",
    height: "52px",
    borderRadius: "50%",
    objectFit: "cover",
    marginRight: "12px",
  },
  personInfo: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    display: "block",
    fontSize: "15px",
    marginBottom: "4px",
  },
  personUsername: {
    display: "block",
    fontSize: "13px",
    color: "#777",
  },
  followButton: {
    border: "none",
    background: "#6c35ff",
    color: "#ffffff",
    borderRadius: "10px",
    padding: "9px 14px",
    fontWeight: "700",
    cursor: "pointer",
  },
  videoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
    gap: "14px",
  },
  videoCard: {
    background: "#ffffff",
    borderRadius: "16px",
    overflow: "hidden",
    border: "1px solid #e7e7eb",
  },
  video: {
    width: "100%",
    aspectRatio: "9 / 14",
    objectFit: "cover",
    display: "block",
    background: "#111",
  },
  videoInfo: {
    padding: "12px",
  },
  videoUser: {
    display: "flex",
    alignItems: "center",
    marginBottom: "9px",
  },
  videoAvatar: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    objectFit: "cover",
    marginRight: "9px",
  },
  videoUserName: {
    display: "block",
    fontSize: "13px",
    marginBottom: "3px",
  },
  videoUsername: {
    display: "block",
    fontSize: "12px",
    color: "#777",
  },
  caption: {
    margin: "8px 0",
    fontSize: "13px",
    lineHeight: "1.4",
    color: "#333",
    wordBreak: "break-word",
  },
  videoStats: {
    display: "flex",
    gap: "10px",
    color: "#777",
    fontSize: "12px",
  },
  emptyBox: {
    background: "#ffffff",
    border: "1px solid #e7e7eb",
    borderRadius: "16px",
    padding: "35px 20px",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "40px",
    marginBottom: "10px",
  },
  emptyTitle: {
    margin: "0 0 7px",
    fontSize: "18px",
  },
  emptyText: {
    margin: 0,
    color: "#777",
    fontSize: "14px",
  },
  spinner: {
    color: "#6c35ff",
    fontWeight: "700",
  },
};