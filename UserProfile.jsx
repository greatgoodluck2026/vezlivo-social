import React, { useEffect, useState } from "react";
import { onValue, ref, set } from "firebase/database";
import { database } from "./firebase.js";
import { apiGet } from "./apiClient.js";
import Comments from "./Comments.jsx";

function formatCount(value) {
  const number = Number(value || 0);
  if (number >= 1000000000) return `${(number / 1000000000).toFixed(1)}B`;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return String(number);
}

export default function UserProfile({ uid, onBack, currentUser }) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedVideoModal, setSelectedVideoModal] = useState(null);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    if (!uid) {
      setError("No user ID provided.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const timer = setTimeout(() => {
      if (!cancelled && loading) {
        setLoading(false);
      }
    }, 5000);

    async function loadUserData() {
      try {
        let profileData = null;
        try {
          const res = await apiGet(`/users/${encodeURIComponent(uid)}`);
          if (res && res.success && res.profile) {
            profileData = res.profile;
          }
        } catch (apiErr) {
          console.log("API profile fetch fallback to Firebase:", apiErr);
        }

        if (!profileData) {
          await new Promise((resolve) => {
            const profileRef = ref(database, `users/${uid}`);
            onValue(profileRef, (snapshot) => {
              if (snapshot.exists()) {
                profileData = snapshot.val() || {};
              }
              resolve();
            }, { onlyOnce: true });
          });
        }

        if (cancelled) return;

        if (profileData) {
          setProfile(profileData);
        } else {
          setProfile({ displayName: "Vezlivo User", username: "vezlivo_user" });
        }

        try {
          const postsRes = await apiGet(`/posts?userId=${encodeURIComponent(uid)}`);
          if (!cancelled) {
            const postList = Array.isArray(postsRes) ? postsRes : (postsRes.posts || []);
            const formatted = postList.map((p) => {
              const media = p.mediaURL || p.mediaUrl || p.video_url || p.videoURL || p.url || "";
              const muxPlaybackId = p.muxPlaybackId || p.mux_playback_id || "";
              
              const thumb = p.thumbnailURL || p.thumbnail_url || p.coverURL || p.coverUrl || p.cover_url || 
                (muxPlaybackId ? `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg?time=1` : "");

              return {
                ...p,
                postId: p.postId || p.id,
                mediaURL: media,
                thumbnailURL: thumb,
                viewsCount: Number(p.views || p.viewsCount || 0),
                likesCount: Number(p.likes || p.likesCount || 0),
                commentsCount: Number(p.comments || p.commentsCount || 0),
                sharesCount: Number(p.shares || p.sharesCount || 0),
                createdAt: new Date(p.created_at || p.createdAt || 0).getTime(),
              };
            });
            setPosts(formatted);
          }
        } catch (postErr) {
          console.error("Failed to load user posts:", postErr);
          if (!cancelled) setPosts([]);
        }

      } catch (err) {
        console.error("Profile load error:", err);
        if (!cancelled) setError("Could not load profile.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          clearTimeout(timer);
        }
      }
    }

    loadUserData();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uid]);

  useEffect(() => {
    if (!currentUser || !uid || currentUser.uid === uid) {
      setFollowing(false);
      return undefined;
    }

    const followingRef = ref(
      database,
      `users/${currentUser.uid}/following/${uid}`
    );

    return onValue(followingRef, (snapshot) => {
      setFollowing(snapshot.exists());
    });
  }, [currentUser, uid]);

  const toggleFollow = async () => {
    if (!currentUser || !uid || currentUser.uid === uid || followBusy) {
      return;
    }

    setFollowBusy(true);

    try {
      const myFollowingRef = ref(
        database,
        `users/${currentUser.uid}/following/${uid}`
      );
      const theirFollowersRef = ref(
        database,
        `users/${uid}/followers/${currentUser.uid}`
      );

      if (following) {
        await Promise.all([
          set(myFollowingRef, null),
          set(theirFollowersRef, null),
        ]);
        setFollowing(false);
      } else {
        await Promise.all([
          set(myFollowingRef, {
            uid,
            createdAt: Date.now(),
          }),
          set(theirFollowersRef, {
            uid: currentUser.uid,
            createdAt: Date.now(),
          }),
        ]);
        setFollowing(true);
      }
    } catch (firebaseError) {
      console.error("Vezlivo follow error:", firebaseError);
      alert("Could not update follow. Check your connection.");
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.center}>
          <div style={styles.spinner} />
          <div style={styles.loadingText}>Loading profile...</div>
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main style={styles.page}>
        <header style={styles.header}>
          <button type="button" onClick={onBack} style={styles.back}>
            ← Back
          </button>
          <strong>Profile</strong>
          <span />
        </header>
        <div style={styles.center}>{error || "User not found."}</div>
      </main>
    );
  }

  const photo =
    profile.photoURL ||
    profile.profileURL ||
    profile.profile_url ||
    profile.avatarURL ||
    "";

  const username = String(profile.username || "").replace(/^@/, "");
  const displayName =
    profile.displayName || profile.display_name || username || "Vezlivo User";
  
  const bioText = profile.bio || "";
  const totalLikes = posts.reduce((acc, p) => acc + p.likesCount, 0);

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <button type="button" onClick={onBack} style={styles.back}>
          ←
        </button>
        <strong style={styles.headerTitle}>{displayName}</strong>
        <span style={{ width: 24 }} />
      </header>

      <section style={styles.profileSection}>
        <div style={styles.avatar}>
          {photo ? (
            <img src={photo} alt="" style={styles.avatarImage} />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>

        <h1 style={styles.name}>{displayName}</h1>
        <div style={styles.username}>
          @{username || (uid ? uid.slice(0, 8) : "user")}
        </div>

        <div style={styles.statsRow}>
          <div style={styles.statItem}>
            <strong style={styles.statNumber}>{formatCount(profile.followingCount || profile.following_count || 0)}</strong>
            <span style={styles.statLabel}>Following</span>
          </div>
          <div style={styles.statItem}>
            <strong style={styles.statNumber}>{formatCount(profile.followersCount || profile.followers_count || 0)}</strong>
            <span style={styles.statLabel}>Followers</span>
          </div>
          <div style={styles.statItem}>
            <strong style={styles.statNumber}>{formatCount(totalLikes)}</strong>
            <span style={styles.statLabel}>Likes</span>
          </div>
        </div>

        {bioText ? (
          <p style={styles.bio}>{bioText}</p>
        ) : null}

        <div style={styles.actionButtonsRow}>
          {currentUser && currentUser.uid !== uid ? (
            <button
              type="button"
              onClick={toggleFollow}
              disabled={followBusy}
              style={{
                ...styles.followButton,
                ...(following ? styles.followingButton : {}),
              }}
            >
              {followBusy ? "Please wait..." : following ? "Following" : "Follow"}
            </button>
          ) : null}
        </div>
      </section>

      <div style={styles.tabsBar}>
        <div style={styles.activeTabIndicator}>
          <span style={{ fontSize: "18px" }}>🎬</span>
        </div>
        <div style={styles.inactiveTab}>
          <span style={{ fontSize: "18px", opacity: 0.5 }}>🔒</span>
        </div>
      </div>

      <section style={styles.videosSection}>
        {posts.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>📭</div>
            <div>No videos yet</div>
          </div>
        ) : (
          <div style={styles.grid}>
            {posts.map((post) => {
              const thumbnail = post.thumbnailURL;
              const media = post.mediaURL;

              return (
                <div 
                  key={post.postId || post.id} 
                  style={styles.card}
                  onClick={() => setSelectedVideoModal(post)}
                >
                  {thumbnail ? (
                    <img src={thumbnail} alt="" style={styles.thumbnail} />
                  ) : media ? (
                    <video src={media} style={styles.thumbnail} preload="metadata" />
                  ) : (
                    <div style={styles.noMedia}>Video</div>
                  )}

                  <div style={styles.videoOverlayViews}>
                    <span>▶</span>
                    <span>{formatCount(post.viewsCount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* TikTok Style Immersive Video Modal */}
      {selectedVideoModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <button style={styles.closeModalBtn} onClick={() => { setSelectedVideoModal(null); setShowComments(false); }}>✕</button>
            
            {selectedVideoModal.mediaURL ? (
              <video
                src={selectedVideoModal.mediaURL}
                autoPlay
                loop
                playsInline
                style={styles.modalVideoPlayer}
                onClick={(e) => {
                  const v = e.currentTarget;
                  if (v.paused) v.play();
                  else v.pause();
                }}
              />
            ) : (
              <div style={{ padding: 40, color: "#fff", textAlign: "center" }}>Video playback not available</div>
            )}

            {/* Right Side Actions */}
            <div style={styles.modalRightActions}>
              <div style={styles.modalAvatarContainer}>
                {photo ? <img src={photo} alt="" style={styles.modalAvatarImg} /> : <span>{displayName.charAt(0)}</span>}
              </div>
              <button style={styles.modalSideBtn}>
                <span>♥</span>
                <span style={styles.modalSideCount}>{formatCount(selectedVideoModal.likesCount)}</span>
              </button>
              <button style={styles.modalSideBtn} onClick={() => setShowComments(true)}>
                <span>💬</span>
                <span style={styles.modalSideCount}>{formatCount(selectedVideoModal.commentsCount)}</span>
              </button>
              <button style={styles.modalSideBtn}>
                <span>↗️</span>
              </button>
            </div>

            {/* Bottom Info & Comment Input Bar */}
            <div style={styles.modalBottomInfo}>
              <strong style={{ fontSize: "15px", color: "#fff" }}>{displayName}</strong>
              {selectedVideoModal.caption && (
                <p style={styles.modalCaption}>{selectedVideoModal.caption}</p>
              )}
            </div>

            <div style={styles.modalCommentBar} onClick={() => setShowComments(true)}>
              <span style={{ color: "#71717a", fontSize: "14px" }}>Add comment...</span>
              <span style={{ fontSize: "16px" }}>😊</span>
            </div>
          </div>
        </div>
      )}

      {/* Comments Drawer / Modal */}
      {showComments && selectedVideoModal && (
        <Comments
          postId={selectedVideoModal.postId || selectedVideoModal.id}
          postOwnerId={uid}
          onClose={() => setShowComments(false)}
        />
      )}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#000000",
    color: "#ffffff",
    paddingBottom: 40,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: "#000000",
    borderBottom: "1px solid #18181b",
  },
  back: {
    border: 0,
    background: "transparent",
    fontSize: 20,
    color: "#ffffff",
    cursor: "pointer",
  },
  headerTitle: {
    fontSize: "16px",
    fontWeight: "700",
  },
  center: {
    minHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid rgba(255, 255, 255, 0.2)",
    borderTop: "3px solid #fe2c55",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    color: "#a1a1aa",
    fontSize: "13px",
  },
  profileSection: {
    textAlign: "center",
    padding: "16px 16px 8px",
  },
  avatar: {
    width: 84,
    height: 84,
    margin: "0 auto 10px",
    borderRadius: "50%",
    background: "#27272a",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    fontSize: 28,
    fontWeight: 700,
    border: "2px solid #27272a",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  name: {
    margin: 0,
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  username: {
    marginTop: 2,
    fontSize: 13,
    color: "#a1a1aa",
  },
  statsRow: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "28px",
    margin: "16px 0",
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  statNumber: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#ffffff",
  },
  statLabel: {
    fontSize: "12px",
    color: "#a1a1aa",
    marginTop: "2px",
  },
  bio: {
    fontSize: "13px",
    maxWidth: "400px",
    margin: "0 auto 14px",
    color: "#d4d4d8",
    lineHeight: "1.4",
    padding: "0 12px",
    wordBreak: "break-word",
  },
  actionButtonsRow: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "10px",
  },
  followButton: {
    width: "180px",
    padding: "10px 0",
    border: 0,
    borderRadius: "4px",
    background: "#fe2c55",
    color: "#ffffff",
    fontWeight: "600",
    fontSize: "15px",
    cursor: "pointer",
  },
  followingButton: {
    background: "#27272a",
    color: "#ffffff",
    border: "1px solid #3f3f46",
  },
  tabsBar: {
    display: "flex",
    justifyContent: "center",
    borderBottom: "1px solid #27272a",
    marginTop: "10px",
  },
  activeTabIndicator: {
    padding: "10px 0",
    borderBottom: "2px solid #ffffff",
    width: "50%",
    textAlign: "center",
  },
  inactiveTab: {
    padding: "10px 0",
    width: "50%",
    textAlign: "center",
  },
  videosSection: {
    padding: "2px",
  },
  empty: {
    padding: "50px 20px",
    textAlign: "center",
    color: "#71717a",
    fontSize: "14px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "2px",
  },
  card: {
    position: "relative",
    width: "100%",
    aspectRatio: "3 / 4",
    backgroundColor: "#121214",
    overflow: "hidden",
    cursor: "pointer",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  noMedia: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#71717a",
    fontSize: "12px",
  },
  videoOverlayViews: {
    position: "absolute",
    bottom: "6px",
    left: "6px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    fontWeight: "600",
    color: "#ffffff",
    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "#000000",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    position: "relative",
    width: "100%",
    maxWidth: "480px",
    height: "100vh",
    backgroundColor: "#000000",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  closeModalBtn: {
    position: "absolute",
    top: "16px",
    left: "16px",
    zIndex: 30,
    background: "transparent",
    color: "#ffffff",
    border: "none",
    fontSize: "24px",
    cursor: "pointer",
  },
  modalVideoPlayer: {
    width: "100%",
    height: "100vh",
    objectFit: "cover",
    display: "block",
    backgroundColor: "#000000",
  },
  modalRightActions: {
    position: "absolute",
    right: "12px",
    bottom: "90px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
    zIndex: 20,
  },
  modalAvatarContainer: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    backgroundColor: "#27272a",
    overflow: "hidden",
    border: "2px solid #ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: "700",
    color: "#ffffff",
  },
  modalAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  modalSideBtn: {
    background: "transparent",
    border: "none",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "3px",
    fontSize: "24px",
    cursor: "pointer",
    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
  },
  modalSideCount: {
    fontSize: "12px",
    fontWeight: "600",
  },
  modalBottomInfo: {
    position: "absolute",
    left: "16px",
    bottom: "75px",
    right: "70px",
    zIndex: 20,
    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
  },
  modalCaption: {
    margin: "4px 0 0 0",
    fontSize: "14px",
    color: "#f4f4f5",
    lineHeight: "1.3",
  },
  modalCommentBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60px",
    backgroundColor: "rgba(18, 18, 20, 0.95)",
    borderTop: "1px solid #27272a",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    zIndex: 20,
    cursor: "pointer",
  },
};