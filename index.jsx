import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { createRoot } from "react-dom/client";

import "./style.css";

import { apiGet, apiPost } from "./apiClient.js";
import UserProfile from "./UserProfile.jsx";
import Comments from "./Comments.jsx";
import SplashScreen from "./SplashScreen.jsx";
import Login from "./Login.jsx";
import Profile from "./Profile.jsx";
import Settings from "./Settings.jsx";
import Create from "./Create.jsx";
import Home from "./Home.jsx";
import Discover from "./Discover.jsx";
import Activity from "./Activity.jsx";
import Inbox from "./Inbox.jsx";


/* =========================================================
   HELPERS
========================================================= */

function formatCount(number) {
  const value = Number(number || 0);

  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)}B`;
  }

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return String(value);
}


function formatDate(timestamp) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = Date.now();
  const difference = now - date.getTime();

  const seconds = Math.floor(
    difference / 1000
  );

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(
    seconds / 60
  );

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(
    minutes / 60
  );

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(
    hours / 24
  );

  if (days < 7) {
    return `${days}d`;
  }

  return date.toLocaleDateString();
}


function getPostUsername(post) {
  return (
    post?.username ||
    post?.displayName ||
    post?.userEmail?.split("@")[0] ||
    "Vezlivo user"
  );
}


function getPostAvatar(post) {
  return (
    post?.userPhotoURL ||
    post?.photoURL ||
    post?.profile_url ||
    ""
  );
}


function readSavedUser() {
  try {
    const saved = localStorage.getItem("vezlivo_current_user");
    if (!saved) {
      return null;
    }
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      ...parsed,
      uid: parsed.uid || parsed.id || "",
    };
  } catch {
    return null;
  }
}


/* =========================================================
   POST CARD (Sovereign Backend via apiClient.js)
========================================================= */

function PostCard({
  post,
  user,
  onLogin,
}) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(
    Number(post.likes_count || post.likes || 0)
  );
  const [saved, setSaved] = useState(false);
  const [viewed, setViewed] = useState(false);
  const [busy, setBusy] = useState(false);

  const videoRef = useRef(null);
  const currentUid = user?.uid || user?.id;

  useEffect(() => {
    if (!currentUid || !post.id) {
      return;
    }

    async function checkLikeStatus() {
      try {
        const data = await apiGet(
          `/users/${encodeURIComponent(currentUid)}/likes`
        );
        if (data?.likedIds && data.likedIds[String(post.id)]) {
          setLiked(true);
        }
      } catch (error) {
        console.error("Check like status error:", error);
      }
    }

    checkLikeStatus();
  }, [post.id, currentUid]);

  const handleLike = async () => {
    if (!currentUid) {
      onLogin();
      return;
    }

    if (busy) return;
    setBusy(true);

    try {
      const action = liked ? "unlike" : "like";
      const previousLiked = liked;
      const previousCount = likeCount;

      setLiked(!previousLiked);
      setLikeCount(
        previousLiked ? Math.max(0, previousCount - 1) : previousCount + 1
      );

      const data = await apiPost("/like", {
        userId: currentUid,
        postId: String(post.id),
        action,
      });

      if (data && data.success === false) {
        setLiked(previousLiked);
        setLikeCount(previousCount);
      }
    } catch (error) {
      console.error("Like error:", error);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!currentUid) {
      onLogin();
      return;
    }

    try {
      const action = saved ? "unsave" : "save";
      const data = await apiPost("/save", {
        userId: currentUid,
        postId: String(post.id),
        action,
      });

      if (!data || data.success !== false) {
        setSaved((prev) => !prev);
      }
    } catch (error) {
      console.error("Save error:", error);
    }
  };


  const handleView = async () => {
    if (viewed || !post.id) {
      return;
    }

    setViewed(true);
  };


  const handleShare = async () => {
    const shareUrl =
      window.location.origin +
      `/?post=${encodeURIComponent(
        `${post.uid}:${post.id}`
      )}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Vezlivo",
          text:
            post.caption ||
            "Check out this post on Vezlivo",
          url: shareUrl,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        alert("Vezlivo post link copied.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Share error:", error);
      }
    }
  };


  const username = getPostUsername(post);
  const avatar = getPostAvatar(post);

  const hashtags = Array.isArray(post.hashtags)
    ? post.hashtags
    : typeof post.hashtags === "string"
    ? (() => {
        try {
          return JSON.parse(post.hashtags);
        } catch {
          return post.hashtags.split(",").map((s) => s.trim());
        }
      })()
    : [];

  const mentions = Array.isArray(post.mentions) ? post.mentions : [];

  const isVideo =
    post.mediaType === "video" ||
    Boolean(post.videoURL) ||
    Boolean(post.video_url);

  const mediaUrl =
    post.videoURL || post.video_url || post.mediaURL || post.url || "";


  return (
    <article className="vezlivo-post-card">

      <div className="post-user-row">

        <div className="post-user-avatar">

          {avatar ? (
            <img
              src={avatar}
              alt={username}
            />
          ) : (
            <span>
              {username
                .charAt(0)
                .toUpperCase()}
            </span>
          )}

        </div>

        <div className="post-user-info">
          <strong>
            {username}
          </strong>

          <span>
            {formatDate(
              post.createdAt || post.created_at
            )}
          </span>
        </div>

        <button
          type="button"
          className="post-more-button"
          aria-label="Post options"
          onClick={() =>
            alert(
              "Post options will be connected next."
            )
          }
        >
          ⋯
        </button>

      </div>


      {post.caption && (
        <div className="post-caption" style={{ padding: "0 16px 12px 16px" }}>

          <p style={{ margin: "0 0 8px 0", fontSize: "14px", lineHeight: "1.5", color: "#111" }}>
            {post.caption}
          </p>

          {hashtags.length > 0 && (
            <div className="post-hashtags" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
              {hashtags.map(
                (tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#0056b3",
                      background: "#f0f4f8",
                      padding: "2px 8px",
                      borderRadius: "6px"
                    }}
                  >
                    {tag.startsWith("#") ? tag : `#${tag}`}
                  </span>
                )
              )}
            </div>
          )}

          {mentions.length > 0 && (
            <div className="post-mentions" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
              {mentions.map(
                (mention) => (
                  <span
                    key={mention}
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#111",
                      background: "#eaeaea",
                      padding: "2px 8px",
                      borderRadius: "6px"
                    }}
                  >
                    {mention.startsWith("@") ? mention : `@${mention}`}
                  </span>
                )
              )}
            </div>
          )}

        </div>
      )}


      {mediaUrl && (
        <div className="post-media">

          {isVideo ? (
            <video
              ref={videoRef}
              src={mediaUrl}
              controls
              playsInline
              preload="metadata"
              onPlay={handleView}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.setAttribute(
                    "webkit-playsinline",
                    "true"
                  );
                }
              }}
            />
          ) : (
            <img
              src={mediaUrl}
              alt={post.caption || "Vezlivo post"}
              loading="lazy"
              onLoad={handleView}
            />
          )}

        </div>
      )}


      <div className="post-stats">

        <span>
          {formatCount(likeCount)} likes
        </span>

        <span>
          {formatCount(post.comments || post.comments_count)} comments
        </span>

        <span>
          {formatCount(post.views)} views
        </span>

      </div>


      <div className="post-actions">

        <button
          type="button"
          onClick={handleLike}
          className={liked ? "post-action active" : "post-action"}
          disabled={busy}
        >
          {liked ? "♥" : "♡"}
          <span>Like</span>
        </button>

        <button
          type="button"
          className="post-action"
          onClick={() => {
            if (!currentUid) {
              onLogin();
              return;
            }

            window.dispatchEvent(
              new CustomEvent("vezlivo:open-comments", {
                detail: {
                  postId: post.id || post.postId,
                  postOwnerId: post.uid || post.user_id,
                },
              })
            );
          }}
        >
          💬
          <span>Comment</span>
        </button>

        <button
          type="button"
          className={saved ? "post-action active" : "post-action"}
          onClick={handleSave}
        >
          🔖
          <span>Save</span>
        </button>


        <button
          type="button"
          className="post-action"
          onClick={handleShare}
        >
          ↗
          <span>Share</span>
        </button>

      </div>

    </article>
  );
}


/* =========================================================
   HOME PAGE WRAPPER
========================================================= */

function HomePage({
  user,
  commentsOpen,
  onLogin,
  onCreate,
  onDiscover,
  onActivity,
  onInbox,
}) {
  return (
    <Home
      user={user}
      commentsOpen={commentsOpen}
      onLogin={onLogin}
      onCreate={onCreate}
      onDiscover={onDiscover}
      onActivity={onActivity}
      onInbox={onInbox}
    />
  );
}


/* =========================================================
   APP
========================================================= */

function App() {
  const [page, setPage] = useState("home");
  const [commentsData, setCommentsData] = useState(null);

  useEffect(() => {
    const handleOpenComments = (event) => {
      const { postId, postOwnerId } = event.detail || {};
      if (postId) {
        setCommentsData({ postId, postOwnerId });
      }
    };

    window.addEventListener("vezlivo:open-comments", handleOpenComments);
    return () => window.removeEventListener("vezlivo:open-comments", handleOpenComments);
  }, []);

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [draftToOpen, setDraftToOpen] = useState("");
  const [userProfileToOpen, setUserProfileToOpen] = useState("");

  const lastBackPress = useRef(0);

  useEffect(() => {
    const syncSavedSession = () => {
      const savedUser = readSavedUser();
      setUser(savedUser);
      setAuthReady(true);

      if (savedUser) {
        localStorage.setItem("vezlivo_session_active", "true");
      } else {
        localStorage.removeItem("vezlivo_session_active");
      }
    };

    syncSavedSession();
    window.addEventListener("storage", syncSavedSession);
    return () => window.removeEventListener("storage", syncSavedSession);
  }, []);

  useEffect(() => {
    const handleOpenUserProfile = (event) => {
      const uid = event?.detail?.uid;
      if (!uid) {
        return;
      }

      setUserProfileToOpen(String(uid));
      navigate("user-profile");
    };

    window.addEventListener(
      "vezlivo:open-user-profile",
      handleOpenUserProfile
    );

    return () => {
      window.removeEventListener(
        "vezlivo:open-user-profile",
        handleOpenUserProfile
      );
    };
  }, []);


  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);


  useEffect(() => {
    window.history.replaceState(
      {
        vezlivo: true,
        page: "home",
      },
      "",
      window.location.href
    );


    const handlePopState = () => {
      if (
        page === "profile" ||
        page === "settings" ||
        page === "login" ||
        page === "create" ||
        page === "discover" ||
        page === "activity" ||
        page === "inbox" ||
        page === "user-profile"
      ) {
        setPage("home");

        window.history.pushState(
          {
            vezlivo: true,
            page: "home",
          },
          "",
          window.location.href
        );

        return;
      }


      const now = Date.now();

      if (now - lastBackPress.current < 2000) {
        window.history.back();
        return;
      }

      lastBackPress.current = now;

      window.history.pushState(
        {
          vezlivo: true,
          page: "home",
        },
        "",
        window.location.href
      );

      alert("Press back again to exit Vezlivo.");
    };


    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [page]);


  const navigate = (nextPage) => {
    setPage(nextPage);

    window.history.pushState(
      {
        vezlivo: true,
        page: nextPage,
      },
      "",
      window.location.href
    );
  };


  if (showSplash || !authReady) {
    return (
      <SplashScreen
        onComplete={() => setShowSplash(false)}
      />
    );
  }


  let content = null;

  if (page === "login" && !user) {
    content = (
      <Login
        onBack={() => {
          const savedUser = readSavedUser();
          setUser(savedUser);
          setPage("home");
        }}
      />
    );
  } else if (page === "user-profile") {
    if (!userProfileToOpen) {
      navigate("home");
      return null;
    }
    content = (
      <UserProfile
        uid={userProfileToOpen}
        currentUser={user}
        onBack={() => {
          setUserProfileToOpen("");
          navigate("home");
        }}
      />
    );
  } else if (page === "profile") {
    content = (
      <Profile
        onBack={() => {
          const savedUser = readSavedUser();
          setUser(savedUser);
          setPage("home");
        }}
        onOpenDraft={(draftId) => {
          setDraftToOpen(draftId || "");
          navigate("create");
        }}
      />
    );
  } else if (page === "settings") {
    content = (
      <Settings
        user={user}
        onBack={() => setPage("profile")}
      />
    );
  } else if (page === "create") {
    content = (
      <Create
        draftId={draftToOpen}
        onNavigate={(section) => {
          if (section === "Home") navigate("home");
        }}
      />
    );
  } else if (page === "discover") {
    content = (
      <Discover
        onBack={() => navigate("home")}
      />
    );
  } else if (page === "activity") {
    if (!user) {
      navigate("login");
      return null;
    }
    content = (
      <Activity
        onBack={() => navigate("home")}
      />
    );
  } else if (page === "inbox") {
    if (!user) {
      navigate("login");
      return null;
    }
    content = (
      <Inbox
        onBack={() => navigate("home")}
        onOpenUser={(uid) => {
          setUserProfileToOpen(String(uid || ""));
          navigate("user-profile");
        }}
      />
    );
  } else {
    content = (
      <HomePage
        user={user}
        commentsOpen={Boolean(commentsData)}
        onLogin={() => navigate("login")}
        onCreate={() => {
          if (!user) {
            navigate("login");
            return;
          }
          setDraftToOpen("");
          navigate("create");
        }}
        onDiscover={() => navigate("discover")}
        onActivity={() => {
          if (!user) {
            navigate("login");
            return;
          }
          navigate("activity");
        }}
        onProfile={() => {
          if (!user) {
            navigate("login");
            return;
          }
          navigate("profile");
        }}
        onInbox={() => {
          if (!user) {
            navigate("login");
            return;
          }
          navigate("inbox");
        }}
      />
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", overflow: "hidden", background: "#000000" }}>
      <div style={{ width: "100%", height: "calc(100dvh - 68px)", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {content}
      </div>

      {!commentsData && (
        <nav className="bottom-navigation" style={{ zIndex: 99999, pointerEvents: "auto", position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "space-around", background: "rgba(15,15,18,0.97)", borderTop: "1px solid #27272a", height: "68px", alignItems: "center", padding: "0 8px" }}>
          <button
            type="button"
            className={`nav-item ${page === "home" ? "active" : ""}`}
            onClick={() => {
              navigate("home");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            style={{ background: "transparent", border: "none", color: page === "home" ? "#fff" : "#71717a", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", fontSize: "11px", fontWeight: "600" }}
          >
            <span style={{ fontSize: "18px" }}>🏠</span>
            <small>Home</small>
          </button>

          <button
            type="button"
            className={`nav-item ${page === "discover" ? "active" : ""}`}
            onClick={() => navigate("discover")}
            style={{ background: "transparent", border: "none", color: page === "discover" ? "#fff" : "#71717a", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", fontSize: "11px", fontWeight: "600" }}
          >
            <span style={{ fontSize: "18px" }}>🔎</span>
            <small>Discover</small>
          </button>

          <button
            type="button"
            className="nav-item"
            onClick={() => {
              if (!user) {
                navigate("login");
                return;
              }
              setDraftToOpen("");
              navigate("create");
            }}
            style={{ background: "linear-gradient(135deg, #6366f1, #38bdf8)", border: "none", color: "#fff", width: "44px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "22px", fontWeight: "800" }}
          >
            ＋
          </button>

          <button
            type="button"
            className={`nav-item ${page === "activity" ? "active" : ""}`}
            onClick={() => {
              if (!user) {
                navigate("login");
                return;
              }
              navigate("activity");
            }}
            style={{ background: "transparent", border: "none", color: page === "activity" ? "#fff" : "#71717a", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", fontSize: "11px", fontWeight: "600" }}
          >
            <span style={{ fontSize: "18px" }}>🔔</span>
            <small>Activity</small>
          </button>

          <button
            type="button"
            className={`nav-item ${page === "profile" ? "active" : ""}`}
            onClick={() => {
              if (!user) {
                navigate("login");
                return;
              }
              navigate("profile");
            }}
            style={{ background: "transparent", border: "none", color: page === "profile" ? "#fff" : "#71717a", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", fontSize: "11px", fontWeight: "600" }}
          >
            <span style={{ fontSize: "18px" }}>👤</span>
            <small>Profile</small>
          </button>
        </nav>
      )}

      {commentsData && (
        <Comments
          postId={commentsData.postId}
          postOwnerId={commentsData.postOwnerId}
          onClose={() => setCommentsData(null)}
        />
      )}
    </div>
  );
}


/* =========================================================
   START VEZLIVO
========================================================= */

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Vezlivo root element was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);