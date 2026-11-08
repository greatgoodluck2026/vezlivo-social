// File: src/Profile.jsx

import React, { useEffect, useState } from "react";
import VipProfileBanner from "./VipProfileBanner.jsx";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  onValue,
  ref,
  get,
  set,
  update,
} from "firebase/database";

import { auth, database } from "./firebase.js";
import Settings from "./Settings.jsx";
import { apiGet, apiPost } from "./apiClient.js";

const DISPLAY_NAME_COOLDOWN =
  7 * 24 * 60 * 60 * 1000;

const USERNAME_COOLDOWN =
  30 * 24 * 60 * 60 * 1000;

const MAX_BIO_LENGTH = 160;
const MAX_USERNAME_LENGTH = 30;

function Profile({ onBack, onOpenDraft }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [posts, setPosts] = useState([]);
  const [likedVideos, setLikedVideos] = useState([]);
  const [favoriteVideos, setFavoriteVideos] = useState([]);
  const [drafts, setDrafts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const [activeSection, setActiveSection] = useState("videos");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [localProfilePreview, setLocalProfilePreview] = useState("");

  // 🖼️ Profile Photo Cropper & Framing States
  const [cropImageFile, setCropImageFile] = useState(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Admin Panel State for VIP Approvals
  const [targetVipInput, setTargetVipInput] = useState("");
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  const isAdmin = user?.email === "greatgoodluckp@gmail.com";

  /*
   * AUTH + PROFILE (Fetches from Neon PostgreSQL backend to guarantee persistence)
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!currentUser) {
          setUser(null);
          setProfile(null);
          setPosts([]);
          setLikedVideos([]);
          setFavoriteVideos([]);
          setLoading(false);
          setContentLoading(false);
          return;
        }

        setUser(currentUser);

        try {
          // Fetch permanent profile from Neon PostgreSQL via Worker API
          let dbProfile = {};
          try {
            const res = await apiGet(`/users/${currentUser.uid}`);
            if (res && res.profile) {
              dbProfile = res.profile;
            }
          } catch (apiErr) {
            console.log("Neon profile fetch fallback triggered:", apiErr);
          }

          const profileRef = ref(
            database,
            `users/${currentUser.uid}`
          );
          const snapshot = await get(profileRef);
          const fbProfile = snapshot.exists() ? snapshot.val() || {} : {};

          // Merge backend DB data and Firebase data, prioritizing DB for URLs
          const mergedProfile = {
  ...fbProfile,
  ...dbProfile,
  // Force Neon PostgreSQL profile_url to win first, always
  photoURL: dbProfile.profile_url || dbProfile.photo_url || currentUser.photoURL || fbProfile.photoURL || "",
  displayName: dbProfile.display_name || fbProfile.displayName || currentUser.displayName || "",
  username: dbProfile.username || fbProfile.username || "",
  bio: dbProfile.bio || fbProfile.bio || "",
  isPrivate: dbProfile.is_private === true || fbProfile.isPrivate === true,
};

          setProfile(mergedProfile);
          setDisplayName(mergedProfile.displayName);
          setUsername(mergedProfile.username);
          setBio(mergedProfile.bio);
          setIsPrivate(mergedProfile.isPrivate);

          if (!snapshot.exists()) {
            const newProfile = {
              uid: currentUser.uid,
              displayName: mergedProfile.displayName,
              username: mergedProfile.username,
              email: currentUser.email || "",
              photoURL: mergedProfile.photoURL,
              bio: mergedProfile.bio,
              isPrivate: mergedProfile.isPrivate,
              isVip: false,
              followersCount: 0,
              followingCount: 0,
              videosCount: 0,
              likesCount: 0,
              createdAt: Date.now(),
            };
            await set(profileRef, newProfile);
          }
        } catch (error) {
          console.error(
            "Profile loading error:",
            error
          );

          setMessage(
            "Unable to load your profile."
          );
          setMessageType("error");
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  /*
   * PROFILE SYNC (Ensures data stays updated in real-time)
   */
  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const profileRef = ref(
      database,
      `users/${user.uid}`
    );

    return onValue(
      profileRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const nextProfile = snapshot.val() || {};

        setProfile((prev) => ({
          ...(prev || {}),
          ...nextProfile,
          photoURL: nextProfile.photoURL || prev?.photoURL || "",
        }));

        // Only update local input states if user is not actively editing
        if (!editing) {
          setDisplayName(
            nextProfile.displayName || ""
          );

          setUsername(
            nextProfile.username || ""
          );

          setBio(
            nextProfile.bio || ""
          );

          setIsPrivate(
            nextProfile.isPrivate === true
          );
        }
      },
      (error) => {
        console.error(
          "Profile sync error:",
          error
        );
      }
    );
  }, [user, editing]);

  /*
   * USER VIDEOS (Neon PostgreSQL Backend)
   */
  useEffect(() => {
    if (!user) {
      setPosts([]);
      setContentLoading(false);
      return undefined;
    }

    let cancelled = false;
    setContentLoading(true);

    async function loadUserVideos() {
      try {
        const data = await apiGet("/posts");
        
        if (cancelled) return;

        const allPosts = Array.isArray(data) ? data : (data.posts || []);

        const userPosts = allPosts
          .filter((post) => post.user_id === user.uid || post.uid === user.uid)
          .map((post) => ({
            ...post,
            postId: post.id || post.postId,
            mediaURL: post.video_url || post.mediaURL || post.videoURL,
            thumbnailURL: post.thumbnail_url || post.thumbnailURL || post.thumbnail,
          }))
          .sort(
            (a, b) =>
              new Date(b.created_at || b.createdAt || 0) -
              new Date(a.created_at || a.createdAt || 0)
          );

        setPosts(userPosts);
      } catch (error) {
        console.error("Profile videos loading error:", error);
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    }

    loadUserVideos();

    return () => {
      cancelled = true;
    };
  }, [user]);

  /* =====================================================
     LOCAL DRAFTS
  ===================================================== */
  useEffect(() => {
    if (!user || !window.indexedDB) { setDrafts([]); return undefined; }
    let active = true; let db; const urls = [];
    (async () => {
      try {
        db = await new Promise((resolve, reject) => {
          const request = window.indexedDB.open("vezlivoDraftDatabase", 2);
          request.onupgradeneeded = () => { const next = request.result; if (!next.objectStoreNames.contains("drafts")) next.createObjectStore("drafts", { keyPath: "id" }); };
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        const rows = await new Promise((resolve, reject) => {
          const tx = db.transaction("drafts", "readonly"); const request = tx.objectStore("drafts").getAll();
          request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error);
        });
        const mine = rows.filter(d => !d.uid || d.uid === user.uid).sort((a,b) => Number(b.savedAt||0)-Number(a.savedAt||0)).map(d => {
          const thumbnailBlob = d.mediaBlob instanceof Blob ? d.mediaBlob : (d.mediaBlob ? new Blob([d.mediaBlob], { type: d.mediaMimeType || (d.mediaType === "video" ? "video/webm" : "image/jpeg") }) : null); const thumbnailURL = thumbnailBlob ? URL.createObjectURL(thumbnailBlob) : ""; if (thumbnailURL) urls.push(thumbnailURL); return {...d, thumbnailURL};
        });
        if (active) setDrafts(mine);
      } catch (error) { console.error("Vezlivo drafts loading error:", error); if (active) setDrafts([]); }
    })();
    return () => { active=false; urls.forEach(url => URL.revokeObjectURL(url)); if (db) db.close(); };
  }, [user]);

  /*
   * LIKED + FAVORITE VIDEOS
   */
  useEffect(() => {
    if (!user) {
      setLikedVideos([]);
      setFavoriteVideos([]);
      return undefined;
    }

    const likedRef = ref(
      database,
      `users/${user.uid}/likedVideos`
    );

    const favoritesRef = ref(
      database,
      `users/${user.uid}/favoriteVideos`
    );

    let active = true;

    Promise.all([
      get(likedRef),
      get(favoritesRef),
    ])
      .then(([likedSnap, favoriteSnap]) => {
        if (!active) {
          return;
        }

        const likedData =
          likedSnap.val() || {};

        const favoriteData =
          favoriteSnap.val() || {};

        setLikedVideos(
          objectToVideoList(likedData)
        );

        setFavoriteVideos(
          objectToVideoList(favoriteData)
        );
      })
      .catch((error) => {
        console.error(
          "Liked/favorite videos loading error:",
          error
        );

        if (active) {
          setLikedVideos([]);
          setFavoriteVideos([]);
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  const getRemainingTime = (
    changedAt,
    cooldown
  ) => {
    if (!changedAt) {
      return null;
    }

    const remaining =
      Number(changedAt) +
      cooldown -
      Date.now();

    if (remaining <= 0) {
      return null;
    }

    return Math.ceil(
      remaining /
        (24 * 60 * 60 * 1000)
    );
  };

  const displayNameDaysLeft =
    getRemainingTime(
      profile?.displayNameChangedAt,
      DISPLAY_NAME_COOLDOWN
    );

  const usernameDaysLeft =
    getRemainingTime(
      profile?.usernameChangedAt,
      USERNAME_COOLDOWN
    );

  // Handle In-App Admin VIP Approval
  const handleAdminApproveVip = async (status) => {
    const queryVal = targetVipInput.trim();
    if (!queryVal) {
      setMessage("Please enter a User UID or Username.");
      setMessageType("error");
      return;
    }

    setAdminActionLoading(true);
    setMessage("");

    try {
      const usersRef = ref(database, "users");
      const snapshot = await get(usersRef);

      if (!snapshot.exists()) {
        setMessage("No users found in database.");
        setMessageType("error");
        setAdminActionLoading(false);
        return;
      }

      let targetUid = null;
      snapshot.forEach((childSnap) => {
        const uData = childSnap.val();
        const cUid = childSnap.key;
        if (
          cUid === queryVal ||
          uData.username?.toLowerCase() === queryVal.replace("@", "").toLowerCase()
        ) {
          targetUid = cUid;
        }
      });

      if (!targetUid) {
        setMessage(`User "${queryVal}" not found in database.`);
        setMessageType("error");
        setAdminActionLoading(false);
        return;
      }

      const targetUserRef = ref(database, `users/${targetUid}`);
      await update(targetUserRef, { isVip: status });

      setMessage(`Success! User VIP status set to: ${status}`);
      setMessageType("success");
      setTargetVipInput("");
    } catch (err) {
      console.error("Admin VIP update error:", err);
      setMessage("Failed to update VIP status.");
      setMessageType("error");
    } finally {
      setAdminActionLoading(false);
    }
  };

  // Helper: Convert File to Base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  // 🖼️ Step 1: Trigger Cropper Modal on Photo Select
  const handleProfilePhotoSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Please select an image file.");
      setMessageType("error");
      event.target.value = "";
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setMessage("Image must be 5MB or smaller.");
      setMessageType("error");
      event.target.value = "";
      return;
    }

    const previewURL = URL.createObjectURL(file);
    setCropPreviewUrl(previewURL);
    setCropImageFile(file);
    setZoomLevel(1);
    setImageOffset({ x: 0, y: 0 });
    event.target.value = "";
  };

  // 🖼️ Step 2: Upload Framed Image & Sync directly to Cloudflare Worker / Neon PostgreSQL
  const handleConfirmCropAndUpload = async () => {
    if (!cropImageFile || !user) return;

    const file = cropImageFile;
    const previewURL = cropPreviewUrl;

    setCropPreviewUrl("");
    setCropImageFile(null);

    setLocalProfilePreview(previewURL);
    setUploadingPhoto(true);
    setMessage("");

    try {
      const base64Data = await fileToBase64(file);
      const filename = `profile-${user.uid}-${Date.now()}.jpg`;

      const payload = {
        uid: user.uid,
        displayName: displayName || user.displayName || "Vezlivo User",
        display_name: displayName || user.displayName || "Vezlivo User",
        username: username || "",
        bio: bio || "",
        profile_url: base64Data,
        profileImageBase64: base64Data,
        profileImageName: filename,
      };

      // 1. Sync directly with Neon PostgreSQL via Cloudflare Worker API
      const res = await apiPost("/users/update-profile", payload);

      const newPhotoUrl = res?.profile_url || res?.profileURL || res?.url || res?.photoURL || base64Data;
      const finalUrl = newPhotoUrl || previewURL;

      // 2. Keep Firebase Auth/RTDB profile photo updated in sync
      const profileRef = ref(database, `users/${user.uid}`);
      await update(profileRef, { photoURL: finalUrl, profile_url: finalUrl });

      setProfile((previousProfile) => ({
        ...(previousProfile || {}),
        photoURL: finalUrl,
        profile_url: finalUrl,
      }));
      
      setLocalProfilePreview("");
      setMessage("Profile picture updated successfully in Neon!");
      setMessageType("success");
    } catch (error) {
      console.error("Image upload error:", error);
      setMessage("Unable to update picture. Please try again.");
      setMessageType("error");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !profile) {
      return;
    }

    const cleanDisplayName =
      displayName.trim();

    const cleanUsername =
      username
        .trim()
        .toLowerCase();

    const cleanBio =
      bio.trim();

    if (!cleanDisplayName) {
      setMessage(
        "Please enter your display name."
      );
      setMessageType("error");
      return;
    }

    if (!cleanUsername) {
      setMessage(
        "Please choose a username."
      );
      setMessageType("error");
      return;
    }

    if (
      !/^[a-z0-9._]+$/.test(
        cleanUsername
      )
    ) {
      setMessage(
        "Username can use lowercase letters, numbers, dots, and underscores."
      );
      setMessageType("error");
      return;
    }

    if (cleanUsername.length < 3) {
      setMessage(
        "Username must be at least 3 characters."
      );
      setMessageType("error");
      return;
    }

    if (
      cleanUsername.length >
      MAX_USERNAME_LENGTH
    ) {
      setMessage(
        "Username must be 30 characters or less."
      );
      setMessageType("error");
      return;
    }

    if (
      cleanBio.length >
      MAX_BIO_LENGTH
    ) {
      setMessage(
        "Bio must be 160 characters or less."
      );
      setMessageType("error");
      return;
    }

    const currentDisplayName =
      profile.displayName || "";

    const currentUsername =
      profile.username || "";

    const displayNameChanged =
      cleanDisplayName !==
      currentDisplayName;

    const usernameChanged =
      cleanUsername !==
      currentUsername;

    if (
      displayNameChanged &&
      displayNameDaysLeft
    ) {
      setMessage(
        `You can change your display name again in ${displayNameDaysLeft} day${
          displayNameDaysLeft === 1
            ? ""
            : "s"
        }.`
      );
      setMessageType("error");
      return;
    }

    if (
      usernameChanged &&
      usernameDaysLeft
    ) {
      setMessage(
        `You can change your username again in ${usernameDaysLeft} day${
          usernameDaysLeft === 1
            ? ""
            : "s"
        }.`
      );
      setMessageType("error");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      // Direct Sync with Neon PostgreSQL backend via Cloudflare Worker
      await apiPost("/users/update-profile", {
        uid: user.uid,
        display_name: cleanDisplayName,
        displayName: cleanDisplayName,
        username: cleanUsername,
        bio: cleanBio,
        is_private: isPrivate,
        isPrivate: isPrivate,
        profile_url: profile?.photoURL || profile?.profile_url || "",
      });

      const profileRef = ref(
        database,
        `users/${user.uid}`
      );

      const changes = {
        displayName:
          cleanDisplayName,
        username:
          cleanUsername,
        bio:
          cleanBio,
        isPrivate,
      };

      if (displayNameChanged) {
        changes.displayNameChangedAt =
          Date.now();
      }

      if (usernameChanged) {
        changes.usernameChangedAt =
          Date.now();
      }

      await update(
        profileRef,
        changes
      );

      const updatedProfile = {
        ...(profile || {}),
        ...changes,
      };

      setProfile(
        updatedProfile
      );

      setEditing(false);

      setMessage(
        "Profile updated successfully."
      );
      setMessageType("success");
    } catch (error) {
      console.error(
        "Profile save error:",
        error
      );

      setMessage(
        "Unable to save your profile. Please try again."
      );
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setMessage("");

    try {
      await signOut(auth);
      onBack?.();
    } catch (error) {
      console.error(
        "Sign-out error:",
        error
      );

      setMessage(
        "Unable to sign out. Please try again."
      );
      setMessageType("error");
    } finally {
      setSigningOut(false);
    }
  };

  const openSettings = () => {
    setMessage("");
    setShowSettings(true);
  };

  const startEditing = () => {
    setMessage("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);

    setDisplayName(
      profile?.displayName ||
        user?.displayName ||
        ""
    );

    setUsername(
      profile?.username ||
        ""
    );

    setBio(
      profile?.bio ||
        ""
    );

    setIsPrivate(
      profile?.isPrivate === true
    );

    setMessage("");
    setMessageType("");
  };

  const profilePhoto =
    localProfilePreview ||
    profile?.photoURL ||
    profile?.profile_url ||
    user?.photoURL ||
    "";

  const profileName =
    profile?.displayName ||
    profile?.display_name ||
    user?.displayName ||
    "Vezlivo User";

  const usernameText =
    profile?.username
      ? `@${profile.username}`
      : "@username";

  const followersCount =
    Number(
      profile?.followersCount || 0
    );

  const followingCount =
    Number(
      profile?.followingCount || 0
    );

  const activeContent =
    activeSection === "liked"
      ? likedVideos
      : activeSection === "favorites"
      ? favoriteVideos
      : activeSection === "drafts"
      ? drafts
      : posts;

  const activeContentTitle =
    activeSection === "liked"
      ? "Liked videos"
      : activeSection === "favorites"
      ? "Favorite videos"
      : activeSection === "drafts"
      ? "Your drafts"
      : "Your videos";

  const activeContentDescription =
    activeSection === "liked"
      ? "Videos you like will appear here."
      : activeSection === "favorites"
      ? "Your favorite videos will appear here."
      : activeSection === "drafts"
      ? "Saved drafts will appear here so you can continue editing them."
      : "Videos you post on Vezlivo will appear here.";

  if (showSettings) {
    return (
      <Settings
        onBack={() =>
          setShowSettings(false)
        }
      />
    );
  }

  if (loading) {
    return (
      <main
        className="profile-page"
        style={styles.page}
      >
        <section
          className="profile-card"
          style={styles.loadingCard}
        >
          <div style={styles.loadingSpinner}>
            ◌
          </div>
          <p style={styles.loadingText}>
            Loading profile...
          </p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main
        className="profile-page"
        style={styles.page}
      >
        <section
          className="profile-card"
          style={styles.loadingCard}
        >
          <button
            type="button"
            onClick={onBack}
            style={styles.backButton}
          >
            ← Back
          </button>

          <h1 style={styles.emptyTitle}>
            Profile
          </h1>

          <p style={styles.emptyText}>
            Please log in to view your profile.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main
      className="profile-page"
      style={styles.page}
    >
      <section
        className="profile-card"
        style={styles.profileCard}
      >
        {/* TOP NAVIGATION */}
        <header style={styles.topBar}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            style={styles.iconButton}
          >
            ←
          </button>

          <div style={styles.topTitle}>
            Profile
          </div>

          <div style={styles.topRightActions}>
            <button
              type="button"
              onClick={openSettings}
              aria-label="Open settings"
              title="Settings"
              style={styles.iconButton}
            >
              ⚙
            </button>

            <button
              type="button"
              onClick={startEditing}
              style={styles.editButton}
            >
              Edit Profile
            </button>
          </div>
        </header>

        {/* PROFILE HEADER */}
        <div style={styles.profileHeader}>
          <div style={styles.avatarWrap}>
            <div style={styles.avatarRing}>
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt={profileName}
                  style={styles.avatar}
                />
              ) : (
                <div
                  style={styles.avatarFallback}
                >
                  {profileName
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}
            </div>

            <label
              htmlFor="profile-photo-input"
              title="Change profile picture"
              style={{
                ...styles.avatarCamera,
                opacity:
                  uploadingPhoto
                    ? 0.55
                    : 1,
                pointerEvents:
                  uploadingPhoto
                    ? "none"
                    : "auto",
              }}
            >
              📷
            </label>

            <input
              id="profile-photo-input"
              type="file"
              accept="image/*"
              onChange={
                handleProfilePhotoSelect
              }
              disabled={
                uploadingPhoto ||
                saving
              }
              hidden
            />
          </div>

          <div style={styles.nameArea}>
            <div style={styles.nameLine}>
              <h1 style={styles.profileName}>
                {profileName}
              </h1>

              {profile?.verified === true && (
                <span
                  title="Verified account"
                  aria-label="Verified account"
                  style={styles.verifiedBadge}
                >
                  ✓
                </span>
              )}
            </div>

            <p style={styles.username}>
              {usernameText}
            </p>

            <p style={styles.bio}>
              {profile?.bio ||
                "Welcome to my Vezlivo profile."}
            </p>

            <div style={styles.accountState}>
              <span>
                {profile?.isPrivate
                  ? "🔒 Private account"
                  : "🌎 Public account"}
              </span>
            </div>
          </div>
        </div>

       {/* STATS */}
        <div style={styles.statsRow}>
          <button type="button" onClick={() => setActiveSection("following")} style={styles.statButton}>
            <strong style={styles.statNumber}>{followingCount}</strong>
            <span style={styles.statLabel}>Following</span>
          </button>

          <button type="button" onClick={() => setActiveSection("followers")} style={styles.statButton}>
            <strong style={styles.statNumber}>{followersCount}</strong>
            <span style={styles.statLabel}>Followers</span>
          </button>

          <button type="button" onClick={() => setActiveSection("liked")} style={styles.statButton}>
            <strong style={styles.statNumber}>{Number(profile?.likesCount || 0)}</strong>
            <span style={styles.statLabel}>Likes</span>
          </button>
        </div>

        {/* 👑 VIP PROFILE BANNER CARD */}
        <VipProfileBanner user={user} />

        {/* 👑 IN-APP ADMIN VIP MANAGER (Only visible to greatgoodluckp@gmail.com) */}
        {isAdmin && (
          <section style={styles.adminPanel}>
            <div style={styles.adminHeader}>
              <span style={{ fontSize: "16px" }}>🛡️</span>
              <h3 style={styles.adminTitle}>Admin VIP Manager</h3>
            </div>
            <p style={styles.adminSubtitle}>
              Paste a user's UID or username from your email notification to instantly approve or revoke VIP status.
            </p>
            <div style={styles.adminInputRow}>
              <input
                type="text"
                placeholder="Enter User UID or @username..."
                value={targetVipInput}
                onChange={(e) => setTargetVipInput(e.target.value)}
                disabled={adminActionLoading}
                style={styles.input}
              />
              <div style={styles.adminBtnGroup}>
                <button
                  type="button"
                  onClick={() => handleAdminApproveVip(true)}
                  disabled={adminActionLoading}
                  style={styles.approveBtn}
                >
                  {adminActionLoading ? "..." : "Approve 👑"}
                </button>
                <button
                  type="button"
                  onClick={() => handleAdminApproveVip(false)}
                  disabled={adminActionLoading}
                  style={styles.rejectBtn}
                >
                  Revoke ❌
                </button>
              </div>
            </div>
          </section>
        )}

        {/* EDIT FORM */}
        {editing && (
          <section style={styles.editPanel}>
            <div style={styles.editPanelHeader}>
              <div>
                <h2 style={styles.editPanelTitle}>
                  Edit profile
                </h2>
                <p style={styles.editPanelDescription}>
                  Update your profile information.
                </p>
              </div>

              <button
                type="button"
                onClick={cancelEditing}
                style={styles.closeButton}
              >
                ×
              </button>
            </div>

            <div style={styles.formGrid}>
              <label style={styles.field}>
                <span style={styles.fieldLabel}>
                  Display name
                </span>

                <input
                  type="text"
                  value={displayName}
                  onChange={(event) =>
                    setDisplayName(
                      event.target.value
                    )
                  }
                  disabled={saving}
                  style={styles.input}
                />

                {displayNameDaysLeft && (
                  <small style={styles.fieldHint}>
                    You can change this again in{" "}
                    {displayNameDaysLeft} day
                    {displayNameDaysLeft === 1
                      ? ""
                      : "s"}.
                  </small>
                )}
              </label>

              <label style={styles.field}>
                <span style={styles.fieldLabel}>
                  Username
                </span>

                <input
                  type="text"
                  value={username}
                  onChange={(event) =>
                    setUsername(
                      event.target.value
                    )
                  }
                  disabled={saving}
                  placeholder="username"
                  maxLength={
                    MAX_USERNAME_LENGTH
                  }
                  style={styles.input}
                />

                {usernameDaysLeft && (
                  <small style={styles.fieldHint}>
                    You can change this again in{" "}
                    {usernameDaysLeft} day
                    {usernameDaysLeft === 1
                      ? ""
                      : "s"}.
                  </small>
                )}
              </label>

              <label style={styles.fieldFull}>
                <span style={styles.fieldLabel}>
                  Bio
                </span>

                <textarea
                  value={bio}
                  onChange={(event) =>
                    setBio(
                      event.target.value
                    )
                  }
                  disabled={saving}
                  maxLength={
                    MAX_BIO_LENGTH
                  }
                  rows={4}
                  placeholder="Tell people about yourself..."
                  style={styles.textarea}
                />

                <small style={styles.characterCount}>
                  {bio.length}/
                  {MAX_BIO_LENGTH}
                </small>
              </label>

              <label style={styles.privateRow}>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(event) =>
                    setIsPrivate(
                      event.target.checked
                    )
                  }
                  disabled={saving}
                />

                <span>
                  Private account
                </span>
              </label>
            </div>

            <div style={styles.formActions}>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                style={styles.cancelButton}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  handleSaveProfile
                }
                disabled={saving}
                style={styles.saveButton}
              >
                {saving
                  ? "Saving..."
                  : "Save changes"}
              </button>
            </div>
          </section>
        )}

        {/* CONTENT NAVIGATION */}
        <nav
          aria-label="Profile content"
          style={styles.contentTabs}
        >
          <button
            type="button"
            onClick={() =>
              setActiveSection("videos")
            }
            style={{
              ...styles.contentTab,
              ...(activeSection ===
              "videos"
                ? styles.activeContentTab
                : {}),
            }}
          >
            <span style={styles.tabIcon}>
              ▦
            </span>
            <span>
              Videos
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("drafts")}
            style={{ ...styles.contentTab, ...(activeSection === "drafts" ? styles.activeContentTab : {}) }}
          >
            <span style={styles.tabIcon}>✎</span>
            <span>Drafts</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveSection("liked")
            }
            style={{
              ...styles.contentTab,
              ...(activeSection ===
              "liked"
                ? styles.activeContentTab
                : {}),
            }}
          >
            <span style={styles.tabIcon}>
              ♡
            </span>
            <span>
              Liked
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveSection(
                "favorites"
              )
            }
            style={{
              ...styles.contentTab,
              ...(activeSection ===
              "favorites"
                ? styles.activeContentTab
                : {}),
            }}
          >
            <span style={styles.tabIcon}>
              ☆
            </span>
            <span>
              Favorites
            </span>
          </button>
        </nav>

        {/* VIDEO CONTENT */}
        <section style={styles.videoSection}>
          {contentLoading &&
          activeSection ===
            "videos" ? (
            <div style={styles.contentLoading}>
              <div style={styles.loadingSpinner}>
                ◌
              </div>
              <p>
                Loading your videos...
              </p>
            </div>
          ) : activeContent.length >
            0 ? (
            <div style={styles.videoGrid}>
              {activeContent.map(
                (video, index) =>
                  activeSection === "drafts" ? (
                    <DraftCard key={video.id || `${index}-${video.savedAt || 0}`} draft={video} onOpenDraft={onOpenDraft} />
                  ) : (
                    <ProfileVideoCard
                      key={video.postId || video.id || video.videoId || `${index}-${video.createdAt || 0}`}
                      video={video}
                    />
                  )
              )}
            </div>
          ) : (
            <div style={styles.emptyContent}>
              <div style={styles.emptyIcon}>
                {activeSection ===
                "liked"
                  ? "♡"
                  : activeSection ===
                    "favorites"
                  ? "☆"
                  : "▣"}
              </div>

              <h3 style={styles.emptyContentTitle}>
                {activeSection ===
                "videos"
                  ? "Your videos"
                  : activeContentTitle}
              </h3>

              <p style={styles.emptyContentText}>
                {activeContentDescription}
              </p>
            </div>
          )}
        </section>

        {/* SIGN OUT */}
        <div style={styles.signOutArea}>
          <button
            type="button"
            onClick={
              handleSignOut
            }
            disabled={signingOut}
            style={{
              ...styles.signOutButton,
              opacity: signingOut
                ? 0.55
                : 1,
            }}
          >
            {signingOut
              ? "Signing out..."
              : "Sign out"}
          </button>
        </div>

        {/* STATUS MESSAGE */}
        {message && (
          <div
            role="status"
            style={{
              ...styles.message,
              ...(messageType ===
              "success"
                ? styles.successMessage
                : styles.errorMessage),
            }}
          >
            {message}
          </div>
        )}
      </section>

      {/* 🖼️ PHOTO FRAMING & ZOOM MODAL */}
      {cropPreviewUrl && (
        <div style={cropStyles.overlay}>
          <div style={cropStyles.modal}>
            <h3 style={cropStyles.title}>Edit Profile Picture</h3>
            <p style={cropStyles.subtitle}>Drag to reposition and use the slider to zoom</p>

            <div 
              style={cropStyles.viewport}
              onMouseDown={(e) => {
                setIsDragging(true);
                setDragStart({ x: e.clientX - imageOffset.x, y: e.clientY - imageOffset.y });
              }}
              onMouseMove={(e) => {
                if (!isDragging) return;
                setImageOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
              }}
              onMouseUp={() => setIsDragging(false)}
              onTouchStart={(e) => {
                setIsDragging(true);
                setDragStart({ x: e.touches[0].clientX - imageOffset.x, y: e.touches[0].clientY - imageOffset.y });
              }}
              onTouchMove={(e) => {
                if (!isDragging) return;
                setImageOffset({ x: e.touches[0].clientX - imageOffset.x, y: e.touches[0].clientY - imageOffset.y });
              }}
              onTouchEnd={() => setIsDragging(false)}
            >
              <img
                src={cropPreviewUrl}
                alt="Crop Preview"
                style={{
                  ...cropStyles.imagePreview,
                  transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${zoomLevel})`,
                }}
              />
            </div>

            <div style={cropStyles.sliderContainer}>
              <span>🔍 Zoom:</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoomLevel}
                onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                style={cropStyles.slider}
              />
            </div>

            <div style={cropStyles.buttonRow}>
              <button
                type="button"
                style={cropStyles.cancelBtn}
                onClick={() => {
                  setCropPreviewUrl("");
                  setCropImageFile(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                style={cropStyles.saveBtn}
                onClick={handleConfirmCropAndUpload}
              >
                Apply & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ProfileVideoCard({ video }) {
  const videoURL =
    video.mediaURL ||
    video.videoURL ||
    video.videoUrl ||
    video.video ||
    video.url ||
    "";

  const thumbnail =
    video.thumbnailURL ||
    video.thumbnailUrl ||
    video.thumbnail ||
    "";

  const caption =
    video.caption ||
    video.description ||
    "";

  const views =
    Number(
      video.viewsCount ||
        video.views ||
        0
    );

  const likes =
    Number(
      video.likesCount ||
        video.likes ||
        0
    );

  const isPinned =
    video.pinned === true ||
    video.isPinned === true;

  return (
    <article style={styles.videoCard}>
      <div style={styles.videoMedia}>
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            style={styles.videoThumbnail}
          />
        ) : videoURL ? (
          <video
            src={videoURL}
            muted
            playsInline
            preload="metadata"
            style={styles.videoElement}
          />
        ) : (
          <div style={styles.videoFallback}>
            V
          </div>
        )}

        <div style={styles.videoOverlay}>
          <span style={styles.playBadge}>
            ▶
          </span>

          <span style={styles.videoViews}>
            {formatCount(views)}
          </span>
        </div>

        {isPinned && (
          <span style={styles.pinnedBadge}>
            Pinned
          </span>
        )}
      </div>

      <div style={styles.videoMeta}>
        <p style={styles.videoCaption}>
          {caption ||
            "Vezlivo video"}
        </p>

        <div style={styles.videoStats}>
          <span>
            ♡ {formatCount(likes)}
          </span>
          <span>
            ▶ {formatCount(views)}
          </span>
        </div>
      </div>
    </article>
  );
}

function objectToVideoList(data) {
  if (!data || typeof data !== "object") {
    return [];
  }

  return Object.entries(data)
    .map(([id, value]) => ({
      id,
      ...(value || {}),
    }))
    .sort(
      (a, b) =>
        Number(b.createdAt || 0) -
        Number(a.createdAt || 0)
    );
}

function formatCount(value) {
  const number =
    Number(value) || 0;

  if (number < 1000) {
    return String(number);
  }

  if (number < 1000000) {
    const result =
      number / 1000;

    return `${trimDecimal(result)}K`;
  }

  if (number < 1000000000) {
    const result =
      number / 1000000;

    return `${trimDecimal(result)}M`;
  }

  const result =
    number / 1000000000;

  return `${trimDecimal(result)}B`;
}

function trimDecimal(value) {
  return Number(
    value.toFixed(
      value < 10 ? 1 : 0
    )
  ).toString();
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    background:
      "linear-gradient(180deg, #f6f7fb 0%, #ffffff 55%, #f6f7fb 100%)",
    color: "#111",
  },

  profileCard: {
    width: "100%",
    maxWidth: "760px",
    margin: "0 auto",
    overflow: "hidden",
    borderRadius: "22px",
    background: "#fff",
    boxShadow:
      "0 8px 35px rgba(0,0,0,0.10)",
    border:
      "1px solid rgba(0,0,0,0.08)",
  },

  loadingCard: {
    width: "100%",
    maxWidth: "760px",
    minHeight: "240px",
    margin: "0 auto",
    borderRadius: "22px",
    background: "#fff",
    border:
      "1px solid rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },

  loadingSpinner: {
    fontSize: "38px",
    lineHeight: 1,
    color: "#777",
  },

  loadingText: {
    margin: 0,
    color: "#666",
    fontSize: "14px",
  },

  topBar: {
    height: "58px",
    padding:
      "0 14px",
    display: "grid",
    gridTemplateColumns:
      "42px 1fr auto",
    alignItems: "center",
    gap: "8px",
    background: "#fff",
    borderBottom:
      "1px solid #eeeeee",
    position: "relative",
    zIndex: 20,
  },

  topTitle: {
    textAlign: "center",
    fontSize: "16px",
    fontWeight: 800,
  },

  topRightActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "7px",
  },

  iconButton: {
    width: "40px",
    height: "40px",
    border:
      "1px solid #dedede",
    borderRadius: "11px",
    background: "#fff",
    color: "#111",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
    fontWeight: 700,
    cursor: "pointer",
  },

  profileHeader: {
    position: "relative",
    padding:
      "16px 14px 12px",
    minHeight: "116px",
  },

  avatarWrap: {
    position: "relative",
    width: "112px",
    height: "112px",
    marginLeft: "8px",
    zIndex: 10,
  },

  avatarRing: {
    width: "112px",
    height: "112px",
    padding: "5px",
    boxSizing: "border-box",
    borderRadius: "50%",
    background: "#fff",
    boxShadow:
      "0 4px 18px rgba(0,0,0,0.20)",
  },

  avatar: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "cover",
    borderRadius: "50%",
    background: "#eee",
  },

  avatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    background:
      "linear-gradient(135deg, #087f73, #19b8a6)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "48px",
    fontWeight: 800,
  },

  avatarCamera: {
    position: "absolute",
    right: "-3px",
    bottom: "2px",
    width: "42px",
    height: "42px",
    borderRadius: "50%",
    background: "#fff",
    border:
      "2px solid #fff",
    boxShadow:
      "0 3px 10px rgba(0,0,0,0.22)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    cursor: "pointer",
  },

  nameArea: {
    padding:
      "12px 2px 0",
    maxWidth: "590px",
  },

  nameLine: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "7px",
  },

  profileName: {
    margin: 0,
    fontSize: "25px",
    lineHeight: 1.1,
    fontWeight: 850,
    letterSpacing: "-0.6px",
  },

  verifiedBadge: {
    width: "21px",
    height: "21px",
    borderRadius: "50%",
    background:
      "linear-gradient(135deg, #18b7ff, #3478ff)",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: 900,
  },

  username: {
    margin:
      "3px 0 5px",
    color: "#666",
    fontSize: "15px",
  },

  bio: {
    margin: 0,
    color: "#252525",
    fontSize: "15px",
    lineHeight: 1.45,
    maxWidth: "560px",
  },

  accountState: {
    marginTop: "6px",
    color: "#777",
    fontSize: "13px",
  },

  editButton: {
    border: "none",
    background: "#111",
    color: "#fff",
    borderRadius: "11px",
    padding:
      "9px 12px",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow:
      "0 3px 9px rgba(0,0,0,0.14)",
  },

  statsRow: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, 1fr)",
    borderTop:
      "1px solid #eeeeee",
    borderBottom:
      "1px solid #eeeeee",
    padding:
      "9px 8px",
    gap: "2px",
  },

  statButton: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "3px",
    color: "#111",
    padding: "3px",
  },

  statNumber: {
    fontSize: "19px",
    lineHeight: 1.1,
    fontWeight: 850,
  },

  statLabel: {
    fontSize: "12px",
    color: "#707070",
  },

  adminPanel: {
    margin: "12px 16px",
    padding: "14px 16px",
    borderRadius: "16px",
    background: "linear-gradient(135deg, #2e1065 0%, #1e1b4b 100%)",
    border: "1px solid #7c3aed",
    color: "#fff",
  },

  adminHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "4px",
  },

  adminTitle: {
    margin: 0,
    fontSize: "15px",
    fontWeight: "800",
    color: "#f59e0b",
  },

  adminSubtitle: {
    margin: "0 0 10px 0",
    fontSize: "11px",
    color: "#d8b4fe",
    lineHeight: "1.3",
  },

  adminInputRow: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  adminBtnGroup: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
  },

  approveBtn: {
    border: "none",
    background: "linear-gradient(135deg, #f59e0b, #d97706)",
    color: "#000",
    fontWeight: "800",
    padding: "10px",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "13px",
  },

  rejectBtn: {
    border: "1px solid #ef4444",
    background: "rgba(239, 68, 68, 0.15)",
    color: "#fca5a5",
    fontWeight: "800",
    padding: "10px",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "13px",
  },

  editPanel: {
    margin:
      "8px 16px 12px",
    padding: "16px",
    border:
      "1px solid #e4e4e4",
    borderRadius: "15px",
    background: "#fafafa",
  },

  editPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "14px",
  },

  editPanelTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 850,
  },

  editPanelDescription: {
    margin:
      "4px 0 0",
    fontSize: "13px",
    color: "#707070",
  },

  closeButton: {
    width: "34px",
    height: "34px",
    border:
      "1px solid #ddd",
    borderRadius: "9px",
    background: "#fff",
    fontSize: "22px",
    lineHeight: 1,
    cursor: "pointer",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "13px",
  },

  field: {
    display: "grid",
    gap: "6px",
  },

  fieldFull: {
    display: "grid",
    gap: "6px",
    gridColumn: "1 / -1",
  },

  fieldLabel: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#333",
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    border:
      "1px solid #d6d6d6",
    background: "#fff",
    borderRadius: "10px",
    padding:
      "11px 12px",
    fontSize: "15px",
    color: "#111",
    outline: "none",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    border:
      "1px solid #d6d6d6",
    background: "#fff",
    borderRadius: "10px",
    padding:
      "11px 12px",
    fontSize: "15px",
    color: "#111",
    resize: "vertical",
    minHeight: "95px",
  },

  fieldHint: {
    color: "#777",
    fontSize: "11px",
  },

  characterCount: {
    justifySelf: "end",
    color: "#888",
    fontSize: "11px",
  },

  privateRow: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    cursor: "pointer",
  },

  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "15px",
  },

  cancelButton: {
    border:
      "1px solid #d5d5d5",
    background: "#fff",
    color: "#111",
    borderRadius: "10px",
    padding:
      "10px 15px",
    fontWeight: 750,
    cursor: "pointer",
  },

  saveButton: {
    border: "none",
    background: "#111",
    color: "#fff",
    borderRadius: "10px",
    padding:
      "10px 16px",
    fontWeight: 800,
    cursor: "pointer",
  },

  contentTabs: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, 1fr)",
    borderTop:
      "1px solid #ededed",
    borderBottom:
      "1px solid #ededed",
    marginTop: "2px",
  },

  contentTab: {
    minHeight: "44px",
    border: "none",
    background: "#fff",
    color: "#777",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 750,
    borderBottom:
      "3px solid transparent",
  },

  activeContentTab: {
    color: "#111",
    borderBottom:
      "3px solid #111",
  },

  tabIcon: {
    fontSize: "20px",
    lineHeight: 1,
  },

  videoSection: {
    padding:
      "3px 8px 4px",
  },

  contentLoading: {
    minHeight: "230px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#777",
    fontSize: "13px",
  },

  videoGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 1fr))",
    gap: "7px",
  },

  videoCard: {
    minWidth: 0,
    overflow: "hidden",
    borderRadius: "11px",
    background: "#f6f6f6",
    border:
      "1px solid #eeeeee",
  },

  videoMedia: {
    width: "100%",
    aspectRatio: "4 / 5",
    maxHeight: "220px",
    position: "relative",
    overflow: "hidden",
    background:
      "linear-gradient(135deg, #171717, #484848)",
  },

  videoThumbnail: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  videoElement: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    background: "#111",
  },

  videoFallback: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: "34px",
    fontWeight: 900,
  },

  videoOverlay: {
    position: "absolute",
    left: "7px",
    right: "7px",
    bottom: "7px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "6px",
    color: "#fff",
    textShadow:
      "0 1px 4px rgba(0,0,0,0.8)",
  },

  playBadge: {
    fontSize: "12px",
    lineHeight: 1,
  },

  videoViews: {
    fontSize: "12px",
    fontWeight: 800,
  },

  pinnedBadge: {
    position: "absolute",
    top: "7px",
    left: "7px",
    padding:
      "4px 7px",
    borderRadius: "6px",
    background: "#111",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 800,
  },

  videoMeta: {
    padding:
      "7px 8px 8px",
  },

  videoCaption: {
    margin: 0,
    fontSize: "11px",
    lineHeight: 1.35,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    color: "#222",
  },

  videoStats: {
    marginTop: "5px",
    display: "flex",
    gap: "8px",
    color: "#777",
    fontSize: "10px",
  },

  emptyContent: {
    minHeight: "245px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding:
      "22px 15px",
  },

  emptyIcon: {
    width: "56px",
    height: "56px",
    borderRadius: "18px",
    background: "#f2f2f2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "30px",
    color: "#555",
    marginBottom: "9px",
  },

  emptyContentTitle: {
    margin:
      "0 0 5px",
    fontSize: "16px",
    fontWeight: 850,
  },

  emptyContentText: {
    margin: 0,
    maxWidth: "340px",
    color: "#777",
    fontSize: "13px",
    lineHeight: 1.45,
  },

  signOutArea: {
    padding:
      "12px 16px 17px",
  },

  signOutButton: {
    width: "100%",
    border:
      "1px solid #e1caca",
    background: "#fff",
    color: "#c40000",
    borderRadius: "11px",
    padding:
      "11px 14px",
    fontWeight: 800,
    cursor: "pointer",
  },

  message: {
    margin:
      "0 16px 16px",
    padding:
      "10px 12px",
    borderRadius: "10px",
    fontSize: "13px",
    lineHeight: 1.4,
  },

  successMessage: {
    background: "#ebf8ef",
    color: "#176b2c",
    border:
      "1px solid #c9ead2",
  },

  errorMessage: {
    background: "#fff0f0",
    color: "#b00020",
    border:
      "1px solid #f0cccc",
  },

  backButton: {
    alignSelf: "flex-start",
    margin: "15px",
    border:
      "1px solid #ddd",
    background: "#fff",
    color: "#111",
    borderRadius: "10px",
    padding:
      "9px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },

  emptyTitle: {
    margin:
      "25px 15px 5px",
  },

  emptyText: {
    margin:
      "0 15px",
    color: "#666",
  },
};

// 🖼️ Framing & Zoom Modal Styles
const cropStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    padding: "20px",
  },
  modal: {
    width: "100%",
    maxWidth: "360px",
    backgroundColor: "#18181b",
    color: "#ffffff",
    borderRadius: "20px",
    padding: "24px",
    textAlign: "center",
    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
    border: "1px solid #27272a",
  },
  title: {
    margin: "0 0 6px 0",
    fontSize: "18px",
    fontWeight: "700",
  },
  subtitle: {
    margin: "0 0 20px 0",
    fontSize: "12px",
    color: "#a1a1aa",
  },
  viewport: {
    width: "220px",
    height: "220px",
    borderRadius: "50%",
    overflow: "hidden",
    margin: "0 auto 20px auto",
    border: "3px solid #6366f1",
    position: "relative",
    backgroundColor: "#000000",
    cursor: "grab",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    pointerEvents: "none",
  },
  sliderContainer: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "24px",
    fontSize: "13px",
    color: "#d4d4d8",
  },
  slider: {
    flex: 1,
    accentColor: "#6366f1",
  },
  buttonRow: {
    display: "flex",
    gap: "12px",
  },
  cancelBtn: {
    flex: 1,
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #3f3f46",
    backgroundColor: "transparent",
    color: "#d4d4d8",
    fontWeight: "600",
    cursor: "pointer",
  },
  saveBtn: {
    flex: 1,
    padding: "12px",
    borderRadius: "12px",
    border: "none",
    backgroundColor: "#6366f1",
    color: "#ffffff",
    fontWeight: "600",
    cursor: "pointer",
  },
};

function DraftCard({ draft, onOpenDraft }) {
  const thumbnail = draft.thumbnailURL || "";
  const date = draft.savedAt ? new Date(draft.savedAt).toLocaleString() : "Saved draft";
  return (
    <button type="button" onClick={() => onOpenDraft?.(draft.id)} style={{ ...styles.videoCard, border: "0", padding: 0, textAlign: "left", cursor: "pointer", position: "relative", overflow: "hidden" }}>
      {thumbnail ? (draft.mediaType === "video" ? <video src={thumbnail} muted playsInline preload="metadata" style={styles.videoCardMedia} /> : <img src={thumbnail} alt="Draft" style={styles.videoCardMedia} />) : <div style={styles.videoCardMedia}>Draft</div>}
      <div style={{ position: "absolute", left: 8, top: 8, padding: "4px 7px", borderRadius: 999, background: "rgba(0,0,0,.72)", color: "#fff", fontSize: 11, fontWeight: 700 }}>DRAFT</div>
      <div style={{ padding: "8px 9px" }}><strong style={{ display: "block", fontSize: 13 }}>{draft.contentType === "reel" ? "Reel draft" : "Post draft"}</strong><span style={{ display: "block", fontSize: 11, opacity: .65, marginTop: 3 }}>{date}</span></div>
    </button>
  );
}

export default Profile;