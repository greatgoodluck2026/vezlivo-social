import React, { useEffect, useMemo, useRef, useState } from "react";
import { onValue, push, ref, set, update } from "firebase/database";
import { auth, database } from "./firebase.js";

const styles = {
  page: { minHeight: "100vh", background: "#f7f8fb", color: "#111827", fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "rgba(255,255,255,.94)", backdropFilter: "blur(16px)", borderBottom: "1px solid #e7eaf0" },
  back: { width: 42, height: 42, border: 0, borderRadius: 14, background: "#f0f2f6", fontSize: 25, cursor: "pointer" },
  title: { margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-.02em" },
  subtitle: { margin: "3px 0 0", color: "#737b8c", fontSize: 12 },
  action: { border: 0, borderRadius: 13, padding: "10px 13px", background: "#111827", color: "white", fontWeight: 750, cursor: "pointer" },
  search: { margin: 14, width: "calc(100% - 28px)", boxSizing: "border-box", border: "1px solid #e0e4eb", borderRadius: 15, padding: "13px 15px", outline: "none", background: "white", fontSize: 14 },
  list: { padding: "0 10px 28px" },
  row: { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 8px", border: 0, borderBottom: "1px solid #eceef2", background: "transparent", textAlign: "left", cursor: "pointer" },
  avatar: { width: 54, height: 54, borderRadius: "50%", objectFit: "cover", background: "#e7ebf2", flexShrink: 0 },
  fallback: { width: 54, height: 54, borderRadius: "50%", display: "grid", placeItems: "center", background: "#111827", color: "white", fontWeight: 800, flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  nameLine: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { margin: 0, fontSize: 15, fontWeight: 750, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  time: { color: "#9aa1ae", fontSize: 11, flexShrink: 0 },
  preview: { margin: "4px 0 0", color: "#737b8c", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  empty: { minHeight: 420, display: "grid", placeItems: "center", textAlign: "center", padding: 28, color: "#737b8c" },
  panel: { margin: 14, padding: 16, borderRadius: 18, background: "white", border: "1px solid #e5e8ee", boxShadow: "0 10px 30px rgba(17,24,39,.05)" },
  result: { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 0", border: 0, background: "transparent", cursor: "pointer", textAlign: "left" },
  smallAvatar: { width: 46, height: 46, borderRadius: "50%", objectFit: "cover", background: "#e7ebf2", flexShrink: 0 },
  chat: { minHeight: "100vh", background: "#f7f8fb", display: "flex", flexDirection: "column" },
  messages: { flex: 1, padding: "18px 14px 92px", overflowY: "auto" },
  bubble: { maxWidth: "78%", padding: "10px 13px", borderRadius: 17, marginBottom: 8, fontSize: 14, lineHeight: 1.45, wordBreak: "break-word" },
  composer: { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, display: "flex", gap: 8, padding: 12, background: "rgba(255,255,255,.96)", backdropFilter: "blur(16px)", borderTop: "1px solid #e5e8ee" },
  input: { flex: 1, minWidth: 0, border: "1px solid #dfe3e9", borderRadius: 15, padding: "12px 13px", outline: "none", fontSize: 14, background: "white" },
  send: { border: 0, borderRadius: 15, padding: "0 17px", background: "#111827", color: "white", fontWeight: 800, cursor: "pointer" },
};

function username(profile) {
  return String(profile?.username || profile?.displayName || profile?.email?.split("@")[0] || "Vezlivo user").replace(/^@/, "");
}
function photo(profile) { return profile?.photoURL || profile?.profileURL || profile?.avatarURL || ""; }
function initials(profile) { return username(profile).charAt(0).toUpperCase() || "V"; }
function conversationId(a, b) { return [String(a), String(b)].sort().join("_"); }
function timeAgo(value) {
  if (!value) return "";
  const diff = Math.max(0, Date.now() - Number(value));
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return new Date(Number(value)).toLocaleDateString();
}

export default function Inbox({ onBack, onOpenUser }) {
  const user = auth.currentUser;
  const [users, setUsers] = useState({});
  const [conversations, setConversations] = useState({});
  const [messages, setMessages] = useState({});
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!user) return undefined;
    return onValue(ref(database, "users"), snapshot => setUsers(snapshot.val() || {}));
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    return onValue(ref(database, `conversations/${user.uid}`), snapshot => setConversations(snapshot.val() || {}));
  }, [user]);

  useEffect(() => {
    if (!active?.id) return undefined;
    return onValue(ref(database, `directMessages/${active.id}/messages`), snapshot => setMessages(snapshot.val() || {}));
  }, [active?.id]);

  const people = useMemo(() => Object.entries(users).filter(([uid]) => uid !== user?.uid).map(([uid, profile]) => ({ uid, ...profile })), [users, user]);
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return people.filter(p => `${username(p)} ${p.displayName || ""}`.toLowerCase().includes(q)).slice(0, 12);
  }, [people, query]);
  const chats = useMemo(() => Object.entries(conversations).map(([id, value]) => ({ id, ...value })).filter(x => x.peerUid).sort((a,b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)), [conversations]);
  const activeMessages = useMemo(() => Object.entries(messages || {}).map(([id, value]) => ({ id, ...value })).sort((a,b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)), [messages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeMessages.length, active?.id]);

  const openChat = async peerUid => {
    if (!user || !peerUid || peerUid === user.uid) return;
    const profile = users[peerUid] || {};
    const id = conversationId(user.uid, peerUid);
    const mine = { peerUid, peerName: username(profile), peerPhotoURL: photo(profile), updatedAt: Date.now() };
    const me = { peerUid: user.uid, peerName: username(user), peerPhotoURL: user.photoURL || "", updatedAt: Date.now() };
    await update(ref(database, `conversations/${user.uid}/${id}`), mine);
    await update(ref(database, `conversations/${peerUid}/${id}`), me);
    setActive({ id, ...mine });
    setQuery(""); setShowNew(false);
  };

  const send = async event => {
    event?.preventDefault();
    const value = text.trim();
    if (!user || !active || !value || sending) return;
    setSending(true);
    try {
      const messageRef = push(ref(database, `directMessages/${active.id}/messages`));
      const message = { senderUid: user.uid, text: value.slice(0, 4000), createdAt: Date.now() };
      await set(messageRef, message);
      const stamp = Date.now();
      await update(ref(database, `conversations/${user.uid}/${active.id}`), { ...active, lastMessage: message.text, updatedAt: stamp });
      await update(ref(database, `conversations/${active.peerUid}/${active.id}`), { peerUid: user.uid, peerName: username(user), peerPhotoURL: user.photoURL || "", lastMessage: message.text, updatedAt: stamp });
      setText("");
    } catch (error) {
      console.error("Vezlivo message error:", error);
      alert("Message could not be sent. Please check your connection and Firebase rules.");
    } finally { setSending(false); }
  };

  if (!user) return null;

  if (active) return (
    <main style={styles.chat}>
      <header style={styles.header}>
        <button style={styles.back} onClick={() => setActive(null)} aria-label="Back">‹</button>
        <button onClick={() => onOpenUser?.(active.peerUid)} style={{ border: 0, background: "transparent", display: "flex", alignItems: "center", gap: 10, flex: 1, textAlign: "left", cursor: "pointer", padding: 0 }}>
          {active.peerPhotoURL ? <img src={active.peerPhotoURL} alt="" style={{ ...styles.smallAvatar, width: 42, height: 42 }} /> : <div style={{ ...styles.fallback, width: 42, height: 42 }}>{String(active.peerName || "V").charAt(0).toUpperCase()}</div>}
          <div><h1 style={styles.title}>{active.peerName}</h1><p style={styles.subtitle}>Vezlivo messages</p></div>
        </button>
      </header>
      <section style={styles.messages}>
        {activeMessages.length === 0 ? <div style={styles.empty}><div><h2>Start the conversation</h2><p>Send a message to {active.peerName}.</p></div></div> : activeMessages.map(item => {
          const mine = item.senderUid === user.uid;
          return <div key={item.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}><div style={{ ...styles.bubble, background: mine ? "#111827" : "white", color: mine ? "white" : "#111827", border: mine ? 0 : "1px solid #e5e8ee", borderBottomRightRadius: mine ? 5 : 17, borderBottomLeftRadius: mine ? 17 : 5 }}><div>{item.text}</div><small style={{ display: "block", marginTop: 4, opacity: .55, fontSize: 10, textAlign: "right" }}>{timeAgo(item.createdAt)}</small></div></div>;
        })}
        <div ref={endRef} />
      </section>
      <form style={styles.composer} onSubmit={send}>
        <input style={styles.input} value={text} onChange={e => setText(e.target.value)} placeholder="Message..." maxLength={4000} autoComplete="off" />
        <button style={{ ...styles.send, opacity: text.trim() && !sending ? 1 : .5 }} disabled={!text.trim() || sending}>{sending ? "..." : "Send"}</button>
      </form>
    </main>
  );

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <button style={styles.back} onClick={onBack} aria-label="Back">‹</button>
        <div style={{ flex: 1 }}><h1 style={styles.title}>Messages</h1><p style={styles.subtitle}>Connect with people on Vezlivo</p></div>
        <button style={styles.action} onClick={() => { setShowNew(v => !v); setQuery(""); }}>{showNew ? "Close" : "New"}</button>
      </header>
      <input style={styles.search} value={query} onChange={e => setQuery(e.target.value)} placeholder={showNew ? "Search people" : "Search messages"} />
      {showNew && query.trim() && <section style={styles.panel}>{searchResults.length === 0 ? <p style={styles.subtitle}>No users found.</p> : searchResults.map(person => <button key={person.uid} style={styles.result} onClick={() => openChat(person.uid)}>{photo(person) ? <img src={photo(person)} alt="" style={styles.smallAvatar} /> : <div style={styles.fallback}>{initials(person)}</div>}<div><strong>{username(person)}</strong>{person.displayName && person.displayName !== username(person) && <div style={styles.subtitle}>{person.displayName}</div>}</div></button>)}</section>}
      <section style={styles.list}>
        {chats.filter(item => !query.trim() || String(item.peerName || "").toLowerCase().includes(query.trim().toLowerCase())).length === 0 ? <div style={styles.empty}><div><div style={{ fontSize: 44, marginBottom: 12 }}>💬</div><h2>{query ? "No matching conversations" : "No messages yet"}</h2><p>{query ? "Try another name." : "Start a conversation with someone on Vezlivo."}</p>{!query && <button style={styles.action} onClick={() => setShowNew(true)}>Start a message</button>}</div></div> : chats.filter(item => !query.trim() || String(item.peerName || "").toLowerCase().includes(query.trim().toLowerCase())).map(item => <button key={item.id} style={styles.row} onClick={() => setActive(item)}>{item.peerPhotoURL ? <img src={item.peerPhotoURL} alt="" style={styles.avatar} /> : <div style={styles.fallback}>{String(item.peerName || "V").charAt(0).toUpperCase()}</div>}<div style={styles.body}><div style={styles.nameLine}><h3 style={styles.name}>{item.peerName}</h3><span style={styles.time}>{timeAgo(item.updatedAt)}</span></div><p style={styles.preview}>{item.lastMessage || "Start a conversation"}</p></div></button>)}
      </section>
    </main>
  );
}
