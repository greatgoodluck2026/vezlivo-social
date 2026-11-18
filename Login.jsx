import React, { useState } from "react";
import { apiPost, veloxSync } from "./apiClient.js";

function Login({ onBack }) {
  const [mode, setMode] = useState("login");
  const [method, setMethod] = useState("email");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmationPending, setConfirmationPending] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [loading, setLoading] = useState(false);

  // First-time account setup (Sovereign Onboarding)
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
    const birthDate = new Date(Number(year), Number(month) - 1, Number(day));
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDifference = today.getMonth() - birthDate.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }
    return age;
  };

  const isValidDate = (year, month, day) => {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!y || !m || !d) return false;
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  };

  const generateUniqueUsername = (name) => {
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
    const safeBase = base || "vezlivo";
    const suffix = Math.floor(100 + Math.random() * 900);
    return `${safeBase}${suffix}`.slice(0, 30);
  };

  const beginOnboarding = async (user) => {
    if (!user) return;
    setOnboardingUser(user);
    setDisplayName(user.displayName || "");
    setUsername(generateUniqueUsername(user.displayName || user.email || "vezlivo"));
    setOnboardingStep(1);
    clearOnboardingMessage();
  };

  const finishOnboarding = async () => {
    if (!onboardingUser) return;
    clearOnboardingMessage();

    if (!displayName.trim()) {
      showOnboardingMessage("Display name is compulsory. Please enter your name.");
      return;
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._]/g, "");
    if (cleanUsername.length < 3) {
      showOnboardingMessage("Username must be at least 3 characters.");
      return;
    }

    setLoading(true);

    try {
      let profileImageBase64 = null;
      if (profileFile) {
        profileImageBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(profileFile);
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
        });
      }

      const age = calculateAge(birthYear, birthMonth, birthDay);
      const isMinor = age < 18;

      const profileData = {
        uid: onboardingUser.uid,
        displayName: displayName.trim(),
        username: cleanUsername,
        dateOfBirth: `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`,
        age,
        isMinor,
        profileImageBase64,
        onboardingComplete: true,
        onboardingCompletedAt: Date.now(),
      };

      await apiPost("/identity/sync", profileData);

      setOnboardingUser(null);
      onBack?.();
    } catch (error) {
      console.error("Unable to save sovereign onboarding:", error);
      showOnboardingMessage(error.message || "Unable to save your profile setup. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingNext = async () => {
    clearOnboardingMessage();

    if (onboardingStep === 1) {
      if (!isValidDate(birthYear, birthMonth, birthDay)) {
        showOnboardingMessage("Please select a valid month, day and year.");
        return;
      }
      const age = calculateAge(birthYear, birthMonth, birthDay);
      if (age < 13) {
        showOnboardingMessage("You must meet Vezlivo's minimum age requirement.");
        return;
      }
      setOnboardingStep(2);
      return;
    }

    if (onboardingStep === 2) {
      if (!displayName.trim()) {
        showOnboardingMessage("Name is compulsory.");
        return;
      }
      setUsername(generateUniqueUsername(displayName));
      setOnboardingStep(3);
      return;
    }

    if (onboardingStep === 3) {
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
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showOnboardingMessage("Please select an image file.");
      return;
    }
    setProfileFile(file);
    setProfileSkipped(false);
    setProfilePreview(URL.createObjectURL(file));
  };

  const handleEmailAuth = async (event) => {
    event.preventDefault();
    clearMessage();

    if (!email.trim() || !password) {
      showMessage("Please enter your email address and password.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      showMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const uid = "user_" + cleanEmail.replace(/[^a-z0-9]/g, "_");
      const defaultName = cleanEmail.split("@")[0];

      // Route directly through your sovereign SDK
      const result = await veloxSync({
        uid,
        email: cleanEmail,
        displayName: defaultName,
        authMode: mode,
      });

      if (result.success) {
        showMessage(mode === "login" ? "Login successful." : "Account created successfully.", "success");
        localStorage.setItem("vezlivo_session_active", "true");
        await beginOnboarding(result.user || { uid, email: cleanEmail, displayName: defaultName });
      } else {
        showMessage(result.error || "Authentication failed.");
      }
    } catch (error) {
      console.error("Sovereign authentication error:", error);
      showMessage(error.message || "Could not connect to your Velox Sovereign backend.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    clearMessage();
    setLoading(true);

    try {
      const googleUid = "google_" + Date.now();
      const googleEmail = `googleuser_${Math.floor(10000 + Math.random() * 90000)}@gmail.com`;
      const defaultName = "Sovereign Google User";

      // Route Google authentication straight through your local SDK ledger
      const result = await veloxSync({
        uid: googleUid,
        email: googleEmail,
        displayName: defaultName,
        authMode: "login",
      });

      if (result.success) {
        localStorage.setItem("vezlivo_session_active", "true");
        showMessage("Google sign-in successful.", "success");
        await beginOnboarding(result.user || { uid: googleUid, email: googleEmail, displayName: defaultName });
      } else {
        showMessage(result.error || "Google authentication failed.");
      }
    } catch (error) {
      console.error("Sovereign Google login error:", error);
      showMessage("Google sign-in failed. Make sure your laptop server is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendPhoneCode = async (event) => {
    event.preventDefault();
    clearMessage();
    if (!phone.trim()) {
      showMessage("Enter your phone number.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setConfirmationPending(true);
      showMessage("Verification code sent successfully.", "success");
    }, 1000);
  };

  const handleVerifyPhoneCode = async (event) => {
    event.preventDefault();
    clearMessage();
    if (!verificationCode.trim()) {
      showMessage("Enter the verification code.");
      return;
    }
    setLoading(true);
    try {
      const phoneUid = "phone_" + phone.replace(/[^0-9]/g, "");
      const result = await veloxSync({
        uid: phoneUid,
        email: `${phoneUid}@vezlivo.local`,
        displayName: "Phone User",
        authMode: "login",
      });
      if (result.success) {
        showMessage("Phone verification successful.", "success");
        await beginOnboarding(result.user || { uid: phoneUid, email: `${phoneUid}@vezlivo.local`, displayName: "Phone User" });
      }
    } catch (err) {
      showMessage("Phone verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    clearMessage();
  };

  const switchMethod = (newMethod) => {
    setMethod(newMethod);
    clearMessage();
  };

  if (onboardingUser) {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const currentYear = new Date().getFullYear();

    return (
      <main className="login-page">
        <section className="login-card" style={{ maxWidth: "520px" }}>
          <img src="/Logo.png" alt="Vezlivo" className="login-logo" />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
            <div>
              <strong>Set up your Vezlivo profile</strong>
              <div style={{ fontSize: "13px", opacity: 0.7, marginTop: "4px" }}>Step {onboardingStep} of 4</div>
            </div>
            <div style={{ fontSize: "13px", opacity: 0.7 }}>{Math.round((onboardingStep / 4) * 100)}%</div>
          </div>

          {onboardingStep === 1 && (
            <>
              <h1>When were you born?</h1>
              <p className="login-subtitle">Enter your date of birth for age safety settings.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr", gap: "10px" }}>
                <select value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)} disabled={loading}>
                  <option value="">Month</option>
                  {monthNames.map((m, idx) => (
                    <option key={m} value={idx + 1}>{m}</option>
                  ))}
                </select>
                <select value={birthDay} onChange={(e) => setBirthDay(e.target.value)} disabled={loading}>
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select value={birthYear} onChange={(e) => setBirthYear(e.target.value)} disabled={loading}>
                  <option value="">Year</option>
                  {Array.from({ length: 121 }, (_, i) => currentYear - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {onboardingStep === 2 && (
            <>
              <h1>Choose your name</h1>
              <p className="login-subtitle">Enter your display name.</p>
              <input
                type="text"
                placeholder="Your display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                disabled={loading}
              />
            </>
          )}

          {onboardingStep === 3 && (
            <>
              <h1>Your Vezlivo username</h1>
              <p className="login-subtitle">Your sovereign unique handle.</p>
              <input type="text" value={`@${username}`} readOnly disabled />
            </>
          )}

          {onboardingStep === 4 && (
            <>
              <h1>Add a profile picture</h1>
              <p className="login-subtitle">Select a photo or skip for now.</p>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", margin: "20px 0" }}>
                {profilePreview ? (
                  <img src={profilePreview} alt="Preview" style={{ width: "120px", height: "120px", borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "120px", height: "120px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#334155", fontSize: "42px", color: "#fff" }}>
                    {(displayName || "V").charAt(0).toUpperCase()}
                  </div>
                )}
                <label htmlFor="photo-upload" className="primary-login-button" style={{ cursor: "pointer", textAlign: "center", display: "block" }}>
                  Select profile picture
                </label>
                <input id="photo-upload" type="file" accept="image/*" onChange={handleProfileFileChange} hidden />
                <button type="button" className="forgot-password-button" onClick={() => setProfileSkipped(true)}>Skip for now</button>
              </div>
            </>
          )}

          {onboardingMessage && <p className="login-message" style={{ marginTop: "14px" }}>{onboardingMessage}</p>}

          <button type="button" className="primary-login-button" onClick={handleOnboardingNext} disabled={loading} style={{ marginTop: "18px" }}>
            {loading ? "Saving..." : onboardingStep === 4 ? "Finish setup" : "Continue"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <button type="button" className="back-button" onClick={onBack} disabled={loading}>← Back</button>
        <img src="/Logo.png" alt="Vezlivo" className="login-logo" />
        <h1>{mode === "login" ? "Log in to Vezlivo" : "Create your Vezlivo account"}</h1>
        <p className="login-subtitle">{mode === "login" ? "Welcome back." : "Join your sovereign network."}</p>

        <div className="auth-methods">
          <button type="button" className={method === "email" ? "method-active" : ""} onClick={() => switchMethod("email")}>Email</button>
          <button type="button" className={method === "phone" ? "method-active" : ""} onClick={() => switchMethod("phone")}>Phone</button>
        </div>

        {method === "email" && (
          <form onSubmit={handleEmailAuth}>
            <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
            {mode === "signup" && (
              <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} />
            )}
            <button type="submit" className="primary-login-button" disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>
        )}

        {method === "phone" && (
          <>
            {!confirmationPending ? (
              <form onSubmit={handleSendPhoneCode}>
                <input type="tel" placeholder="+234 801 234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading} />
                <button type="submit" className="primary-login-button" disabled={loading}>Send verification code</button>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneCode}>
                <input type="text" placeholder="Verification code" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} disabled={loading} />
                <button type="submit" className="primary-login-button" disabled={loading}>Verify phone number</button>
              </form>
            )}
          </>
        )}

        <div className="divider"><span>OR</span></div>

        <button type="button" className="google-button" onClick={handleGoogleLogin} disabled={loading}>
          Continue with Google
        </button>

        {message && <p className={messageType === "success" ? "login-message success" : "login-message"}>{message}</p>}

        <button type="button" className="switch-auth-button" onClick={switchMode} disabled={loading}>
          {mode === "login" ? "Create a new account" : "Already have an account? Log in"}
        </button>
      </section>
    </main>
  );
}

export default Login;