import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { createRoot } from "react-dom/client";

import {
  onAuthStateChanged,
} from "firebase/auth";

import {
  getDatabase,
  onValue,
  push,
  ref,
  runTransaction,
  set,
  update,
} from "firebase/database";

import "./style.css";

import { auth } from "./firebase.js";
import UserProfile from "./UserProfile.jsx";

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
   FIREBASE DATABASE
========================================================= */

const db = getDatabase(auth.app);


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
    ""
  );
}


/* =========================================================
   POST CARD
========================================================= */

function PostCard({
  post,
  user,
  onLogin,
}) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(
    Number(post.likes || 0)
  );
  const [saved, setSaved] = useState(false);
  const [viewed, setViewed] = useState(false);
  const [busy, setBusy] = useState(false);

  const videoRef = useRef(null);

  useEffect(() => {
    if (!user || !post.id) {
      return;
    }

    const likeRef = ref(
      db,
      `postLikes/${post.id}/${user.uid}`
    );

    const unsubscribe = onValue(
      likeRef,
      (snapshot) => {
        setLiked(snapshot.exists());
      }
    );

    return () => unsubscribe();
  }, [post.id, user]);

  useEffect(() => {
    if (!user || !post.id) {
      return;
    }

    const saveRef = ref(
      db,
      `savedPosts/${user.uid}/${post.id}`
    );

    const unsubscribe = onValue(
      saveRef,
      (snapshot) => {
        setSaved(snapshot.exists());
      }
    );

    return () => unsubscribe();
  }, [post.id, user]);


  const handleLike = async () => {
    if (!user) {
      onLogin();
      return;
    }

    if (busy) {
      return;
    }

    setBusy(true);

    try {
      const likeRef = ref(
        db,
        `postLikes/${post.id}/${user.uid}`
      );

      const postLikesRef = ref(
        db,
        `posts/${post.uid}/${post.id}/likes`
      );

      await runTransaction(
        postLikesRef,
        (currentValue) => {
          const current = Number(
            currentValue || 0
          );

          if (liked) {
            return Math.max(0, current - 1);
          }

          return current + 1;
        }
      );

      if (liked) {
        await set(likeRef, null);

        setLikeCount((value) =>
          Math.max(0, value - 1)
        );
      } else {
        await set(likeRef, {
          uid: user.uid,
          createdAt: Date.now(),
        });

        setLikeCount(
          (value) => value + 1
        );
      }

      setLiked((value) => !value);
    } catch (error) {
      console.error(
        "Like error:",
        error
      );
    } finally {
      setBusy(false);
    }
  };


  const handleSave = async () => {
    if (!user) {
      onLogin();
      return;
    }

    try {
      const saveRef = ref(
        db,
        `savedPosts/${user.uid}/${post.id}`
      );

      if (saved) {
        await set(saveRef, null);
        setSaved(false);
      } else {
        await set(saveRef, {
          postId: post.id,
          savedAt: Date.now(),
        });

        setSaved(true);
      }
    } catch (error) {
      console.error(
        "Save error:",
        error
      );
    }
  };


  const handleView = async () => {
    if (viewed || !post.id) {
      return;
    }

    setViewed(true);

    try {
      const viewsRef = ref(
        db,
        `posts/${post.uid}/${post.id}/views`
      );

      await runTransaction(
        viewsRef,
        (currentValue) =>
          Number(currentValue || 0) + 1
      );
    } catch (error) {
      console.error(
        "View error:",
        error
      );
    }
  };


  const handleShare = async () => {
    const shareUrl =
      window.location.origin +
      `/?post=${encodeURIComponent(
        `${post.uid}:${post.id}`
      )}`;

    try {
      if (
        navigator.share
      ) {
        await navigator.share({
          title: "Vezlivo",
          text:
            post.caption ||
            "Check out this post on Vezlivo",
          url: shareUrl,
        });
      } else if (
        navigator.clipboard
      ) {
        await navigator.clipboard.writeText(
          shareUrl
        );

        alert(
          "Vezlivo post link copied."
        );
      }
    } catch (error) {
      if (
        error?.name !==
        "AbortError"
      ) {
        console.error(
          "Share error:",
          error
        );
      }
    }
  };


  const username =
    getPostUsername(post);

  const avatar =
    getPostAvatar(post);

  const hashtags =
    Array.isArray(post.hashtags)
      ? post.hashtags
      : [];

  const mentions =
    Array.isArray(post.mentions)
      ? post.mentions
      : [];

  const isVideo =
    post.mediaType === "video" ||
    Boolean(post.videoURL);

  const mediaUrl =
    post.mediaURL ||
    post.videoURL ||
    "";


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
              post.createdAt
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
        <div className="post-caption">

          <p>
            {post.caption}
          </p>

          {hashtags.length > 0 && (
            <div className="post-hashtags">
              {hashtags.map(
                (tag) => (
                  <span
                    key={tag}
                  >
                    {tag}
                  </span>
                )
              )}
            </div>
          )}

          {mentions.length > 0 && (
            <div className="post-mentions">
              {mentions.map(
                (mention) => (
                  <span
                    key={mention}
                  >
                    {mention}
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
                if (
                  videoRef.current
                ) {
                  videoRef.current
                    .setAttribute(
                      "webkit-playsinline",
                      "true"
                    );
                }
              }}
            />
          ) : (
            <img
              src={mediaUrl}
              alt={
                post.caption ||
                "Vezlivo post"
              }
              loading="lazy"
              onLoad={handleView}
            />
          )}

        </div>
      )}


      <div className="post-stats">

        <span>
          {formatCount(
            likeCount
          )}{" "}
          likes
        </span>

        <span>
          {formatCount(
            post.comments
          )}{" "}
          comments
        </span>

        <span>
          {formatCount(
            post.views
          )}{" "}
          views
        </span>

      </div>


      <div className="post-actions">

        <button
          type="button"
          onClick={handleLike}
          className={
            liked
              ? "post-action active"
              : "post-action"
          }
          disabled={busy}
        >
          {liked ? "♥" : "♡"}
          <span>
            Like
          </span>
        </button>


        <button
          type="button"
          className="post-action"
          onClick={() => {
            if (!user) {
              onLogin();
              return;
            }

            alert(
              "Comments will be connected next."
            );
          }}
        >
          💬
          <span>
            Comment
          </span>
        </button>


        <button
          type="button"
          className={
            saved
              ? "post-action active"
              : "post-action"
          }
          onClick={handleSave}
        >
          🔖
          <span>
            Save
          </span>
        </button>


        <button
          type="button"
          className="post-action"
          onClick={handleShare}
        >
          ↗
          <span>
            Share
          </span>
        </button>

      </div>

    </article>
  );
}


/* =========================================================
   HOME PAGE
========================================================= */

function HomePage({
  user,
  onLogin,
  onCreate,
  onProfile,
  onDiscover,
  onActivity,
  onInbox,
}) {
  const [posts, setPosts] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    const postsRef =
      ref(db, "posts");

    const unsubscribe =
      onValue(
        postsRef,
        (snapshot) => {
          try {
            const data =
              snapshot.val() || {};

            const loadedPosts = [];

            Object.entries(data).forEach(
              ([uid, userPosts]) => {
                if (!userPosts) {
                  return;
                }

                Object.entries(
                  userPosts
                ).forEach(
                  ([postId, post]) => {
                    if (!post) {
                      return;
                    }

                    loadedPosts.push({
                      ...post,
                      uid,
                      id: postId,
                    });
                  }
                );
              }
            );

            loadedPosts.sort(
              (a, b) =>
                Number(
                  b.createdAt || 0
                ) -
                Number(
                  a.createdAt || 0
                )
            );

            setPosts(
              loadedPosts
            );

            setLoading(false);
            setError("");
          } catch (err) {
            console.error(
              "Feed error:",
              err
            );

            setError(
              "We couldn't load your feed."
            );

            setLoading(false);
          }
        },
        (err) => {
          console.error(
            "Firebase feed error:",
            err
          );

          setError(
            "We couldn't load your feed."
          );

          setLoading(false);
        }
      );

    return () =>
      unsubscribe();
  }, []);


  const visiblePosts =
    posts;


  return (
    <main className="vezlivo-app">

      <header className="vezlivo-header">

        <button
          type="button"
          className="brand-button"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: "smooth",
            })
          }
        >
          <img
            src="/Logo.png"
            alt="Vezlivo"
          />

          <strong>
            Vezlivo
          </strong>
        </button>


        <div className="header-actions">

          <button
            type="button"
            onClick={onDiscover}
            aria-label="Discover"
          >
            🔍
          </button>

          <button
            type="button"
            onClick={onInbox}
            aria-label="Inbox"
          >
            💬
          </button>

        </div>

      </header>


      <section className="feed-section">

        {loading && (
          <div className="feed-loading">
            <div className="loading-spinner" />

            <p>
              Loading Vezlivo...
            </p>
          </div>
        )}


        {!loading &&
          error && (
            <div className="feed-error">

              <img
                src="/Logo.png"
                alt="Vezlivo"
              />

              <p>
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  window.location.reload()
                }
              >
                Try again
              </button>

            </div>
          )}


        {!loading &&
          !error &&
          visiblePosts.length ===
            0 && (
            <div className="empty-feed">

              <img
                src="/Logo.png"
                alt="Vezlivo logo"
                className="feed-logo"
              />

              <h1>
                Welcome to Vezlivo
              </h1>

              <p>
                Your feed is ready.
                Be the first to
                create something.
              </p>

              {user ? (
                <button
                  type="button"
                  className="feed-create-button"
                  onClick={onCreate}
                >
                  Create your first post
                </button>
              ) : (
                <button
                  type="button"
                  className="feed-create-button"
                  onClick={onLogin}
                >
                  Log in to create
                </button>
              )}

            </div>
          )}


        {!loading &&
          !error &&
          visiblePosts.length >
            0 && (
            <div className="posts-list">

              {visiblePosts.map(
                (post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    user={user}
                    onLogin={onLogin}
                  />
                )
              )}

            </div>
          )}

      </section>


      <nav className="bottom-navigation">

        <button
          type="button"
          className="nav-item active"
        >
          <span>
            ⌂
          </span>

          <small>
            Home
          </small>
        </button>


        <button
          type="button"
          className="nav-item"
          onClick={onCreate}
        >
          <span>
            ＋
          </span>

          <small>
            Create
          </small>
        </button>


        <button
          type="button"
          className="nav-item"
          onClick={onActivity}
        >
          <span>
            ♡
          </span>

          <small>
            Activity
          </small>
        </button>


        <button
          type="button"
          className="nav-item"
          onClick={onProfile}
        >
          <span>
            ☻
          </span>

          <small>
            Profile
          </small>
        </button>

      </nav>

    </main>
  );
}


/* =========================================================
   APP
========================================================= */

function App() {
  const [page, setPage] =
    useState("home");

  const [user, setUser] =
    useState(null);

  const [authReady, setAuthReady] =
    useState(false);

  const [showSplash, setShowSplash] =
    useState(true);

  const [draftToOpen, setDraftToOpen] =
    useState("");

  const [userProfileToOpen, setUserProfileToOpen] =
    useState("");

  const lastBackPress =
    useRef(0);


  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(
            currentUser
          );

          setAuthReady(true);

          if (currentUser) {
            setPage(
              (currentPage) =>
                currentPage ===
                "login"
                  ? "home"
                  : currentPage
            );
          }
        }
      );

    return () =>
      unsubscribe();
  }, []);


  useEffect(() => {
    const handleOpenUserProfile = (
      event
    ) => {
      const uid =
        event?.detail?.uid;

      if (!uid) {
        return;
      }

      setUserProfileToOpen(
        String(uid)
      );

      navigate(
        "user-profile"
      );
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
    const timer =
      setTimeout(() => {
        setShowSplash(false);
      }, 2000);

    return () =>
      clearTimeout(timer);
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


    const handlePopState =
      () => {
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


        const now =
          Date.now();


        if (
          now -
            lastBackPress.current <
          2000
        ) {
          window.history.back();
          return;
        }


        lastBackPress.current =
          now;


        window.history.pushState(
          {
            vezlivo: true,
            page: "home",
          },
          "",
          window.location.href
        );


        alert(
          "Press back again to exit Vezlivo."
        );
      };


    window.addEventListener(
      "popstate",
      handlePopState
    );


    return () =>
      window.removeEventListener(
        "popstate",
        handlePopState
      );
  }, [page]);


  const navigate = (
    nextPage
  ) => {
    setPage(
      nextPage
    );

    window.history.pushState(
      {
        vezlivo: true,
        page: nextPage
      },
      "",
      window.location.href
    );
  };


  if (
    showSplash ||
    !authReady
  ) {
    return (
      <SplashScreen
        onComplete={() =>
          setShowSplash(false)
        }
      />
    );
  }


  if (
    page === "login" &&
    !user
  ) {
    return (
      <Login
        onBack={() =>
          setPage("home")
        }
      />
    );
  }


  if (
    page === "user-profile"
  ) {
    if (!userProfileToOpen) {
      navigate("home");
      return null;
    }

    return (
      <UserProfile
        uid={userProfileToOpen}
        currentUser={user}
        onBack={() => {
          setUserProfileToOpen("");
          navigate("home");
        }}
      />
    );
  }


  if (
    page === "profile"
  ) {
    return (
      <Profile
        onBack={() =>
          setPage("home")
        }
        onOpenDraft={(draftId) => {
          setDraftToOpen(
            draftId || ""
          );

          navigate("create");
        }}
      />
    );
  }


  if (
    page === "settings"
  ) {
    return (
      <Settings
        user={user}
        onBack={() =>
          setPage("profile")
        }
      />
    );
  }


  if (
    page === "create"
  ) {
    return (
      <Create
        draftId={
          draftToOpen
        }
      />
    );
  }


  if (
    page === "discover"
  ) {
    return (
      <Discover
        onBack={() =>
          navigate("home")
        }
      />
    );
  }


  if (
    page === "activity"
  ) {
    if (!user) {
      navigate("login");
      return null;
    }

    return (
      <Activity
        onBack={() =>
          navigate("home")
        }
      />
    );
  }


  if (
    page === "inbox"
  ) {
    if (!user) {
      navigate("login");
      return null;
    }

    return (
      <Inbox
        onBack={() =>
          navigate("home")
        }
        onOpenUser={(uid) => {
          setUserProfileToOpen(
            String(uid || "")
          );

          navigate(
            "user-profile"
          );
        }}
      />
    );
  }


  return (
    <Home
      onNavigate={(section) => {
        const routes = {
          Home: "home",
          Discover: "discover",
          Create: "create",
          Activity: "activity",
          Profile: "profile",
          Inbox: "inbox",
        };


        const nextPage =
          routes[section];


        if (!nextPage) {
          return;
        }


        if (
          [
            "create",
            "activity",
            "profile",
            "inbox",
          ].includes(
            nextPage
          ) &&
          !user
        ) {
          navigate("login");
          return;
        }


        if (
          nextPage ===
          "create"
        ) {
          setDraftToOpen("");
        }


        navigate(
          nextPage
        );
      }}
    />
  );
}


/* =========================================================
   START VEZLIVO
========================================================= */

const rootElement =
  document.getElementById(
    "root"
  );


if (!rootElement) {
  throw new Error(
    "Vezlivo root element was not found."
  );
}


createRoot(
  rootElement
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);