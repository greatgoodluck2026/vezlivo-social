import React, { useEffect, useState } from "react";
import { apiGet } from "./apiClient.js";

function formatCount(value) {
  const number = Number(value || 0);
  if (number >= 1000000000) return `${(number / 1000000000).toFixed(1)}B`;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return String(number);
}

export default function SoundFeed({ soundId, soundName, onBack }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadSoundPosts() {
      try {
        const res = await apiGet(`/posts`);
        if (cancelled) return;
        const allPosts = Array.isArray(res) ? res : (res.posts || []);
        
        const matched = allPosts.filter((p) => {
          const pSound = p.audioId || p.soundId || "original";
          return pSound === soundId || (p.audioName || p.soundName) === soundName;
        });

        setPosts(matched);
      } catch (err) {
        console.error("Failed to load sound feed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSoundPosts();
    return () => { cancelled = true; };
  }, [soundId, soundName]);

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <button type="button" onClick={onBack} style={styles.back}>
          ←
        </button>
        <div style={styles.headerTitleContainer}>
          <strong style={styles.headerTitle}>🎵 {soundName || "Original Audio"}</strong>
          <span style={styles.headerSubtitle}>{posts.length} videos</span>
        </div>
        <span style={{ width: 24 }} />
      </header>

      {loading ? (
        <div style={styles.center}>
          <div style={styles.spinner} />
          <div style={styles.loadingText}>Loading sound feed...</div>
        </div>
      ) : posts.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎵</div>
          <div>No videos use this sound yet.</div>
        </div>
      ) : (
        <div style={styles.grid}>
          {posts.map((post) => {
            const media = post.mediaURL || post.mediaUrl || "";
            const thumb = post.thumbnailURL || post.coverURL || (post.muxPlaybackId ? `https://image.mux.com/${post.muxPlaybackId}/thumbnail.jpg?time=1` : "");

            return (
              <div key={post.postId || post.id} style={styles.card}>
                {thumb ? (
                  <img src={thumb} alt="" style={styles.thumbnail} />
                ) : media ? (
                  <video src={media} style={styles.thumbnail} preload="metadata" />
                ) : (
                  <div style={styles.noMedia}>Video</div>
                )}

                <div style={styles.videoOverlayViews}>
                  <span>▶</span>
                  <span>{formatCount(post.viewsCount || post.views)}</span>
                </div>
              </div>
            );
          })}
        </div>
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
  headerTitleContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: "15px",
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: "11px",
    color: "#a1a1aa",
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
  empty: {
    padding: "60px 20px",
    textAlign: "center",
    color: "#71717a",
    fontSize: "14px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "2px",
    paddingTop: "2px",
  },
  card: {
    position: "relative",
    width: "100%",
    aspectRatio: "3 / 4",
    backgroundColor: "#121214",
    overflow: "hidden",
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
};