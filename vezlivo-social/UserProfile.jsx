import React, { useEffect, useState } from "react";
import {
  get,
  onValue,
  ref,
  set,
} from "firebase/database";
import { auth, database } from "./firebase.js";

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

  useEffect(() => {
    if (!uid) return undefined;

    setLoading(true);
    setError("");

    const profileRef = ref(database, `users/${uid}`);
    const unsubscribe = onValue(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setProfile(snapshot.val() || {});
        } else {
          setProfile(null);
          setError("This user could not be found.");
        }
        setLoading(false);
      },
      (firebaseError) => {
        console.error("Vezlivo user profile error:", firebaseError);
        setError("Unable to load this profile.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;

    const postsRef = ref(database, `posts/${uid}`);
    const unsubscribe = onValue(
      postsRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        const list = Object.entries(data)
          .map(([postId, post]) => ({
            ...(post || {}),
            postId,
            uid,
          }))
          .filter((post) => post && typeof post === "object")
          .sort(
            (a, b) =>
              Number(b.createdAt || 0) - Number(a.createdAt || 0)
          );

        setPosts(list);
      },
      (firebaseError) => {
        console.error("Vezlivo user posts error:", firebaseError);
        setPosts([]);
      }
    );

    return () => unsubscribe();
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
        <div style={styles.center}>Loading profile...</div>
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
    profile.avatarURL ||
    "";

  const username = String(profile.username || "").replace(/^@/, "");
  const displayName =
    profile.displayName || username || "Vezlivo User";

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <button type="button" onClick={onBack} style={styles.back}>
          ← Back
        </button>
        <strong>{displayName}</strong>
        <span />
      </header>

      <section style={styles.profile}>
        <div style={styles.avatar}>
          {photo ? (
            <img src={photo} alt="" style={styles.avatarImage} />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>

        <h1 style={styles.name}>{displayName}</h1>
        <div style={styles.username}>
          @{username || uid.slice(0, 8)}
        </div>

        {profile.bio ? (
          <p style={styles.bio}>{profile.bio}</p>
        ) : null}

        <div style={styles.stats}>
          <div>
            <strong>{formatCount(profile.followersCount)}</strong>
            <span>Followers</span>
          </div>
          <div>
            <strong>{formatCount(profile.followingCount)}</strong>
            <span>Following</span>
          </div>
          <div>
            <strong>{formatCount(profile.videosCount || posts.length)}</strong>
            <span>Videos</span>
          </div>
        </div>

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
      </section>

      <section style={styles.videos}>
        <h2 style={styles.sectionTitle}>Videos</h2>

        {posts.length === 0 ? (
          <div style={styles.empty}>No videos yet.</div>
        ) : (
          <div style={styles.grid}>
            {posts.map((post) => {
              const media =
                post.mediaURL ||
                post.mediaUrl ||
                post.videoURL ||
                post.videoUrl ||
                post.downloadURL ||
                post.url ||
                "";

              return (
                <article key={post.postId} style={styles.card}>
                  {media ? (
                    <video
                      src={media}
                      controls
                      playsInline
                      preload="metadata"
                      style={styles.video}
                    />
                  ) : (
                    <div style={styles.noMedia}>No video preview</div>
                  )}
                  {post.caption ? (
                    <div style={styles.caption}>{post.caption}</div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#fff",
    color: "#111",
    paddingBottom: 40,
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    background: "#fff",
    borderBottom: "1px solid #eee",
  },
  back: {
    border: 0,
    background: "transparent",
    fontSize: 16,
    cursor: "pointer",
  },
  center: {
    padding: 40,
    textAlign: "center",
  },
  profile: {
    textAlign: "center",
    padding: "28px 16px 20px",
  },
  avatar: {
    width: 92,
    height: 92,
    margin: "0 auto 12px",
    borderRadius: "50%",
    background: "#eee",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    fontSize: 32,
    fontWeight: 700,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  name: {
    margin: 0,
    fontSize: 24,
  },
  username: {
    marginTop: 4,
    color: "#666",
  },
  bio: {
    maxWidth: 520,
    margin: "12px auto",
    lineHeight: 1.5,
  },
  stats: {
    display: "flex",
    justifyContent: "center",
    gap: 32,
    margin: "18px 0",
  },
  followButton: {
    minWidth: 150,
    padding: "10px 22px",
    border: 0,
    borderRadius: 10,
    background: "#111",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  followingButton: {
    background: "#eee",
    color: "#111",
  },
  videos: {
    padding: "0 16px",
  },
  sectionTitle: {
    fontSize: 18,
  },
  empty: {
    padding: 30,
    textAlign: "center",
    color: "#777",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 12,
  },
  card: {
    border: "1px solid #eee",
    borderRadius: 12,
    overflow: "hidden",
    background: "#fafafa",
  },
  video: {
    width: "100%",
    aspectRatio: "9 / 16",
    objectFit: "cover",
    display: "block",
    background: "#000",
  },
  noMedia: {
    aspectRatio: "9 / 16",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#777",
  },
  caption: {
    padding: 10,
    lineHeight: 1.4,
  },
};
