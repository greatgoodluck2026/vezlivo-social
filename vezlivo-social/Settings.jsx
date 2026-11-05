import React, { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
  deleteUser,
  signOut,
} from "firebase/auth";

import {
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
} from "firebase/database";

import { auth, database } from "./firebase.js";

const VEZLIVO_OWNER_UID = "on5ap1c78dNbSdQLvp4Hb7XlwGw2";

const DEFAULT_PRIVACY = {
  isPrivate: false,
  whoCanFollow: "Everyone",
  whoCanComment: "Everyone",
  whoCanMessage: "Everyone",
  whoCanMention: "Everyone",
  activityStatus: true,
};

const DEFAULT_NOTIFICATIONS = {
  likes: true,
  comments: true,
  followers: true,
  messages: true,
  mentions: true,
  system: true,
};

function Settings({ onBack }) {
  const [page, setPage] = useState("main");
  const [user, setUser] = useState(auth.currentUser);
  const [profile, setProfile] = useState(null);
  const [privacy, setPrivacy] =
    useState(DEFAULT_PRIVACY);
  const [notifications, setNotifications] =
    useState(DEFAULT_NOTIFICATIONS);
  const [warnings, setWarnings] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const success = (text) => {
    setError("");
    setMessage(text);
  };

  const fail = (text) => {
    setMessage("");
    setError(text);
  };

  const clearMessage = () => {
    setMessage("");
    setError("");
  };

  useEffect(() => {
    return auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const uid = currentUser.uid;

        const [u, p, n] = await Promise.all([
          get(ref(database, `users/${uid}`)),
          get(ref(database, `users/${uid}/privacySettings`)),
          get(
            ref(
              database,
              `users/${uid}/notificationSettings`
            )
          ),
        ]);

        setProfile(
          u.exists()
            ? u.val()
            : {
                displayName:
                  currentUser.displayName || "",
                username: "",
                email: currentUser.email || "",
                phoneNumber:
                  currentUser.phoneNumber || "",
                isPrivate: false,
              }
        );

        setPrivacy({
          ...DEFAULT_PRIVACY,
          ...(p.exists() ? p.val() : {}),
        });

        setNotifications({
          ...DEFAULT_NOTIFICATIONS,
          ...(n.exists() ? n.val() : {}),
        });
      } catch (e) {
        console.error(e);
        fail("Unable to load your settings.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    const warningRef = ref(
      database,
      `safetyRecords/${user.uid}/warnings`
    );

    return onValue(warningRef, (snap) => {
      const data = snap.val() || {};

      setWarnings(
        Object.entries(data)
          .map(([id, value]) => ({
            id,
            ...(value || {}),
          }))
          .sort(
            (a, b) =>
              Number(b.createdAt || 0) -
              Number(a.createdAt || 0)
          )
      );
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const blockedRef = ref(
      database,
      `blocked/${user.uid}`
    );

    return onValue(blockedRef, (snap) => {
      const data = snap.val() || {};

      setBlocked(
        Object.entries(data).map(
          ([uid, value]) => ({
            uid,
            ...(value || {}),
          })
        )
      );
    });
  }, [user]);

  useEffect(() => {
    const handleBack = (event) => {
      if (event.state?.vezlivoSettings) {
        setPage(
          event.state.page || "main"
        );
      } else {
        setPage("main");
      }

      clearMessage();
    };

    window.addEventListener(
      "popstate",
      handleBack
    );

    return () =>
      window.removeEventListener(
        "popstate",
        handleBack
      );
  }, []);

  const openPage = (nextPage) => {
    clearMessage();

    window.history.pushState(
      {
        vezlivoSettings: true,
        page: nextPage,
      },
      "",
      window.location.href
    );

    setPage(nextPage);
  };

  const goBack = () => {
    clearMessage();

    if (page === "main") {
      onBack?.();
    } else {
      window.history.back();
    }
  };

  const savePrivacy = async (changes) => {
    if (!user) return;

    const next = {
      ...privacy,
      ...changes,
    };

    setPrivacy(next);

    try {
      await set(
        ref(
          database,
          `users/${user.uid}/privacySettings`
        ),
        next
      );

      await update(
        ref(database, `users/${user.uid}`),
        {
          isPrivate: next.isPrivate,
        }
      );

      setProfile((old) => ({
        ...(old || {}),
        isPrivate: next.isPrivate,
      }));

      success("Privacy settings saved.");
    } catch (e) {
      console.error(e);
      setPrivacy(privacy);
      fail("Unable to save privacy settings.");
    }
  };

  const saveNotification = async (key, value) => {
    if (!user) return;

    const next = {
      ...notifications,
      [key]: value,
    };

    setNotifications(next);

    try {
      await set(
        ref(
          database,
          `users/${user.uid}/notificationSettings`
        ),
        next
      );

      success("Notification setting saved.");
    } catch (e) {
      console.error(e);
      setNotifications(notifications);
      fail("Unable to save notification setting.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onBack?.();
    } catch (e) {
      console.error(e);
      fail("Unable to log out.");
    }
  };

  if (loading) {
    return (
      <main className="settings-page">
        <section className="settings-card">
          <Header
            title="Settings"
            onBack={onBack}
          />
          <div className="settings-loading">
            Loading your settings...
          </div>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="settings-page">
        <section className="settings-card">
          <Header
            title="Settings"
            onBack={onBack}
          />
          <div className="empty-settings-box">
            <strong>Please log in</strong>
            <p>
              You must be logged in to use
              Vezlivo Settings.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const common = {
    user,
    profile,
    setProfile,
    onBack: goBack,
    success,
    fail,
    message,
    error,
  };

  if (page === "account")
    return <AccountPage {...common} />;

  if (page === "security")
    return <SecurityPage {...common} openPage={openPage} />;

  if (page === "change-password")
    return <ChangePasswordPage {...common} />;

  if (page === "change-email")
    return <ChangeEmailPage {...common} />;

  if (page === "contact")
    return <ContactPage {...common} />;

  if (page === "delete-account")
    return <DeleteAccountPage {...common} />;

  if (page === "privacy")
    return (
      <PrivacyPage
        {...common}
        privacy={privacy}
        savePrivacy={savePrivacy}
        openPage={openPage}
      />
    );

  if (page === "follow-control")
    return (
      <ChoicePage
        title="Who can follow you"
        description="Choose who can follow you."
        value={privacy.whoCanFollow}
        options={[
          "Everyone",
          "People I approve",
        ]}
        onChange={(value) =>
          savePrivacy({
            whoCanFollow: value,
          })
        }
        onBack={goBack}
      />
    );

  if (page === "comment-control")
    return (
      <ChoicePage
        title="Who can comment"
        description="Choose who can comment on your content."
        value={privacy.whoCanComment}
        options={[
          "Everyone",
          "Followers",
          "No one",
        ]}
        onChange={(value) =>
          savePrivacy({
            whoCanComment: value,
          })
        }
        onBack={goBack}
      />
    );

  if (page === "message-control")
    return (
      <ChoicePage
        title="Who can message you"
        description="Choose who can message you."
        value={privacy.whoCanMessage}
        options={[
          "Everyone",
          "Followers",
          "No one",
        ]}
        onChange={(value) =>
          savePrivacy({
            whoCanMessage: value,
          })
        }
        onBack={goBack}
      />
    );

  if (page === "mention-control")
    return (
      <ChoicePage
        title="Who can mention you"
        description="Choose who can mention you."
        value={privacy.whoCanMention}
        options={[
          "Everyone",
          "Followers",
          "No one",
        ]}
        onChange={(value) =>
          savePrivacy({
            whoCanMention: value,
          })
        }
        onBack={goBack}
      />
    );

  if (page === "activity-status")
    return (
      <TogglePage
        title="Activity status"
        description="Choose whether people can see when you are active."
        value={privacy.activityStatus}
        onChange={(value) =>
          savePrivacy({
            activityStatus: value,
          })
        }
        onBack={goBack}
      />
    );

  if (page === "blocked")
    return (
      <BlockedPage
        {...common}
        blocked={blocked}
      />
    );

  if (page === "safety")
    return (
      <SafetyPage
        {...common}
        warnings={warnings}
        openPage={openPage}
      />
    );

  if (page === "safety-record")
    return (
      <SafetyRecordPage
        warnings={warnings}
        onBack={goBack}
      />
    );

  if (page === "safety-appeal")
    return (
      <SafetyAppealPage
        {...common}
      />
    );

  if (page === "copyright")
    return (
      <CopyrightPage
        onBack={goBack}
        openPage={openPage}
      />
    );

  if (page === "copyright-policy")
    return (
      <DocumentPage
        title="Copyright Policy"
        icon="©️"
        text="Only upload content you have the right or permission to share. Vezlivo may remove content when it receives a valid copyright complaint. Repeated or serious infringement may lead to account restrictions. If you believe a copyright action was incorrect, use the Copyright appeal form."
        onBack={goBack}
      />
    );

  if (page === "copyright-claims")
    return <CopyrightClaimsPage {...common} />;

  if (page === "copyright-report")
    return <CopyrightReportPage {...common} />;

  if (page === "copyright-appeal")
    return <CopyrightAppealPage {...common} />;

  if (page === "notifications")
    return (
      <NotificationsPage
        user={user}
        notifications={notifications}
        saveNotification={saveNotification}
        onBack={goBack}
      />
    );

  if (page === "help")
    return (
      <HelpPage
        onBack={goBack}
        openPage={openPage}
      />
    );

  if (page === "help-chat")
    return <HelpCenterChatPage {...common} openPage={openPage} />;

  if (page.startsWith("help-"))
    return (
      <HelpArticle
        page={page}
        onBack={goBack}
      />
    );

  if (page === "report")
    return (
      <ReportPage
        onBack={goBack}
        openPage={openPage}
      />
    );

  if (page === "report-form")
    return <ReportFormPage {...common} />;

  if (page === "support-chat")
    return <SupportChatPage {...common} />;

  if (page === "owner-support")
    return <OwnerSupportPage {...common} />;

  if (page === "support")
    return <SupportChatPage {...common} />;

  if (page === "about")
    return (
      <AboutPage
        onBack={goBack}
        openPage={openPage}
      />
    );

  if (page === "terms")
    return (
      <DocumentPage
        title="Terms of Service"
        icon="📄"
        text="By using Vezlivo, you agree to use the platform responsibly and respect other users."
        onBack={goBack}
      />
    );

  if (page === "privacy-policy")
    return (
      <DocumentPage
        title="Privacy Policy"
        icon="🔐"
        text="Vezlivo may store account, profile, content and activity information needed to provide the service."
        onBack={goBack}
      />
    );

  return (
    <SettingsHome
      privacy={privacy}
      warnings={warnings}
      blocked={blocked}
      message={message}
      error={error}
      isOwner={user.uid === VEZLIVO_OWNER_UID}
      openPage={openPage}
      onBack={onBack}
      onLogout={handleLogout}
    />
  );
}

function Header({ title, onBack }) {
  return (
    <header className="settings-header">
      <button
        type="button"
        className="settings-back-button"
        onClick={onBack}
      >
        ← Back
      </button>
      <h1>{title}</h1>
      <span />
    </header>
  );
}

function Row({
  icon,
  title,
  subtitle,
  onClick,
  danger = false,
}) {
  return (
    <button
      type="button"
      className={
        danger
          ? "settings-row danger"
          : "settings-row"
      }
      onClick={onClick}
    >
      <span className="settings-row-left">
        <span className="settings-row-icon">
          {icon}
        </span>
        <span className="settings-row-content">
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
      </span>
      <span className="settings-row-arrow">
        ›
      </span>
    </button>
  );
}

function SettingsHome({
  isOwner,
  privacy,
  warnings,
  blocked,
  message,
  error,
  openPage,
  onBack,
  onLogout,
}) {
  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Settings"
          onBack={onBack}
        />

        {message && (
          <p className="profile-message success">
            {message}
          </p>
        )}

        {error && (
          <p className="profile-message">
            {error}
          </p>
        )}

        <div className="settings-profile-summary">
          <div className="settings-profile-icon">
            ⚙️
          </div>
          <div>
            <strong>Vezlivo Settings</strong>
            <p>
              Manage your account and
              experience.
            </p>
          </div>
        </div>

        <Section title="Account">
          <Row
            icon="👤"
            title="Account information"
            subtitle="Profile, username and account ID"
            onClick={() =>
              openPage("account")
            }
          />
          <Row
            icon="🔑"
            title="Password & security"
            subtitle="Password and security options"
            onClick={() =>
              openPage("security")
            }
          />
          <Row
            icon="📱"
            title="Phone & email"
            subtitle="Manage contact information"
            onClick={() =>
              openPage("contact")
            }
          />
          <Row
            icon="🗑️"
            title="Delete account"
            subtitle="Permanently remove your account"
            danger
            onClick={() =>
              openPage("delete-account")
            }
          />
        </Section>

        <Section title="Privacy">
          <Row
            icon="🔒"
            title="Privacy settings"
            subtitle={
              privacy.isPrivate
                ? "Private account"
                : "Public account"
            }
            onClick={() =>
              openPage("privacy")
            }
          />
          <Row
            icon="👥"
            title="Who can follow you"
            subtitle={privacy.whoCanFollow}
            onClick={() =>
              openPage("follow-control")
            }
          />
          <Row
            icon="💬"
            title="Comments & messages"
            subtitle="Control interactions"
            onClick={() =>
              openPage("comment-control")
            }
          />
          <Row
            icon="🚫"
            title="Blocked accounts"
            subtitle={`${blocked.length} blocked`}
            onClick={() =>
              openPage("blocked")
            }
          />
          <Row
            icon="🟢"
            title="Activity status"
            subtitle={
              privacy.activityStatus
                ? "On"
                : "Off"
            }
            onClick={() =>
              openPage("activity-status")
            }
          />
        </Section>

        <Section title="Safety & Policies">
          <Row
            icon="🛡️"
            title="Vezlivo Safety Standards"
            subtitle={`${warnings.length} warning${
              warnings.length === 1
                ? ""
                : "s"
            }`}
            onClick={() =>
              openPage("safety")
            }
          />
          <Row
            icon="©️"
            title="Copyright"
            subtitle="Copyright reports and appeals"
            onClick={() =>
              openPage("copyright")
            }
          />
        </Section>

        <Section title="Notifications">
          <Row
            icon="🔔"
            title="Notification settings"
            subtitle="Choose what you receive"
            onClick={() =>
              openPage("notifications")
            }
          />
        </Section>

        <Section title="Help & Support">
          <Row
            icon="❓"
            title="Help Center"
            subtitle="Find answers and guides"
            onClick={() =>
              openPage("help")
            }
          />
          <Row
            icon="🚨"
            title="Report a problem"
            subtitle="Tell us about an issue"
            onClick={() =>
              openPage("report")
            }
          />
          <Row
            icon="🎧"
            title="Vezlivo Support"
            subtitle="Contact support"
            onClick={() =>
              openPage("support")
            }
          />
        </Section>

        {isOwner && (
          <Section title="Owner tools">
            <Row
              icon="🛠️"
              title="Support inbox"
              subtitle="Owner support conversations"
              onClick={() =>
                openPage("owner-support")
              }
            />
          </Section>
        )}

        <Section title="About Vezlivo">
          <Row
            icon="ℹ️"
            title="About Vezlivo"
            onClick={() =>
              openPage("about")
            }
          />
          <Row
            icon="📄"
            title="Terms of Service"
            onClick={() =>
              openPage("terms")
            }
          />
          <Row
            icon="🔐"
            title="Privacy Policy"
            onClick={() =>
              openPage("privacy-policy")
            }
          />
          <div className="settings-row settings-row-static">
            <span className="settings-row-left">
              <span className="settings-row-icon">
                ℹ️
              </span>
              <span className="settings-row-content">
                <strong>Version</strong>
              </span>
            </span>
            <span className="settings-version">
              1.0.0
            </span>
          </div>
        </Section>

        <button
          type="button"
          className="settings-signout-button"
          onClick={onLogout}
        >
          Log out
        </button>
      </section>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <div className="settings-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function AccountPage({
  user,
  profile,
  setProfile,
  onBack,
  success,
  fail,
}) {
  const [displayName, setDisplayName] = useState(
    profile?.displayName || user.displayName || ""
  );
  const [username, setUsername] = useState(
    profile?.username || ""
  );
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    if (!user) return;

    setSaving(true);

    try {
      await update(
        ref(database, `users/${user.uid}`),
        {
          displayName: displayName.trim(),
          username: username.trim().replace(/^@/, ""),
        }
      );

      setProfile((old) => ({
        ...(old || {}),
        displayName: displayName.trim(),
        username: username.trim().replace(/^@/, ""),
      }));

      success("Account information saved.");
    } catch (e) {
      console.error(e);
      fail("Unable to save account information.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Account information"
          onBack={onBack}
        />

        <div className="settings-form">
          <label>
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(e) =>
                setDisplayName(e.target.value)
              }
              placeholder="Your display name"
            />
            <small>
              You can change your display name every
              7 days.
            </small>
          </label>

          <label>
            <span>Username</span>
            <input
              value={username}
              onChange={(e) =>
                setUsername(e.target.value)
              }
              placeholder="@username"
            />
            <small>
              You can change your username every
              30 days.
            </small>
          </label>

          <label>
            <span>Email</span>
            <input
              value={user.email || ""}
              readOnly
            />
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={saveProfile}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </section>
    </main>
  );
}

function SecurityPage({
  user,
  onBack,
  openPage,
}) {
  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Password & security"
          onBack={onBack}
        />

        <Section title="Security">
          <Row
            icon="🔑"
            title="Change password"
            subtitle="Update your Vezlivo password"
            onClick={() =>
              openPage("change-password")
            }
          />

          <Row
            icon="📧"
            title="Change email"
            subtitle={user.email || "No email"}
            onClick={() =>
              openPage("change-email")
            }
          />
        </Section>
      </section>
    </main>
  );
}

function ChangePasswordPage({
  user,
  onBack,
  success,
  fail,
}) {
  const [currentPassword, setCurrentPassword] =
    useState("");
  const [newPassword, setNewPassword] =
    useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [saving, setSaving] = useState(false);

  const changePassword = async () => {
    if (!user.email) {
      fail(
        "Password change requires an email/password account."
      );
      return;
    }

    if (!currentPassword || !newPassword) {
      fail("Please fill in all password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      fail("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      fail(
        "Your new password must be at least 6 characters."
      );
      return;
    }

    setSaving(true);

    try {
      const credential =
        EmailAuthProvider.credential(
          user.email,
          currentPassword
        );

      await reauthenticateWithCredential(
        user,
        credential
      );

      await updatePassword(
        user,
        newPassword
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      success("Password changed successfully.");
    } catch (e) {
      console.error(e);

      if (
        e.code ===
        "auth/invalid-credential"
      ) {
        fail("Your current password is incorrect.");
      } else {
        fail(
          "Unable to change your password. Please try again."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Change password"
          onBack={onBack}
        />

        <div className="settings-form">
          <label>
            <span>Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) =>
                setCurrentPassword(e.target.value)
              }
            />
          </label>

          <label>
            <span>New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) =>
                setNewPassword(e.target.value)
              }
            />
          </label>

          <label>
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
            />
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={changePassword}
            disabled={saving}
          >
            {saving
              ? "Changing..."
              : "Change password"}
          </button>
        </div>
      </section>
    </main>
  );
}

function ChangeEmailPage({
  user,
  onBack,
  success,
  fail,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] =
    useState("");
  const [saving, setSaving] = useState(false);

  const changeEmail = async () => {
    if (!user.email) {
      fail(
        "Email change is unavailable for this account."
      );
      return;
    }

    if (!email || !password) {
      fail("Enter your new email and password.");
      return;
    }

    setSaving(true);

    try {
      const credential =
        EmailAuthProvider.credential(
          user.email,
          password
        );

      await reauthenticateWithCredential(
        user,
        credential
      );

      await verifyBeforeUpdateEmail(
        user,
        email.trim()
      );

      setEmail("");
      setPassword("");

      success(
        "A verification email has been sent. Follow the email instructions to confirm the new address."
      );
    } catch (e) {
      console.error(e);

      if (
        e.code === "auth/email-already-in-use"
      ) {
        fail(
          "That email is already being used."
        );
      } else {
        fail(
          "Unable to start the email change."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Change email"
          onBack={onBack}
        />

        <div className="settings-form">
          <label>
            <span>Current email</span>
            <input
              value={user.email || ""}
              readOnly
            />
          </label>

          <label>
            <span>New email</span>
            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="new@email.com"
            />
          </label>

          <label>
            <span>Current password</span>
            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
            />
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={changeEmail}
            disabled={saving}
          >
            {saving
              ? "Sending..."
              : "Verify new email"}
          </button>
        </div>
      </section>
    </main>
  );
}

function ContactInformationPage({
  user,
  profile,
  setProfile,
  onBack,
  success,
  fail,
}) {
  const [phone, setPhone] = useState(
    profile?.phoneNumber ||
      user.phoneNumber ||
      ""
  );
  const [saving, setSaving] = useState(false);

  const savePhone = async () => {
    if (!user) return;

    setSaving(true);

    try {
      await update(
        ref(database, `users/${user.uid}`),
        {
          phoneNumber: phone.trim(),
        }
      );

      setProfile((old) => ({
        ...(old || {}),
        phoneNumber: phone.trim(),
      }));

      success("Phone information saved.");
    } catch (e) {
      console.error(e);
      fail("Unable to save phone information.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Phone & email"
          onBack={onBack}
        />

        <div className="settings-form">
          <label>
            <span>Email</span>
            <input
              value={user.email || ""}
              readOnly
            />
          </label>

          <label>
            <span>Phone number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
              placeholder="Phone number"
            />
            <small>
              This saves your profile contact
              information. Phone authentication
              requires separate Firebase phone
              verification.
            </small>
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={savePhone}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save phone"}
          </button>
        </div>
      </section>
    </main>
  );
}

/* Keep the name used by Part 1. */
function ContactPage(props) {
  return <ContactInformationPage {...props} />;
}

function DeleteAccountPage({
  user,
  onBack,
  success,
  fail,
}) {
  const [password, setPassword] =
    useState("");
  const [confirm, setConfirm] =
    useState("");
  const [deleting, setDeleting] =
    useState(false);

  const deleteAccount = async () => {
    if (confirm !== "DELETE") {
      fail(
        'Type "DELETE" to confirm account deletion.'
      );
      return;
    }

    if (!user.email) {
      fail(
        "Please use your account's supported authentication method to securely reauthenticate before deletion."
      );
      return;
    }

    if (!password) {
      fail("Enter your current password.");
      return;
    }

    setDeleting(true);

    try {
      const credential =
        EmailAuthProvider.credential(
          user.email,
          password
        );

      await reauthenticateWithCredential(
        user,
        credential
      );

      const uid = user.uid;

      await remove(
        ref(database, `users/${uid}`)
      );

      await remove(
        ref(database, `blocked/${uid}`)
      );

      await remove(
        ref(
          database,
          `safetyRecords/${uid}`
        )
      );

      await deleteUser(user);

      success("Account deleted.");
    } catch (e) {
      console.error(e);

      fail(
        "Unable to delete the account. Re-enter your password and try again."
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Delete account"
          onBack={onBack}
        />

        <div className="danger-warning">
          <strong>Delete your Vezlivo account</strong>
          <p>
            This action permanently deletes your
            account information stored here. Some
            content or records may require
            server-side cleanup.
          </p>
        </div>

        <div className="settings-form">
          <label>
            <span>Current password</span>
            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
            />
          </label>

          <label>
            <span>
              Type DELETE to confirm
            </span>
            <input
              value={confirm}
              onChange={(e) =>
                setConfirm(e.target.value)
              }
              placeholder="DELETE"
            />
          </label>

          <button
            type="button"
            className="settings-danger-button"
            onClick={deleteAccount}
            disabled={deleting}
          >
            {deleting
              ? "Deleting..."
              : "Permanently delete account"}
          </button>
        </div>
      </section>
    </main>
  );
}

function PrivacyPage({
  privacy,
  savePrivacy,
  openPage,
  onBack,
}) {
  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Privacy settings"
          onBack={onBack}
        />

        <div className="settings-toggle-card">
          <div>
            <strong>Private account</strong>
            <p>
              Only people you approve can follow
              you.
            </p>
          </div>

          <input
            type="checkbox"
            checked={privacy.isPrivate}
            onChange={(e) =>
              savePrivacy({
                isPrivate: e.target.checked,
              })
            }
          />
        </div>

        <Section title="Interactions">
          <Row
            icon="👥"
            title="Who can follow you"
            subtitle={privacy.whoCanFollow}
            onClick={() =>
              openPage("follow-control")
            }
          />

          <Row
            icon="💬"
            title="Who can comment"
            subtitle={privacy.whoCanComment}
            onClick={() =>
              openPage("comment-control")
            }
          />

          <Row
            icon="✉️"
            title="Who can message you"
            subtitle={privacy.whoCanMessage}
            onClick={() =>
              openPage("message-control")
            }
          />

          <Row
            icon="@"
            title="Who can mention you"
            subtitle={privacy.whoCanMention}
            onClick={() =>
              openPage("mention-control")
            }
          />
        </Section>

        <Section title="Activity">
          <Row
            icon="🟢"
            title="Activity status"
            subtitle={
              privacy.activityStatus
                ? "On"
                : "Off"
            }
            onClick={() =>
              openPage("activity-status")
            }
          />
        </Section>
      </section>
    </main>
  );
}

function ChoicePage({
  title,
  description,
  value,
  options,
  onChange,
  onBack,
}) {
  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title={title}
          onBack={onBack}
        />

        <p className="settings-description">
          {description}
        </p>

        <div className="choice-list">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="choice-row"
              onClick={() =>
                onChange(option)
              }
            >
              <span>{option}</span>
              <span>
                {value === option ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function TogglePage({
  title,
  description,
  value,
  onChange,
  onBack,
}) {
  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title={title}
          onBack={onBack}
        />

        <div className="settings-toggle-card">
          <div>
            <strong>{title}</strong>
            <p>{description}</p>
          </div>

          <input
            type="checkbox"
            checked={value}
            onChange={(e) =>
              onChange(e.target.checked)
            }
          />
        </div>
      </section>
    </main>
  );
}

function BlockedPage({
  blocked,
  user,
  onBack,
  success,
  fail,
}) {
  const unblock = async (uid) => {
    try {
      await remove(
        ref(
          database,
          `blocked/${user.uid}/${uid}`
        )
      );

      success("Account unblocked.");
    } catch (e) {
      console.error(e);
      fail("Unable to unblock this account.");
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Blocked accounts"
          onBack={onBack}
        />

        {blocked.length === 0 ? (
          <div className="empty-settings-box">
            <strong>No blocked accounts</strong>
            <p>
              Accounts you block will appear here.
            </p>
          </div>
        ) : (
          <div className="blocked-list">
            {blocked.map((item) => (
              <div
                className="blocked-row"
                key={item.uid}
              >
                <div>
                  <strong>
                    {item.username ||
                      item.displayName ||
                      item.uid}
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    unblock(item.uid)
                  }
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
function SafetyPage({
  warnings,
  onBack,
  openPage,
}) {
  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Vezlivo Safety Standard"
          onBack={onBack}
        />

        <div className="settings-info-box">
          <strong>Our commitment to safety</strong>
          <p>
            Vezlivo is a social platform where people can share videos,
            communicate, discover content, and connect. These Safety Standards
            explain the behavior and content expected on Vezlivo.
          </p>
          <p>
            Vezlivo may remove content, restrict features, issue warnings or
            strikes, suspend accounts, or permanently remove accounts when
            these standards are violated. Enforcement can depend on severity,
            frequency, context, and the circumstances of the violation.
          </p>
        </div>

        <Section title="Age Safety">
          <div className="settings-info-box">
            <p><strong>Under 13:</strong> People under 13 cannot create or use a registered Vezlivo account. Users must not bypass this rule by providing a false birthday.</p>
            <p><strong>13–17:</strong> Teen users can use permitted social features and receive additional protections for age-appropriate interactions and content.</p>
            <p><strong>18+:</strong> Adult users may access features permitted for adults, subject to the other Vezlivo Safety Standards.</p>
            <p>Date of birth and age are private account information and should not be displayed publicly in a profile.</p>
          </div>
        </Section>

        <Section title="Romance and Relationship Content">
          <div className="settings-info-box">
            <p>Normal romantic and relationship content is allowed, including couples, dating and relationship stories, weddings and engagements, love stories, romantic music, normal affection, holding hands, and non-explicit kissing.</p>
            <p>Vezlivo is not a pornography or explicit sexual-content platform.</p>
          </div>
        </Section>

        <Section title="Sexual and Explicit Content">
          <div className="settings-info-box">
            <p>The following is prohibited on Vezlivo:</p>
            <ul>
              <li>Pornography and explicit sexual acts.</li>
              <li>Sexually explicit material intended for sexual stimulation.</li>
              <li>Sexual exploitation or solicitation.</li>
              <li>Non-consensual intimate images.</li>
              <li>Sexual blackmail or sextortion.</li>
              <li>Any sexual content involving minors.</li>
            </ul>
          </div>
        </Section>

        <Section title="Child Safety">
          <div className="settings-info-box">
            <p>Vezlivo has zero tolerance for child sexual exploitation or abuse.</p>
            <p>Users must not sexualize, groom, solicit, exploit, traffic, or encourage sexual contact with minors, or share sexual material involving minors.</p>
            <p>Serious child-safety violations may result in immediate account action and reporting to appropriate authorities or services where required.</p>
          </div>
        </Section>

        <Section title="Violence and Dangerous Activities">
          <div className="settings-info-box">
            <p>Do not post or use Vezlivo to threaten serious violence, encourage serious criminal activity, promote dangerous challenges likely to cause serious harm, or encourage activities that place children or other people in serious danger.</p>
          </div>
        </Section>

        <Section title="Hate and Abusive Conduct">
          <div className="settings-info-box">
            <p>Do not use Vezlivo for serious threats, targeted abuse, dehumanizing conduct, or encouragement of violence against people or groups.</p>
          </div>
        </Section>

        <Section title="Scams and Fraud">
          <div className="settings-info-box">
            <p>Do not use Vezlivo for phishing, fake giveaways, fraudulent investment schemes, fake payment requests, account theft, impersonating Vezlivo staff, fraudulent links, or attempts to steal money, accounts, passwords, verification codes, or personal information.</p>
          </div>
        </Section>

        <Section title="Impersonation">
          <div className="settings-info-box">
            <p>Do not deceptively pretend to be another person, Vezlivo employee, organization, or public figure in a way that could mislead other users.</p>
          </div>
        </Section>

        <Section title="Privacy and Personal Information">
          <div className="settings-info-box">
            <p>Do not maliciously publish another person's private address, phone number, password, financial information, private conversations, or sensitive personal information without permission.</p>
            <p>Never share your Vezlivo password, verification code, or payment PIN with another person.</p>
          </div>
        </Section>

        <Section title="Spam and Fake Engagement">
          <div className="settings-info-box">
            <p>Do not use bots, fake accounts, fake followers, fake likes, fake views, automated spam, or other methods designed to manipulate engagement or platform systems.</p>
          </div>
        </Section>

        <Section title="External Links and Other Platforms">
          <div className="settings-info-box">
            <p>Vezlivo does not automatically prohibit ordinary references to other apps or websites. Mentioning a service such as WhatsApp is not by itself a Safety Standard violation.</p>
            <p>However, malicious links, phishing, scams, malware, repeated spam, or attempts to deceive or harm users may be removed or restricted. Repeated unwanted promotion or link spam may lead to enforcement.</p>
          </div>
        </Section>

        <Section title="Copyright">
          <div className="settings-info-box">
            <p>Only upload videos, music, images, and other material that you created or that you have the legal right or permission to use.</p>
            <p>Repeated unauthorized use of copyrighted material may lead to content removal or account enforcement. Copyright complaints can be reported through the appropriate Vezlivo reporting process.</p>
          </div>
        </Section>

        <Section title="Messages and Comments">
          <div className="settings-info-box">
            <p>Messages and comments must follow the Safety Standards. Harassment, threats, sexual exploitation, hate or serious abuse, scams, spam, and other prohibited material may be removed.</p>
            <p>Users can block accounts and report messages or comments that violate the standards.</p>
          </div>
        </Section>

        <Section title="Reporting">
          <div className="settings-info-box">
            <p>Users can report videos, profiles, comments, messages, or other inappropriate behavior.</p>
            <p>Report categories can include child safety, sexual or explicit content, harassment or bullying, hate or abuse, violence, dangerous activity, scams or fraud, spam, copyright, privacy, and other safety concerns.</p>
          </div>
        </Section>

        <Section title="Blocking">
          <div className="settings-info-box">
            <p>Users can block accounts they do not want to interact with. Blocking can prevent or restrict unwanted messages, comments, and following according to Vezlivo's feature controls.</p>
          </div>
        </Section>

        <Section title="Warnings, Strikes and Restrictions">
          <div className="settings-info-box">
            <p><strong>Warning:</strong> A minor or first violation may result in content removal, a warning, and a safety record.</p>
            <p><strong>Strike:</strong> A serious or repeated violation may result in content removal, a strike, and temporary feature restrictions.</p>
            <p><strong>Temporary restriction or suspension:</strong> Vezlivo may temporarily restrict posting, commenting, messaging, or other features.</p>
            <p><strong>Permanent ban:</strong> Serious or persistent violations may result in permanent account removal. Severe violations may result in immediate permanent action rather than waiting for multiple warnings.</p>
            <p>Vezlivo does not promise a fixed number of strikes before a ban. Enforcement considers severity, frequency, context, and circumstances.</p>
          </div>
        </Section>

        <Section title="Ban Evasion">
          <div className="settings-info-box">
            <p>Users who create or use additional accounts to evade a Vezlivo ban or restriction may receive additional enforcement.</p>
          </div>
        </Section>

        <Section title="Appeals">
          <div className="settings-info-box">
            <p>When an enforcement decision is eligible for appeal, users can request a review through the available Vezlivo appeal process.</p>
            <p>An appeal does not automatically restore restricted access while the review is pending.</p>
          </div>
        </Section>

        <Section title="Account Security">
          <div className="settings-info-box">
            <p>Use a strong password, protect your verification codes, avoid suspicious links, and report suspicious account activity. Vezlivo staff should not ask for your password or payment PIN.</p>
          </div>
        </Section>

        <Section title="Moderation">
          <div className="settings-info-box">
            <p>Vezlivo may review reports, content, accounts, and safety signals. Depending on the situation, Vezlivo may remove content, restrict features, issue warnings or strikes, suspend accounts, or permanently remove accounts.</p>
            <p>Moderation decisions may consider the seriousness of the violation, repeated behavior, context, impact, and other relevant circumstances.</p>
          </div>
        </Section>

        <Section title="Safety Reminders">
          <div className="settings-info-box">
            <ul>
              <li>Never share your password or verification code.</li>
              <li>Do not send money to strangers because of a Vezlivo message.</li>
              <li>Do not publish private addresses or other sensitive personal information.</li>
              <li>Be careful when communicating with people you do not know.</li>
              <li>Block users who make you uncomfortable.</li>
              <li>Report content or behavior that violates the Safety Standards.</li>
            </ul>
          </div>
        </Section>

        <div className="settings-info-box">
          <strong>Our goal</strong>
          <p>
            Vezlivo is designed for creativity, entertainment, communication,
            and positive social interaction. These standards are intended to
            protect users, especially children and teens, while allowing normal
            social and creative expression.
          </p>
          <p>
            Vezlivo may update these standards as the platform grows and safety
            requirements change.
          </p>
        </div>

        <Section title="Your Safety Record">
          <Row
            icon="📋"
            title="Safety record"
            subtitle={`${warnings.length} warning${warnings.length === 1 ? "" : "s"}`}
            onClick={() => openPage("safety-record")}
          />

          <Row
            icon="📝"
            title="Appeal a warning"
            subtitle="Ask Vezlivo to review a warning"
            onClick={() => openPage("safety-appeal")}
          />
        </Section>
      </section>
    </main>
  );
}

function SafetyRecordPage({
  warnings,
  onBack,
}) {
  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Safety record"
          onBack={onBack}
        />

        {warnings.length === 0 ? (
          <div className="empty-settings-box">
            <strong>No warnings</strong>
            <p>
              You currently have no recorded
              safety warnings.
            </p>
          </div>
        ) : (
          <div className="warning-list">
            {warnings.map((warning) => (
              <article
                className="warning-card"
                key={warning.id}
              >
                <strong>
                  {warning.reason ||
                    "Safety Standards warning"}
                </strong>

                {warning.postId && (
                  <p>
                    Post: {warning.postId}
                  </p>
                )}

                {warning.createdAt && (
                  <p>
                    Date:{" "}
                    {new Date(
                      Number(warning.createdAt)
                    ).toLocaleString()}
                  </p>
                )}

                {warning.status && (
                  <p>
                    Status: {warning.status}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SafetyAppealPage({
  user,
  onBack,
  success,
  fail,
}) {
  const [warningId, setWarningId] =
    useState("");
  const [reason, setReason] =
    useState("");
  const [sending, setSending] =
    useState(false);

  const submitAppeal = async () => {
    if (!warningId.trim() || !reason.trim()) {
      fail(
        "Enter the warning ID and your appeal reason."
      );
      return;
    }

    setSending(true);

    try {
      const ticketRef = ref(
        database,
        `supportTickets/${user.uid}`
      );
      const ticketSnap = await get(ticketRef);
      const now = Date.now();

      if (!ticketSnap.exists()) {
        await set(ticketRef, {
          userId: user.uid,
          ownerUid: VEZLIVO_OWNER_UID,
          status: "appeal-pending",
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await update(ticketRef, {
          status: "appeal-pending",
          updatedAt: now,
        });
      }

      const messageRef = push(
        ref(database, `supportTickets/${user.uid}/messages`)
      );

      await set(messageRef, {
        senderUid: user.uid,
        sender: "user",
        type: "safety-appeal",
        warningId: warningId.trim(),
        text: `SAFETY APPEAL\nWarning ID: ${warningId.trim()}\n\n${reason.trim()}`,
        createdAt: now,
      });

      setWarningId("");
      setReason("");

      success(
        "Your safety appeal was sent to Vezlivo Support for human review. Your current restriction, if any, remains in place while the appeal is reviewed."
      );
    } catch (e) {
      console.error(e);
      fail("Unable to submit your appeal.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Appeal a warning"
          onBack={onBack}
        />

        <div className="settings-form">
          <label>
            <span>Warning ID</span>
            <input
              value={warningId}
              onChange={(e) =>
                setWarningId(e.target.value)
              }
              placeholder="Warning ID"
            />
          </label>

          <label>
            <span>Appeal reason</span>
            <textarea
              value={reason}
              onChange={(e) =>
                setReason(e.target.value)
              }
              placeholder="Explain why you believe the warning should be reviewed."
              rows="6"
            />
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={submitAppeal}
            disabled={sending}
          >
            {sending
              ? "Submitting..."
              : "Submit appeal"}
          </button>
        </div>
      </section>
    </main>
  );
}

function CopyrightPage({
  onBack,
  openPage,
}) {
  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Copyright"
          onBack={onBack}
        />

        <div className="settings-info-box">
          <strong>Copyright is separate</strong>
          <p>
            Copyright complaints and appeals are
            handled separately from Vezlivo Safety
            Standards.
          </p>
        </div>

        <Section title="Copyright">
          <Row
            icon="📖"
            title="Copyright Policy"
            subtitle="Learn about copyright on Vezlivo"
            onClick={() =>
              openPage("copyright-policy")
            }
          />

          <Row
            icon="©️"
            title="Copyright claims"
            subtitle="View or ask about a copyright claim"
            onClick={() =>
              openPage("copyright-claims")
            }
          />

          <Row
            icon="🚨"
            title="Report infringement"
            subtitle="Report content you believe infringes copyright"
            onClick={() =>
              openPage("copyright-report")
            }
          />

          <Row
            icon="📝"
            title="Copyright appeal"
            subtitle="Submit an appeal"
            onClick={() =>
              openPage("copyright-appeal")
            }
          />
        </Section>
      </section>
    </main>
  );
}

function CopyrightClaimsPage({
  user,
  onBack,
  success,
  fail,
}) {
  const [claims, setClaims] =
    useState([]);

  useEffect(() => {
    const claimsRef = ref(
      database,
      `copyrightClaims/${user.uid}`
    );

    return onValue(claimsRef, (snap) => {
      const data = snap.val() || {};

      setClaims(
        Object.entries(data).map(
          ([id, value]) => ({
            id,
            ...(value || {}),
          })
        )
      );
    });
  }, [user]);

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Copyright claims"
          onBack={onBack}
        />

        {claims.length === 0 ? (
          <div className="empty-settings-box">
            <strong>No copyright claims</strong>
            <p>
              Copyright claims associated with
              your account will appear here.
            </p>
          </div>
        ) : (
          <div className="warning-list">
            {claims.map((claim) => (
              <article
                className="warning-card"
                key={claim.id}
              >
                <strong>
                  {claim.title ||
                    "Copyright claim"}
                </strong>
                <p>
                  Status:{" "}
                  {claim.status || "Pending"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function CopyrightReportPage({
  user,
  onBack,
  success,
  fail,
}) {
  const [contentId, setContentId] =
    useState("");
  const [details, setDetails] =
    useState("");
  const [sending, setSending] =
    useState(false);

  const submit = async () => {
    if (!contentId.trim() || !details.trim()) {
      fail("Complete all fields.");
      return;
    }

    setSending(true);

    try {
      const reportRef = push(
        ref(database, "copyrightReports")
      );

      await set(reportRef, {
        userId: user.uid,
        contentId: contentId.trim(),
        details: details.trim(),
        status: "pending",
        createdAt: Date.now(),
      });

      setContentId("");
      setDetails("");

      success(
        "Copyright report submitted."
      );
    } catch (e) {
      console.error(e);
      fail(
        "Unable to submit copyright report."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Report infringement"
          onBack={onBack}
        />

        <div className="settings-form">
          <label>
            <span>Content ID or link</span>
            <input
              value={contentId}
              onChange={(e) =>
                setContentId(e.target.value)
              }
            />
          </label>

          <label>
            <span>Details</span>
            <textarea
              rows="6"
              value={details}
              onChange={(e) =>
                setDetails(e.target.value)
              }
              placeholder="Explain the copyright issue."
            />
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={submit}
            disabled={sending}
          >
            {sending
              ? "Submitting..."
              : "Submit report"}
          </button>
        </div>
      </section>
    </main>
  );
}

function CopyrightAppealPage({
  user,
  onBack,
  success,
  fail,
}) {
  const [claimId, setClaimId] =
    useState("");
  const [reason, setReason] =
    useState("");
  const [sending, setSending] =
    useState(false);

  const submit = async () => {
    if (!claimId.trim() || !reason.trim()) {
      fail("Complete all fields.");
      return;
    }

    setSending(true);

    try {
      const appealRef = push(
        ref(database, "copyrightAppeals")
      );

      await set(appealRef, {
        userId: user.uid,
        claimId: claimId.trim(),
        reason: reason.trim(),
        status: "pending",
        createdAt: Date.now(),
      });

      setClaimId("");
      setReason("");

      success(
        "Copyright appeal submitted."
      );
    } catch (e) {
      console.error(e);
      fail(
        "Unable to submit copyright appeal."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Copyright appeal"
          onBack={onBack}
        />

        <div className="settings-form">
          <label>
            <span>Claim ID</span>
            <input
              value={claimId}
              onChange={(e) =>
                setClaimId(e.target.value)
              }
            />
          </label>

          <label>
            <span>Appeal reason</span>
            <textarea
              rows="6"
              value={reason}
              onChange={(e) =>
                setReason(e.target.value)
              }
              placeholder="Explain why the copyright claim should be reviewed."
            />
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={submit}
            disabled={sending}
          >
            {sending
              ? "Submitting..."
              : "Submit appeal"}
          </button>
        </div>
      </section>
    </main>
  );
}

function NotificationsPage({
  user,
  notifications,
  saveNotification,
  onBack,
}) {
  const items = [
    ["likes", "Likes", "When someone likes your content."],
    ["comments", "Comments", "When someone comments on your content."],
    ["followers", "Followers", "When someone follows you."],
    ["messages", "Messages", "When you receive a message."],
    ["mentions", "Mentions", "When someone mentions you."],
    ["system", "Vezlivo updates", "Important account and platform notices."],
  ];

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Notifications"
          onBack={onBack}
        />

        {items.map(
          ([key, title, description]) => (
            <div
              className="settings-toggle-card"
              key={key}
            >
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>

              <input
                type="checkbox"
                checked={
                  notifications[key]
                }
                onChange={(e) =>
                  saveNotification(
                    key,
                    e.target.checked
                  )
                }
              />
            </div>
          )
        )}
      </section>
    </main>
  );
}

function HelpPage({
  onBack,
  openPage,
}) {
  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Help Center"
          onBack={onBack}
        />

        <Section title="Help">
          <Row
            icon="💡"
            title="Ask Help Center"
            subtitle="Get instant answers to common questions"
            onClick={() =>
              openPage("help-chat")
            }
          />

          <Row
            icon="🔐"
            title="Account & login"
            onClick={() =>
              openPage("help-account")
            }
          />

          <Row
            icon="👤"
            title="Profile"
            onClick={() =>
              openPage("help-profile")
            }
          />

          <Row
            icon="🎬"
            title="Posting videos"
            onClick={() =>
              openPage("help-videos")
            }
          />

          <Row
            icon="🔔"
            title="Notifications"
            onClick={() =>
              openPage("help-notifications")
            }
          />

          <Row
            icon="🛡️"
            title="Safety"
            onClick={() =>
              openPage("help-safety")
            }
          />

          <Row
            icon="©️"
            title="Copyright"
            onClick={() =>
              openPage("help-copyright")
            }
          />

          <Row
            icon="💬"
            title="Chat with Vezlivo Support"
            subtitle="Ask a question and get help"
            onClick={() =>
              openPage("support-chat")
            }
          />

          <Row
            icon="📈"
            title="Low views & recommendations"
            subtitle="Understand reach and video performance"
            onClick={() =>
              openPage("help-low-views")
            }
          />
        </Section>
      </section>
    </main>
  );
}

function getHelpCenterReply(question) {
  const original = question.trim();
  const q = original.toLowerCase();

  if (!q) {
    return {
      text: "Please type a question and I’ll help you.",
      needsSupport: false,
    };
  }

  // Simple conversational replies so the Help Center feels natural.
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(q)) {
    return {
      text: "Hello! 👋 I’m the Vezlivo Help Center. Ask me about your account, videos, comments, followers, privacy, safety, or other Vezlivo features.",
      needsSupport: false,
    };
  }

  if (
    q.includes("how are you") ||
    q.includes("how r u") ||
    q.includes("how're you")
  ) {
    return {
      text: "I’m doing well! 😊 I’m here to help you with Vezlivo. What would you like help with?",
      needsSupport: false,
    };
  }

  if (
    q.includes("thank you") ||
    q.includes("thanks") ||
    q === "thank"
  ) {
    return {
      text: "You’re welcome! 😊 If you have another Vezlivo question, just ask me.",
      needsSupport: false,
    };
  }

  // Issues that need a human review are sent directly to Support.
  if (
    q.includes("warning") ||
    q.includes("strike") ||
    q.includes("ban") ||
    q.includes("banned") ||
    q.includes("suspended") ||
    q.includes("suspension") ||
    q.includes("locked") ||
    q.includes("restriction") ||
    q.includes("appeal") ||
    q.includes("account was removed") ||
    q.includes("account removed")
  ) {
    return {
      text: "This needs a human review because it concerns an account warning, strike, restriction, suspension, ban, or appeal. Vezlivo Support can review the details of your account and explain what can be done.",
      needsSupport: true,
    };
  }

  if (
    q.includes("payment missing") ||
    q.includes("charged") ||
    q.includes("refund") ||
    q.includes("money") ||
    q.includes("purchase failed") ||
    q.includes("coins missing")
  ) {
    return {
      text: "A payment or missing-coin problem may require checking your account and transaction details. Please contact Vezlivo Support so a human can review the transaction safely. Never send your password, verification code, or payment PIN.",
      needsSupport: true,
    };
  }

  if (
    q.includes("how do i report") ||
    q.includes("report a video") ||
    q.includes("report someone") ||
    q.includes("report an account")
  ) {
    return {
      text: "To report content, open the video or profile you are concerned about, use its report option, choose the reason, and submit the report. Please report genuine safety or rule violations rather than ordinary disagreements.",
      needsSupport: false,
    };
  }

  if (
    q.includes("how do i block") ||
    q.includes("block someone") ||
    q.includes("block a user")
  ) {
    return {
      text: "Open the person’s profile, use the profile options menu, and choose Block. Blocking can help stop unwanted interactions from that account.",
      needsSupport: false,
    };
  }

  if (
    q.includes("how do i follow") ||
    q.includes("follow someone") ||
    q.includes("unfollow")
  ) {
    return {
      text: "Open the person’s profile and tap Follow. If you already follow them, the same control can be used to unfollow them.",
      needsSupport: false,
    };
  }

  if (
    q.includes("like a video") ||
    q.includes("how do i like") ||
    q === "likes"
  ) {
    return {
      text: "To like a video, tap the Like button on the video. You can tap it again to remove your like.",
      needsSupport: false,
    };
  }

  if (
    q.includes("comment") ||
    q.includes("reply to a comment")
  ) {
    return {
      text: "To comment, open the video’s comments and type your message. You can also reply to another comment when replies are available. Keep comments respectful and follow Vezlivo Safety Standards.",
      needsSupport: false,
    };
  }

  if (
    q.includes("share") ||
    q.includes("copy link")
  ) {
    return {
      text: "Use the Share option on a video to send it to another app or person. If you only need the Vezlivo link, choose Copy Link when that option is available.",
      needsSupport: false,
    };
  }

  if (
    q.includes("favorite") ||
    q.includes("favourite") ||
    q.includes("save a video")
  ) {
    return {
      text: "Use the Favorite or Save option on a video when it is available. Your saved videos can then be found in the part of Vezlivo that manages your favorites.",
      needsSupport: false,
    };
  }

  if (
    q.includes("low view") ||
    q.includes("low views") ||
    q.includes("no view") ||
    q.includes("few views") ||
    q.includes("reach") ||
    q.includes("recommend")
  ) {
    return {
      text: "Views can vary from video to video. Make sure the video uploaded successfully, is visible to the intended audience, and follows Vezlivo rules. If you believe there is a technical problem with your account or a specific video, contact Support and include the relevant details.",
      needsSupport: false,
    };
  }

  if (
    q.includes("login") ||
    q.includes("sign in") ||
    q.includes("log in")
  ) {
    return {
      text: "For login problems, use the same sign-in method you used when creating your Vezlivo account. If you still cannot sign in after checking your details, contact Vezlivo Support so the account can be reviewed.",
      needsSupport: false,
    };
  }

  if (
    q.includes("password") ||
    q.includes("forgot my password") ||
    q.includes("change password")
  ) {
    return {
      text: "You can manage your password from Settings → Password & security. Never give your password or verification code to another person.",
      needsSupport: false,
    };
  }

  if (
    q.includes("username") ||
    q.includes("change my name") ||
    q.includes("profile picture") ||
    q.includes("edit profile")
  ) {
    return {
      text: "Open your Profile and use the profile editing controls to update the information Vezlivo allows you to change. Keep your profile information accurate and do not impersonate another person.",
      needsSupport: false,
    };
  }

  if (
    q.includes("privacy") ||
    q.includes("private account") ||
    q.includes("who can message") ||
    q.includes("who can comment")
  ) {
    return {
      text: "Open Settings → Privacy settings to control your account privacy and available interaction controls, including who can follow, comment, message, or mention you.",
      needsSupport: false,
    };
  }

  if (
    q.includes("notification") ||
    q.includes("notifications")
  ) {
    return {
      text: "Open Settings → Notifications to control the types of Vezlivo notifications you receive, such as likes, comments, followers, and messages.",
      needsSupport: false,
    };
  }

  if (
    q.includes("post") ||
    q.includes("upload") ||
    q.includes("posting video") ||
    q.includes("how do i post")
  ) {
    return {
      text: "To post a video, open Create, choose or record your video, add the information requested by Vezlivo, and publish it when you are ready. Only upload videos you have the right or permission to share.",
      needsSupport: false,
    };
  }

  if (q.includes("delete") && q.includes("video")) {
    return {
      text: "Open the video you posted, use its options menu, and choose the delete option if it is available. Check the confirmation carefully before deleting because deleted content may not be recoverable.",
      needsSupport: false,
    };
  }

  if (
    q.includes("copyright") ||
    q.includes("music rights")
  ) {
    return {
      text: "Only upload content you have the right or permission to use. Copyright complaints and appeals are handled through Vezlivo’s copyright process. If you have a specific copyright case that needs review, contact Support.",
      needsSupport: false,
    };
  }

  if (
    q.includes("age") ||
    q.includes("how old") ||
    q.includes("under 18") ||
    q.includes("teen")
  ) {
    return {
      text: "Vezlivo uses your date of birth to apply age-based protections. Users under 13 cannot create an account. Ages 13–17 can use permitted social features with additional protections. Adult-only features are restricted to eligible users aged 18 or older.",
      needsSupport: false,
    };
  }

  if (
    q.includes("safety standard") ||
    q.includes("safety rules") ||
    q.includes("community rules")
  ) {
    return {
      text: "Vezlivo Safety Standards cover areas such as child safety, sexual and explicit content, violence, hate and abuse, scams, impersonation, privacy, spam, copyright, messages, comments, and reporting. You can read the full Safety Standard in Settings.",
      needsSupport: false,
    };
  }

  if (
    q.includes("help center") ||
    q.includes("what can you help") ||
    q.includes("what can you do")
  ) {
    return {
      text: "I can help with common Vezlivo questions about accounts, profiles, videos, likes, comments, follows, sharing, privacy, notifications, safety, and copyright. If your problem requires access to account records or a human decision, I’ll send you to Vezlivo Support.",
      needsSupport: false,
    };
  }

  return {
    text: `I can help with that. I don’t have enough information to give you a reliable answer yet. Try asking your question with a little more detail, for example: “How do I post a video?”, “Why can’t I post a video?”, or “How do I report a video?” If the problem involves a warning, ban, suspension, payment issue, or another case that needs account review, contact Vezlivo Support.`,
    needsSupport: false,
  };
}

function HelpCenterChatPage({
  user,
  onBack,
  openPage,
}) {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "help",
      text:
        "Hi. I’m the Vezlivo Help Center AI. Ask me anything about using Vezlivo, and I’ll help you.",
      createdAt: Date.now(),
    },
  ]);

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendQuestion = async () => {
    const question = text.trim();

    if (!question || loading) return;

    const now = Date.now();

    setMessages((old) => [
      ...old,
      {
        id: `user-${now}`,
        sender: "user",
        text: question,
        createdAt: now,
      },
    ]);

    setText("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/help-center", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: question,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "The Vezlivo Help Center AI could not answer right now."
        );
      }

      const answer =
        typeof data?.answer === "string" && data.answer.trim()
          ? data.answer.trim()
          : "I could not generate an answer right now. Please try again.";

      setMessages((old) => [
        ...old,
        {
          id: `help-${now + 1}`,
          sender: "help",
          text: answer,
          createdAt: now + 1,
          needsSupport: false,
        },
      ]);
    } catch (err) {
      console.error("Vezlivo Help Center error:", err);

      setError(
        "The Help Center AI could not connect right now. Please try again or contact Vezlivo Support."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header
          title="Vezlivo Help Center"
          onBack={onBack}
        />

        <style>{`
          .vezlivo-help-user-bubble {
            background: #111 !important;
            color: #fff !important;
          }

          .vezlivo-help-user-bubble * {
            color: #fff !important;
          }

          .vezlivo-help-input {
            color: #111 !important;
            background: #fff !important;
            -webkit-text-fill-color: #111 !important;
            caret-color: #111 !important;
          }

          .vezlivo-help-ai-bubble {
            background: #f1f1f1 !important;
            color: #111 !important;
          }

          .vezlivo-help-loading {
            opacity: 0.7;
            font-style: italic;
          }
        `}</style>

        <div className="settings-info-box">
          <strong>Vezlivo Help Center AI</strong>

          <p>
            Ask a question about Vezlivo and the AI will help you understand
            how the app works. Questions involving account decisions,
            warnings, restrictions, suspensions, bans, or appeals can be
            handled by Vezlivo Support.
          </p>
        </div>

        <div
          className="settings-support-chat"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            maxHeight: "55vh",
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          {messages.map((item) => (
            <div
              key={item.id}
              className={
                item.sender === "user"
                  ? "vezlivo-help-user-bubble"
                  : "vezlivo-help-ai-bubble"
              }
              style={{
                alignSelf:
                  item.sender === "user"
                    ? "flex-end"
                    : "flex-start",
                maxWidth: "90%",
                padding: "10px 12px",
                borderRadius: "14px",
              }}
            >
              <strong style={{ fontSize: "12px" }}>
                {item.sender === "user"
                  ? "You"
                  : "Vezlivo Help Center AI"}
              </strong>

              <div
                style={{
                  marginTop: "4px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {item.text}
              </div>

              {item.needsSupport && (
                <button
                  type="button"
                  className="settings-primary-button"
                  style={{ marginTop: "10px" }}
                  onClick={() => openPage("support")}
                >
                  Contact Vezlivo Support
                </button>
              )}
            </div>
          ))}

          {loading && (
            <div
              className="vezlivo-help-ai-bubble vezlivo-help-loading"
              style={{
                alignSelf: "flex-start",
                maxWidth: "90%",
                padding: "10px 12px",
                borderRadius: "14px",
              }}
            >
              Vezlivo Help Center AI is thinking...
            </div>
          )}
        </div>

        {error && (
          <div
            className="settings-info-box"
            style={{
              marginTop: "10px",
            }}
          >
            <strong>Something went wrong</strong>

            <p>{error}</p>
          </div>
        )}

        <div className="settings-form">
          <label>
            <span>Your question</span>

            <textarea
              className="vezlivo-help-input"
              rows="4"
              value={text}
              disabled={loading}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendQuestion();
                }
              }}
              placeholder="Ask the Vezlivo Help Center AI..."
            />
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={sendQuestion}
            disabled={!text.trim() || loading}
          >
            {loading ? "Getting answer..." : "Ask AI"}
          </button>

          <button
            type="button"
            className="settings-danger-button"
            onClick={() => openPage("support")}
            disabled={loading}
          >
            Contact Vezlivo Support
          </button>
        </div>
      </section>
    </main>
  );
}

function SupportChatPage({
  user,
  onBack,
  success,
  fail,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return undefined;

    const messagesRef = ref(
      database,
      `supportTickets/${user.uid}/messages`
    );

    return onValue(
      messagesRef,
      (snap) => {
        const data = snap.val() || {};
        const list = Object.entries(data)
          .map(([id, value]) => ({ id, ...(value || {}) }))
          .sort(
            (a, b) =>
              Number(a.createdAt || 0) - Number(b.createdAt || 0)
          );
        setMessages(list);
      },
      (error) => {
        console.error(error);
        fail("Unable to load your support chat.");
      }
    );
  }, [user]);

  const sendMessage = async () => {
    const question = text.trim();
    if (!question || !user || sending) return;

    setSending(true);

    try {
      const ticketRef = ref(
        database,
        `supportTickets/${user.uid}`
      );
      const ticketSnap = await get(ticketRef);
      const now = Date.now();

      if (!ticketSnap.exists()) {
        await set(ticketRef, {
          userId: user.uid,
          ownerUid: VEZLIVO_OWNER_UID,
          status: "open",
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await update(ticketRef, {
          updatedAt: now,
          status: "open",
        });
      }

      const messageRef = push(
        ref(database, `supportTickets/${user.uid}/messages`)
      );

      await set(messageRef, {
        senderUid: user.uid,
        sender: "user",
        text: question,
        createdAt: now,
      });

      setText("");
      success("Message sent to Vezlivo Support.");
    } catch (error) {
      console.error(error);
      fail("Unable to send your support message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header title="Vezlivo Support" onBack={onBack} />

        <div className="settings-info-box">
          <strong>Human support</strong>
          <p>
            This is a real support conversation. Your message is saved in Vezlivo
            Firebase so the Vezlivo owner can read it and reply later.
          </p>
          <p>
            Support does not automatically change warnings, strikes, restrictions,
            suspensions, or bans. A human review is required.
          </p>
        </div>

        <div
          className="settings-support-chat"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            maxHeight: "55vh",
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          {messages.length === 0 ? (
            <div className="empty-settings-box">
              <strong>Start a support conversation</strong>
              <p>
                Tell Vezlivo Support what happened. Do not send your password,
                verification code, or payment PIN.
              </p>
            </div>
          ) : (
            messages.map((item) => (
              <div
                key={item.id}
                style={{
                  alignSelf:
                    item.senderUid === user.uid ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  padding: "10px 12px",
                  borderRadius: "14px",
                  background:
                    item.senderUid === user.uid ? "#111" : "#f1f1f1",
                  color:
                    item.senderUid === user.uid ? "#fff" : "#111",
                }}
              >
                <strong style={{ fontSize: "12px" }}>
                  {item.senderUid === user.uid ? "You" : "Vezlivo Support"}
                </strong>
                <div style={{ marginTop: "4px", whiteSpace: "pre-wrap" }}>
                  {item.text}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="settings-form">
          <label>
            <span>Message Support</span>
            <textarea
              rows="4"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Write your message to Vezlivo Support..."
            />
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={sendMessage}
            disabled={sending || !text.trim()}
          >
            {sending ? "Sending..." : "Send to Support"}
          </button>
        </div>
      </section>
    </main>
  );
}

function OwnerSupportPage({
  user,
  onBack,
  success,
  fail,
}) {
  const [ticketId, setTicketId] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  if (!user || user.uid !== VEZLIVO_OWNER_UID) {
    return (
      <main className="settings-page">
        <section className="settings-card">
          <Header title="Support inbox" onBack={onBack} />
          <div className="empty-settings-box">
            <strong>Not available</strong>
            <p>This page is only available to the Vezlivo owner.</p>
          </div>
        </section>
      </main>
    );
  }

  const loadTicket = async () => {
    const id = ticketId.trim();
    if (!id) {
      fail("Enter the user's Account ID.");
      return;
    }

    setLoading(true);
    try {
      const snap = await get(
        ref(database, `supportTickets/${id}/messages`)
      );
      const data = snap.val() || {};
      setMessages(
        Object.entries(data)
          .map(([messageId, value]) => ({
            id: messageId,
            ...(value || {}),
          }))
          .sort(
            (a, b) =>
              Number(a.createdAt || 0) - Number(b.createdAt || 0)
          )
      );
    } catch (error) {
      console.error(error);
      fail("Unable to load this support conversation.");
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async () => {
    const reply = text.trim();
    const id = ticketId.trim();
    if (!id || !reply || sending) return;

    setSending(true);
    try {
      const messageRef = push(
        ref(database, `supportTickets/${id}/messages`)
      );
      await set(messageRef, {
        senderUid: user.uid,
        sender: "owner",
        text: reply,
        createdAt: Date.now(),
      });

      await update(ref(database, `supportTickets/${id}`), {
        updatedAt: Date.now(),
        status: "answered",
      });

      setMessages((old) => [
        ...old,
        {
          id: messageRef.key || `owner-${Date.now()}`,
          senderUid: user.uid,
          sender: "owner",
          text: reply,
          createdAt: Date.now(),
        },
      ]);
      setText("");
      success("Reply sent.");
    } catch (error) {
      console.error(error);
      fail("Unable to send the support reply.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="settings-page">
      <section className="settings-card">
        <Header title="Support inbox" onBack={onBack} />

        <div className="settings-info-box">
          <strong>Owner only</strong>
          <p>
            Enter a user's Account ID to open that user's Vezlivo Support
            conversation and reply as the owner.
          </p>
        </div>

        <div className="settings-form">
          <label>
            <span>User Account ID</span>
            <input
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="User Account ID"
            />
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={loadTicket}
            disabled={loading || !ticketId.trim()}
          >
            {loading ? "Loading..." : "Open conversation"}
          </button>
        </div>

        {ticketId.trim() && (
          <div
            className="settings-support-chat"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              maxHeight: "45vh",
              overflowY: "auto",
              padding: "8px 0",
            }}
          >
            {messages.length === 0 ? (
              <div className="empty-settings-box">
                <strong>No messages loaded</strong>
                <p>Open the conversation to view its messages.</p>
              </div>
            ) : (
              messages.map((item) => (
                <div
                  key={item.id}
                  style={{
                    alignSelf:
                      item.senderUid === user.uid ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                    padding: "10px 12px",
                    borderRadius: "14px",
                    background:
                      item.senderUid === user.uid ? "#111" : "#f1f1f1",
                    color:
                      item.senderUid === user.uid ? "#fff" : "#111",
                  }}
                >
                  <strong style={{ fontSize: "12px" }}>
                    {item.senderUid === user.uid ? "You / Owner" : "User"}
                  </strong>
                  <div style={{ marginTop: "4px", whiteSpace: "pre-wrap" }}>
                    {item.text}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="settings-form">
          <label>
            <span>Owner reply</span>
            <textarea
              rows="4"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your reply..."
            />
          </label>

          <button
            type="button"
            className="settings-primary-button"
            onClick={sendReply}
            disabled={sending || !ticketId.trim() || !text.trim()}
          >
            {sending ? "Sending..." : "Send reply"}
          </button>
        </div>
      </section>
    </main>
  );
}

function HelpArticle({
  page,
  onBack,
}) {
  const articles = {
    "help-account": {
      title: "Account & login",
      text:
        "Use your registered email and password to sign in. Keep your login information private and use Settings to manage your account.",
    },

    "help-profile": {
      title: "Profile",
      text:
        "Your profile contains your profile picture, display name, username and other public information.",
    },

    "help-videos": {
      title: "Posting videos",
      text:
        "Only post content you have permission to share. Respect copyright and Vezlivo Safety Standards.",
    },

    "help-notifications": {
      title: "Notifications",
      text:
        "Notification settings let you choose which Vezlivo activity alerts you receive.",
    },

    "help-safety": {
      title: "Safety",
      text:
        "Vezlivo Safety Standards help keep the platform respectful and safe. Serious or repeated violations may lead to restrictions.",
    },

    "help-copyright": {
      title: "Copyright",
      text:
        "Only upload content you have permission to use. Copyright complaints are handled separately from Vezlivo Safety Standards.",
    },

    "help-harassment": {
      title: "Harassment & bullying",
      text:
        "Do not target, threaten, intimidate or repeatedly harass other users.",
    },

    "help-spam": {
      title: "Spam & fake engagement",
      text:
        "Do not use fake accounts, automated activity or artificial engagement to manipulate Vezlivo.",
    },

    "help-dangerous": {
      title: "Dangerous or illegal content",
      text:
        "Content that presents serious safety risks or promotes illegal activity may be removed or restricted.",
    },

    "help-impersonation": {
      title: "Impersonation",
      text:
        "Do not mislead people by pretending to be another person, creator, organization or official account.",
    },

    "help-reporting": {
      title: "Reporting",
      text:
        "Use Vezlivo reporting tools when you believe content or an account violates the platform's rules.",
    },

    "help-low-views": {
      title: "Low views & recommendations",
      text:
        "Views can vary from video to video. Low views do not by themselves mean that your account has been banned or secretly restricted. Check whether the video is public, whether viewers are watching and engaging with it, whether the content follows Vezlivo rules, and whether there are technical upload problems. If you believe your reach is being affected by a technical error or an enforcement action, contact Vezlivo Support and include the video details.",
    },
  };

  const article =
    articles[page] || {
      title: "Help",
      text:
        "Vezlivo Help Center information will appear here.",
    };

  return (
    <DocumentPage
      title={article.title}
      icon="❓"
      text={article.text}
      onBack={onBack}
    />
  );
}

export default Settings;