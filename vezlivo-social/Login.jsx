import React, { useState } from "react";
import { apiPost } from "./apiClient.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import {
  equalTo,
  get,
  orderByChild,
  query,
  ref,
  update,
} from "firebase/database";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

import { auth, database, storage } from "./firebase.js";

function Login({ onBack }) {
  const [mode, setMode] = useState("login");
  const [method, setMethod] = useState("email");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [loading, setLoading] = useState(false);

  // First-time account setup
  const [onboardingUser, setOnboardingUser] = useState(null);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [profileFile, setProfileFile] = useState(null);
  const [profilePreview, setProfilePreview] = useState("");
  const [profileSkipped, setProfileSkipped] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [onboardingMessage, setOnboardingMessage] = useState("");

  const showMessage = (text, type = "error") => {
    setMessage(text);
    setMessageType(type);
  };

  const clearMessage = () => {
    setMessage("");
    setMessageType("");
  };

  const showOnboardingMessage = (text) => {
    setOnboardingMessage(text);
  };

  const clearOnboardingMessage = () => {
    setOnboardingMessage("");
  };

  const calculateAge = (year, month, day) => {
    const today = new Date();
    const birthDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    );

    let age = today.getFullYear() - birthDate.getFullYear();

    const monthDifference =
      today.getMonth() - birthDate.getMonth();

    if (
      monthDifference < 0 ||
      (monthDifference === 0 &&
        today.getDate() < birthDate.getDate())
    ) {
      age -= 1;
    }

    return age;
  };

  const isValidDate = (year, month, day) => {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);

    if (!y || !m || !d) {
      return false;
    }

    const date = new Date(y, m - 1, d);

    return (
      date.getFullYear() === y &&
      date.getMonth() === m - 1 &&
      date.getDate() === d
    );
  };

  const generateUniqueUsername = async (name) => {
    const base = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20);

    const safeBase = base || "vezlivo";
    const usersPublicRef = ref(database, "usersPublic");

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const suffix = attempt === 0
        ? ""
        : String(Math.floor(100 + Math.random() * 900));
      const candidate = `${safeBase}${suffix}`.slice(0, 30);

      const existing = await get(
        query(
          usersPublicRef,
          orderByChild("username"),
          equalTo(candidate)
        )
      );

      if (!existing.exists()) {
        return candidate;
      }
    }

    return `vezlivo${Date.now().toString().slice(-8)}`;
  };

  const beginOnboarding = async (user) => {
    if (!user) {
      return;
    }

    try {
      const snapshot = await get(
        ref(database, `users/${user.uid}`)
      );

      const existing = snapshot.exists()
        ? snapshot.val()
        : {};

      if (existing.onboardingComplete === true) {
        onBack?.();
        return;
      }

      setOnboardingUser(user);

      setDisplayName(existing.displayName || "");

      setUsername(existing.username || "");

      if (existing.birthMonth) {
        setBirthMonth(String(existing.birthMonth));
      }

      if (existing.birthDay) {
        setBirthDay(String(existing.birthDay));
      }

      if (existing.birthYear) {
        setBirthYear(String(existing.birthYear));
      }

      if (existing.profileURL) {
        setProfilePreview(existing.profileURL);
        setProfileSkipped(false);
      } else if (user.photoURL) {
        setProfilePreview(user.photoURL);
        setProfileSkipped(false);
      } else {
        setProfilePreview("");
        setProfileSkipped(false);
      }

      setOnboardingStep(1);
      clearOnboardingMessage();
    } catch (error) {
      console.error(
        "Unable to load Vezlivo onboarding:",
        error
      );

      setOnboardingUser(user);
      setProfileFile(null);
      setProfilePreview(user.photoURL || "");
      setProfileSkipped(false);
      setOnboardingStep(1);
      clearOnboardingMessage();
    }
  };

  const finishOnboarding = async () => {
    if (!onboardingUser) {
      return;
    }

    clearOnboardingMessage();

    if (!displayName.trim()) {
      showOnboardingMessage(
        "Please enter the name you want people to see."
      );
      return;
    }

    const cleanUsername = username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, "");

    if (cleanUsername.length < 3) {
      showOnboardingMessage(
        "Username must be at least 3 characters."
      );
      return;
    }

    setLoading(true);

    try {
      let profileURL = profileSkipped
        ? ""
        : profilePreview || onboardingUser.photoURL || "";

      let profileImageBase64 = null;
      let profileImageName = null;

      // MIGRATED TO R2: Convert profile picture to Base64 for Cloudflare Worker upload
      if (profileFile) {
        profileImageName = `profile-${onboardingUser.uid}-${Date.now()}.jpg`;
        profileImageBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(profileFile);
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
        });
      }

      const age = calculateAge(
        birthYear,
        birthMonth,
        birthDay
      );

      const isMinor = age < 18;
      const accountAgeGroup = isMinor ? "teen" : "adult";

      const profileData = {
        uid: onboardingUser.uid,
        displayName: displayName.trim(),
        username: cleanUsername,
        birthMonth: Number(birthMonth),
        birthDay: Number(birthDay),
        birthYear: Number(birthYear),
        dateOfBirth: `${birthYear}-${String(
          birthMonth
        ).padStart(2, "0")}-${String(birthDay).padStart(
          2,
          "0"
        )}`,
        age,
        isMinor,
        accountAgeGroup,
        canAccessMatureContent: !isMinor,
        profileURL,
        profileImageBase64,
        profileImageName,
        onboardingComplete: true,
        onboardingCompletedAt: Date.now(),
      };

      // MIGRATED: Post to Cloudflare Worker to handle Neon DB and Cloudflare R2 storage
      await apiPost("/users/sync", profileData);

      setOnboardingUser(null);
      clearOnboardingMessage();
      setProfileFile(null);
      setProfilePreview("");
      setProfileSkipped(false);
      setDisplayName("");
      setUsername("");
      setBirthMonth("");
      setBirthDay("");
      setBirthYear("");

      onBack?.();
    } catch (error) {
      console.error(
        "Unable to save Vezlivo onboarding:",
        error
      );

      showOnboardingMessage(
        error.message ||
          "Unable to save your profile setup. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingNext = async () => {
    clearOnboardingMessage();

    if (onboardingStep === 1) {
      if (!isValidDate(birthYear, birthMonth, birthDay)) {
        showOnboardingMessage(
          "Please select a valid month, day and year."
        );
        return;
      }

      const age = calculateAge(
        birthYear,
        birthMonth,
        birthDay
      );

      if (age < 13) {
        showOnboardingMessage(
          "You must meet Vezlivo's minimum age requirement to create an account."
        );
        return;
      }

      if (age > 120) {
        showOnboardingMessage(
          "Please enter a valid date of birth."
        );
        return;
      }

      setOnboardingStep(2);
      return;
    }

    if (onboardingStep === 2) {
      if (!displayName.trim()) {
        showOnboardingMessage(
          "Please enter the name you want to use on Vezlivo."
        );
        return;
      }

      setLoading(true);

      try {
        const generatedUsername = await generateUniqueUsername(
          displayName
        );
        setUsername(generatedUsername);
        setOnboardingStep(3);
      } catch (error) {
        console.error(
          "Unable to generate Vezlivo username:",
          error
        );
        showOnboardingMessage(
          "We could not create your username. Please try again."
        );
      } finally {
        setLoading(false);
      }

      return;
    }

    if (onboardingStep === 3) {
      if (!username || username.trim().length < 3) {
        showOnboardingMessage(
          "We could not create your username. Please go back and try again."
        );
        return;
      }

      setOnboardingStep(4);
      return;
    }

    if (onboardingStep === 4) {
      await finishOnboarding();
    }
  };

  const handleProfileFileChange = (event) => {
    clearOnboardingMessage();

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showOnboardingMessage(
        "Please select an image file."
      );
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showOnboardingMessage(
        "Profile picture must be 5 MB or smaller."
      );
      event.target.value = "";
      return;
    }

    setProfileFile(file);
    setProfileSkipped(false);
    setProfilePreview(
      URL.createObjectURL(file)
    );
  };

  const handleEmailAuth = async (event) => {
    event.preventDefault();
    clearMessage();

    if (!email.trim()) {
      showMessage("Please enter your email address.");
      return;
    }

    if (!password) {
      showMessage("Please enter your password.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      showMessage("Passwords do not match.");
      return;
    }

    if (mode === "signup" && password.length < 6) {
      showMessage("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      let credential;

      if (mode === "login") {
        credential =
          await signInWithEmailAndPassword(
            auth,
            email.trim(),
            password
          );

        showMessage("Login successful.", "success");
      } else {
        credential =
          await createUserWithEmailAndPassword(
            auth,
            email.trim(),
            password
          );

        showMessage(
          "Account created successfully.",
          "success"
        );
      }

      await beginOnboarding(credential.user);
    } catch (error) {
      if (error.code === "auth/invalid-credential") {
        showMessage("Incorrect email or password.");
      } else if (error.code === "auth/email-already-in-use") {
        showMessage(
          "An account already exists with this email."
        );
      } else if (error.code === "auth/invalid-email") {
        showMessage("Please enter a valid email address.");
      } else if (error.code === "auth/weak-password") {
        showMessage("Your password is too weak.");
      } else {
        showMessage(
          error.message || "Authentication failed."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    clearMessage();

    if (!email.trim()) {
      showMessage("Enter your email address first.");
      return;
    }

    setLoading(true);

    try {
      await sendPasswordResetEmail(
        auth,
        email.trim()
      );

      showMessage(
        "Password reset instructions have been sent to your email.",
        "success"
      );
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        showMessage("No account was found with that email.");
      } else if (error.code === "auth/invalid-email") {
        showMessage("Please enter a valid email address.");
      } else {
        showMessage(
          error.message ||
            "Unable to send password reset email."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    clearMessage();
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();

      const result = await signInWithPopup(
        auth,
        provider
      );

      showMessage(
        "Google sign-in successful.",
        "success"
      );

      await beginOnboarding(result.user);
    } catch (error) {
      if (error.code === "auth/popup-closed-by-user") {
        showMessage("Google sign-in was cancelled.");
      } else if (error.code === "auth/popup-blocked") {
        showMessage(
          "Your browser blocked the Google sign-in window."
        );
      } else {
        showMessage(
          error.message || "Google sign-in failed."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     PHONE AUTHENTICATION
     Firebase still uses reCAPTCHA for anti-abuse protection,
     but Vezlivo uses the invisible version so users do not have
     to tick an "I'm not a robot" box.
  ========================================================= */

  const setupRecaptcha = () => {
    if (window.recaptchaVerifier) {
      return window.recaptchaVerifier;
    }

    window.recaptchaVerifier = new RecaptchaVerifier(
      auth,
      "recaptcha-container",
      {
        size: "invisible",
        callback: () => {
          clearMessage();
        },
        "expired-callback": () => {
          showMessage(
            "Security verification expired. Please try again."
          );
        },
      }
    );

    return window.recaptchaVerifier;
  };

  const normalizePhoneNumber = (value) => {
    const raw = String(value || "").trim();
    const compact = raw.replace(/[\s().-]/g, "");

    if (!compact) {
      return "";
    }

    // Allow a Nigerian local number such as 07055749970.
    if (/^0\d{10}$/.test(compact)) {
      return `+234${compact.slice(1)}`;
    }

    // Allow Nigerian numbers already written as 234...
    if (/^234\d{10}$/.test(compact)) {
      return `+${compact}`;
    }

    // Keep an already international number unchanged.
    if (/^\+\d{8,15}$/.test(compact)) {
      return compact;
    }

    return null;
  };

  const clearRecaptcha = () => {
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch {
        // Ignore cleanup errors.
      }

      window.recaptchaVerifier = null;
    }
  };

  const handleSendPhoneCode = async (event) => {
    event.preventDefault();
    clearMessage();

    const normalizedPhone = normalizePhoneNumber(phone);

    if (!phone.trim()) {
      showMessage("Enter your phone number.");
      return;
    }

    if (!normalizedPhone) {
      showMessage(
        "Enter a valid phone number, for example 07055749970 or +2347055749970."
      );
      return;
    }

    setLoading(true);

    try {
      const appVerifier = setupRecaptcha();

      const result = await signInWithPhoneNumber(
        auth,
        normalizedPhone,
        appVerifier
      );

      setConfirmationResult(result);

      showMessage(
        "Verification code sent to your phone.",
        "success"
      );
    } catch (error) {
      console.error("Vezlivo phone authentication error:", error);

      clearRecaptcha();

      if (error.code === "auth/invalid-phone-number") {
        showMessage("That phone number is not valid. Check the number and try again.");
      } else if (error.code === "auth/too-many-requests") {
        showMessage("Too many attempts. Please wait a while and try again.");
      } else if (error.code === "auth/captcha-check-failed") {
        showMessage("Security verification failed. Please try again.");
      } else if (error.code === "auth/quota-exceeded") {
        showMessage("SMS verification is temporarily unavailable. Please try again later.");
      } else if (error.code === "auth/operation-not-allowed") {
        showMessage("Phone sign-in is not enabled in the Vezlivo Firebase project yet.");
      } else {
        showMessage(
          error.message ||
            "Unable to send verification code. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneCode = async (event) => {
    event.preventDefault();
    clearMessage();

    if (!verificationCode.trim()) {
      showMessage("Enter the verification code.");
      return;
    }

    if (!confirmationResult) {
      showMessage(
        "Please request a new verification code."
      );
      return;
    }

    setLoading(true);

    try {
      const credential =
        await confirmationResult.confirm(
          verificationCode.trim()
        );

      showMessage(
        "Phone verification successful.",
        "success"
      );

      await beginOnboarding(credential.user);
    } catch (error) {
      if (
        error.code ===
        "auth/invalid-verification-code"
      ) {
        showMessage(
          "The verification code is incorrect."
        );
      } else if (
        error.code === "auth/code-expired"
      ) {
        showMessage(
          "The verification code has expired. Request a new one."
        );
      } else {
        showMessage(
          error.message ||
            "Phone verification failed."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(
      mode === "login" ? "signup" : "login"
    );

    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setPhone("");
    setVerificationCode("");
    setConfirmationResult(null);

    clearMessage();
  };

  const switchMethod = (newMethod) => {
    setMethod(newMethod);
    setVerificationCode("");
    setConfirmationResult(null);

    clearMessage();

    clearRecaptcha();
  };

  if (onboardingUser) {
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const currentYear =
      new Date().getFullYear();

    return (
      <main className="login-page">
        <section
          className="login-card"
          style={{
            maxWidth: "520px",
          }}
        >
          <img
            src="/Logo.png"
            alt="Vezlivo"
            className="login-logo"
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "18px",
            }}
          >
            <div>
              <strong>
                Set up your Vezlivo profile
              </strong>
              <div
                style={{
                  fontSize: "13px",
                  opacity: 0.7,
                  marginTop: "4px",
                }}
              >
                Step {onboardingStep} of 4
              </div>
            </div>

            <div
              style={{
                fontSize: "13px",
                opacity: 0.7,
              }}
            >
              {Math.round(
                (onboardingStep / 4) * 100
              )}
              %
            </div>
          </div>

          {onboardingStep === 1 && (
            <>
              <h1>When were you born?</h1>

              <p className="login-subtitle">
                Enter your date of birth. This helps
                Vezlivo apply the right age and safety
                settings to your account.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1.5fr 1fr 1.2fr",
                  gap: "10px",
                }}
              >
                <select
                  value={birthMonth}
                  onChange={(event) =>
                    setBirthMonth(event.target.value)
                  }
                  disabled={loading}
                >
                  <option value="">
                    Month
                  </option>

                  {monthNames.map(
                    (month, index) => (
                      <option
                        key={month}
                        value={index + 1}
                      >
                        {month}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={birthDay}
                  onChange={(event) =>
                    setBirthDay(event.target.value)
                  }
                  disabled={loading}
                >
                  <option value="">Day</option>

                  {Array.from(
                    { length: 31 },
                    (_, index) => index + 1
                  ).map((day) => (
                    <option
                      key={day}
                      value={day}
                    >
                      {day}
                    </option>
                  ))}
                </select>

                <select
                  value={birthYear}
                  onChange={(event) =>
                    setBirthYear(event.target.value)
                  }
                  disabled={loading}
                >
                  <option value="">Year</option>

                  {Array.from(
                    { length: 121 },
                    (_, index) =>
                      currentYear - index
                  ).map((year) => (
                    <option
                      key={year}
                      value={year}
                    >
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {onboardingStep === 2 && (
            <>
              <h1>Choose your name</h1>

              <p className="login-subtitle">
                This is the name people will see on
                your Vezlivo profile.
              </p>

              <input
                type="text"
                placeholder="Your display name"
                value={displayName}
                onChange={(event) =>
                  setDisplayName(event.target.value)
                }
                maxLength={50}
                disabled={loading}
                autoComplete="name"
              />
            </>
          )}

          {onboardingStep === 3 && (
            <>
              <h1>Your Vezlivo username</h1>

              <p className="login-subtitle">
                Vezlivo automatically chose an available username for you.
              </p>

              <input
                type="text"
                value={`@${username}`}
                readOnly
                disabled={loading}
                aria-label="Your Vezlivo username"
              />

              <p
                style={{
                  fontSize: "13px",
                  opacity: 0.7,
                  marginTop: "-4px",
                }}
              >
                You do not need to choose a username. You can change it later from Account information.
              </p>
            </>
          )}

          {onboardingStep === 4 && (
            <>
              <h1>Add a profile picture</h1>

              <p className="login-subtitle">
                Add a profile picture so people can recognize you. You can skip this for now.
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "14px",
                  margin: "20px 0",
                }}
              >
                {profilePreview && !profileSkipped ? (
                  <img
                    src={profilePreview}
                    alt="Profile preview"
                    style={{
                      width: "120px",
                      height: "120px",
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "4px solid #fff",
                      boxShadow:
                        "0 4px 18px rgba(0,0,0,.18)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "120px",
                      height: "120px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#e9eef5",
                      fontSize: "42px",
                      fontWeight: 700,
                    }}
                  >
                    {(displayName ||
                      onboardingUser.displayName ||
                      onboardingUser.email ||
                      "V")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}

                <label
                  htmlFor="onboarding-profile-photo"
                  className="primary-login-button"
                  style={{
                    cursor: loading
                      ? "default"
                      : "pointer",
                    display: "inline-block",
                    textAlign: "center",
                  }}
                >
                  {profilePreview && !profileSkipped
                    ? "Change profile picture"
                    : "Select profile picture"}
                </label>

                <input
                  id="onboarding-profile-photo"
                  type="file"
                  accept="image/*"
                  onChange={handleProfileFileChange}
                  disabled={loading}
                  hidden
                />

                <button
                  type="button"
                  className="forgot-password-button"
                  onClick={() => {
                    setProfileFile(null);
                    setProfilePreview("");
                    setProfileSkipped(true);
                    clearOnboardingMessage();
                  }}
                  disabled={loading}
                >
                  Skip for now
                </button>
              </div>
            </>
          )}

          {onboardingMessage && (
            <p
              className="login-message"
              style={{
                marginTop: "14px",
              }}
            >
              {onboardingMessage}
            </p>
          )}

          <button
            type="button"
            className="primary-login-button"
            onClick={handleOnboardingNext}
            disabled={loading}
            style={{
              marginTop: "18px",
            }}
          >
            {loading
              ? "Saving..."
              : onboardingStep === 4
                ? "Finish setup"
                : "Continue"}
          </button>

          {onboardingStep > 1 && (
            <button
              type="button"
              className="forgot-password-button"
              onClick={() => {
                clearOnboardingMessage();
                setOnboardingStep(
                  onboardingStep - 1
                );
              }}
              disabled={loading}
            >
              ← Previous
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <button
          type="button"
          className="back-button"
          onClick={onBack}
          disabled={loading}
        >
          ← Back
        </button>

        <img
          src="/Logo.png"
          alt="Vezlivo"
          className="login-logo"
        />

        <h1>
          {mode === "login"
            ? "Log in to Vezlivo"
            : "Create your Vezlivo account"}
        </h1>

        <p className="login-subtitle">
          {mode === "login"
            ? "Welcome back."
            : "Join Vezlivo and start connecting."}
        </p>

        <div className="auth-methods">
          <button
            type="button"
            className={
              method === "email"
                ? "method-active"
                : ""
            }
            onClick={() =>
              switchMethod("email")
            }
            disabled={loading}
          >
            Email
          </button>

          <button
            type="button"
            className={
              method === "phone"
                ? "method-active"
                : ""
            }
            onClick={() =>
              switchMethod("phone")
            }
            disabled={loading}
          >
            Phone
          </button>
        </div>

        {method === "email" && (
          <form onSubmit={handleEmailAuth}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              autoComplete="email"
              disabled={loading}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              disabled={loading}
            />

            {mode === "signup" && (
              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(
                    event.target.value
                  )
                }
                autoComplete="new-password"
                disabled={loading}
              />
            )}

            <button
              type="submit"
              className="primary-login-button"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Log in"
                  : "Create account"}
            </button>

            {mode === "login" && (
              <button
                type="button"
                className="forgot-password-button"
                onClick={handleForgotPassword}
                disabled={loading}
              >
                Forgot password?
              </button>
            )}
          </form>
        )}

        {method === "phone" && (
          <>
            {!confirmationResult ? (
              <form onSubmit={handleSendPhoneCode}>
                <input
                  type="tel"
                  placeholder="+234 801 234 5678"
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value)
                  }
                  autoComplete="tel"
                  disabled={loading}
                />

                <p className="phone-help">
                  Include your country code, for example
                  +234 for Nigeria.
                </p>

                <div
                  id="recaptcha-container"
                  aria-hidden="true"
                  style={{
                    height: 0,
                    margin: 0,
                    overflow: "visible"
                  }}
                ></div>

                <button
                  type="submit"
                  className="primary-login-button"
                  disabled={loading}
                >
                  {loading
                    ? "Sending code..."
                    : "Send verification code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneCode}>
                <input
                  type="text"
                  placeholder="Verification code"
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(
                      event.target.value
                    )
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={loading}
                />

                <button
                  type="submit"
                  className="primary-login-button"
                  disabled={loading}
                >
                  {loading
                    ? "Verifying..."
                    : "Verify phone number"}
                </button>

                <button
                  type="button"
                  className="forgot-password-button"
                  onClick={() => {
                    setConfirmationResult(null);
                    setVerificationCode("");
                    clearMessage();
                  }}
                  disabled={loading}
                >
                  Use a different number
                </button>
              </form>
            )}
          </>
        )}

        <div className="divider">
          <span>OR</span>
        </div>

        <button
          type="button"
          className="google-button"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          Continue with Google
        </button>

        {message && (
          <p
            className={
              messageType === "success"
                ? "login-message success"
                : "login-message"
            }
          >
            {message}
          </p>
        )}

        <button
          type="button"
          className="switch-auth-button"
          onClick={switchMode}
          disabled={loading}
        >
          {mode === "login"
            ? "Create a new account"
            : "Already have an account? Log in"}
        </button>
      </section>
    </main>
  );
}

export default Login;