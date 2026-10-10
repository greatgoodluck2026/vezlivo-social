import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { apiPost } from "./apiClient.js";

import {
  onAuthStateChanged,
} from "firebase/auth";

import {
  auth,
} from "./firebase.js";
const MAX_VIDEO_SIZE =
  500 * 1024 * 1024;

const MAX_PHOTO_SIZE =
  20 * 1024 * 1024;

const MAX_CAPTION =
  2200;

const FILTERS = [
  { name: "Original", value: "none" },
  { name: "Soft", value: "brightness(1.05) saturate(.9)" },
  { name: "Bright", value: "brightness(1.18) contrast(1.04)" },
  { name: "Warm", value: "sepia(.12) saturate(1.12)" },
  { name: "Cool", value: "saturate(.9) hue-rotate(8deg)" },
  { name: "Mono", value: "grayscale(1)" },
];

const SPEEDS = [
  0.5,
  0.75,
  1,
  1.25,
  1.5,
  2,
];

const VISUAL_BACKGROUNDS = [
  { name: "None", value: "none", css: "#000000" },
  { name: "Midnight", value: "midnight", css: "linear-gradient(135deg, #090909, #252525)" },
  { name: "Sunset", value: "sunset", css: "linear-gradient(135deg, #4b164c, #ff7b54)" },
  { name: "Ocean", value: "ocean", css: "linear-gradient(135deg, #06283d, #1363df)" },
  { name: "Dream", value: "dream", css: "linear-gradient(135deg, #2b1055, #7597de)" },
  { name: "Clean", value: "clean", css: "#f4f4f5" },
];


const VEZLIVO_HASHTAG_SUGGESTIONS = [
  "#Vezlivo",
  "#VezlivoReels",
  "#ForYou",
  "#Trending",
  "#Viral",
  "#Entertainment",
  "#Music",
  "#Comedy",
  "#Dance",
  "#Lifestyle",
  "#Nigeria",
  "#Naija",
  "#Abuja",
  "#Lagos",
  "#BeninCity",
  "#Owerri",
  "#Enugu",
  "#PortHarcourt",
  "#Afrobeats",
  "#Football",
];

function normalizeHashtag(value) {
  const cleaned =
    String(value || "")
      .trim()
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N}_]/gu, "");

  return cleaned
    ? `#${cleaned}`
    : "";
}


function extractHashtags(text) {
  const matches =
    String(text || "").match(
      /#[\p{L}\p{N}_]+/gu
    ) || [];

  return [
    ...new Set(
      matches.map(normalizeHashtag)
    ),
  ];
}


function extractMentions(text) {
  const matches =
    String(text || "").match(
      /@[\p{L}\p{N}_.]+/gu
    ) || [];

  return [
    ...new Set(matches),
  ];
}


/* =========================================================
   VEZLIVO PERSISTENT DRAFT STORAGE
========================================================= */
const VEZLIVO_DRAFT_DB = "vezlivoDraftDatabase";
const VEZLIVO_DRAFT_STORE = "drafts";
function openVezlivoDraftDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("IndexedDB is not supported.")); return; }
    const request = window.indexedDB.open(VEZLIVO_DRAFT_DB, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VEZLIVO_DRAFT_STORE)) db.createObjectStore(VEZLIVO_DRAFT_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function putVezlivoDraft(draft) {
  const db = await openVezlivoDraftDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VEZLIVO_DRAFT_STORE, "readwrite");
    tx.objectStore(VEZLIVO_DRAFT_STORE).put(draft);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function getVezlivoDraft(id) {
  const db = await openVezlivoDraftDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VEZLIVO_DRAFT_STORE, "readonly");
    const request = tx.objectStore(VEZLIVO_DRAFT_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
async function deleteVezlivoDraft(id) {
  if (!id) return;
  const db = await openVezlivoDraftDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VEZLIVO_DRAFT_STORE, "readwrite");
    tx.objectStore(VEZLIVO_DRAFT_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function Create({ draftId = "" } = {}) {
  const [user, setUser] =
    useState(null);

  /*
    create = choose Post / Reel / Story
    edit   = edit selected media
    post   = final publishing screen
  */
  const [step, setStep] =
    useState("create");

  const [contentType, setContentType] =
    useState("");

  const [mediaFile, setMediaFile] =
    useState(null);

  const [mediaType, setMediaType] =
    useState("");

  const [previewUrl, setPreviewUrl] =
    useState("");

  const [caption, setCaption] =
    useState("");

  const [selectedFilter, setSelectedFilter] =
    useState("none");

  const [speed, setSpeed] =
    useState(1);

  const [muted, setMuted] =
    useState(false);

  const [overlayText, setOverlayText] =
    useState("");

  const [showTextEditor, setShowTextEditor] =
    useState(false);

  const [audience, setAudience] =
    useState("public");

  const [commentsEnabled, setCommentsEnabled] =
    useState(true);

  const [originalAudio, setOriginalAudio] =
    useState(true);

  const [selectedHashtags, setSelectedHashtags] =
    useState([]);

  const [hashtagInput, setHashtagInput] =
    useState("");

  const [showHashtagPicker, setShowHashtagPicker] =
    useState(false);

  const [tagFriendInput, setTagFriendInput] =
    useState("");

  const [taggedFriends, setTaggedFriends] =
    useState([]);

  const [locationText, setLocationText] =
    useState("");

  const [shareToStory, setShareToStory] =
    useState(false);

  const [allowSharing, setAllowSharing] =
    useState(true);

  const [allowDownloads, setAllowDownloads] =
    useState(false);

  const [brandedContent, setBrandedContent] =
    useState(false);

  const [brandName, setBrandName] =
    useState("");

  const [coverFile, setCoverFile] =
    useState(null);

  const [coverPreviewUrl, setCoverPreviewUrl] =
    useState("");

  const [coverSource, setCoverSource] =
    useState("frame");

  const [coverFrameTime, setCoverFrameTime] =
    useState(0);

  const [coverFit, setCoverFit] =
    useState("cover");

  const [coverPositionX, setCoverPositionX] =
    useState(50);

  const [coverPositionY, setCoverPositionY] =
    useState(50);

  const [coverZoom, setCoverZoom] =
    useState(1);

  const [showCoverEditor, setShowCoverEditor] =
    useState(false);

  const [showAdvancedPublish, setShowAdvancedPublish] =
    useState(false);

  const [showTagFriends, setShowTagFriends] =
    useState(false);

  const [savingDraft, setSavingDraft] =
    useState(false);

  const [currentDraftId, setCurrentDraftId] =
    useState(draftId || "");

  const [uploading, setUploading] =
    useState(false);

  const [uploadProgress, setUploadProgress] =
    useState(0);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const [cameraOpen, setCameraOpen] =
    useState(false);

  const [cameraReady, setCameraReady] =
    useState(false);

  const [isRecording, setIsRecording] =
    useState(false);

  const [recordingSeconds, setRecordingSeconds] =
    useState(0);

  const [recordingLimit, setRecordingLimit] =
    useState(60);

  const [cameraFacing, setCameraFacing] =
    useState("user");

  const [showSoundPanel, setShowSoundPanel] =
    useState(false);

  const [selectedSound, setSelectedSound] =
    useState("Original sound");

  const [musicFile, setMusicFile] =
    useState(null);

  const [musicUrl, setMusicUrl] =
    useState("");

  const [musicName, setMusicName] =
    useState("");

  const [musicVolume, setMusicVolume] =
    useState(0.8);

  const [soundLibrary, setSoundLibrary] =
    useState([]);

  const [soundCategory, setSoundCategory] =
    useState("Trending");

  const [soundSearch, setSoundSearch] =
    useState("");

  const [previewingSoundId, setPreviewingSoundId] =
    useState("");

  const soundPreviewRef =
    useRef(null);

  const [selectedBackground, setSelectedBackground] =
    useState("none");

  const [backgroundFile, setBackgroundFile] =
    useState(null);

  const [backgroundUrl, setBackgroundUrl] =
    useState("");

  const [showVisualPanel, setShowVisualPanel] =
    useState(false);

  const [showMoreTools, setShowMoreTools] =
    useState(false);

  const [showCameraOptions, setShowCameraOptions] =
    useState(false);

  const fileInputRef =
    useRef(null);

  const photoInputRef =
    useRef(null);

  const cameraVideoRef =
    useRef(null);

  const mediaStreamRef =
    useRef(null);

  const mediaRecorderRef =
    useRef(null);

  const recordedChunksRef =
    useRef([]);

  const recordingTimerRef =
    useRef(null);

  const previewVideoRef =
    useRef(null);

  const musicInputRef =
    useRef(null);

  const backgroundInputRef =
    useRef(null);

  const coverInputRef =
    useRef(null);

  const coverVideoRef =
    useRef(null);

  const musicAudioRef =
    useRef(null);


  /* =====================================================
     AUTH
  ===================================================== */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(currentUser);
        }
      );

    return () =>
      unsubscribe();
  }, []);

  useEffect(() => {
    const soundsRef = ref(database, "soundLibrary");
    const unsubscribe = onValue(
      soundsRef,
      (snapshot) => {
        const value = snapshot.val() || {};
        const list = Object.entries(value)
          .map(([id, sound]) => ({ id, ...sound }))
          .filter((sound) => sound.audioURL || sound.audioUrl || sound.url)
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        setSoundLibrary(list);
      },
      (error) => {
        console.error("Vezlivo sound library error:", error);
        setSoundLibrary([]);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!soundPreviewRef.current) return;
    soundPreviewRef.current.volume = musicVolume;
  }, [musicVolume]);

  useEffect(() => {
    return () => {
      soundPreviewRef.current?.pause();
      soundPreviewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!draftId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const draft = await getVezlivoDraft(draftId);
        if (!draft || cancelled) return;
        if (draft.mediaBlob) {
          const restoredBlob = draft.mediaBlob instanceof Blob
            ? draft.mediaBlob
            : new Blob([draft.mediaBlob], { type: draft.mediaMimeType || (draft.mediaType === "video" ? "video/webm" : "image/jpeg") });
          const restored = new File([restoredBlob], draft.fileName || "Vezlivo draft", { type: restoredBlob.type || (draft.mediaType === "video" ? "video/webm" : "image/jpeg") });
          setMediaFile(restored); setMediaType(draft.mediaType || "video"); setPreviewUrl(URL.createObjectURL(restored));
        }
        if (draft.musicBlob) {
          const restoredMusicBlob = draft.musicBlob instanceof Blob
            ? draft.musicBlob
            : new Blob([draft.musicBlob], { type: draft.musicMimeType || "audio/mpeg" });
          const restoredMusic = new File([restoredMusicBlob], draft.musicFileName || draft.musicName || "Vezlivo sound.mp3", { type: restoredMusicBlob.type || "audio/mpeg" });
          setMusicFile(restoredMusic);
          setMusicUrl(URL.createObjectURL(restoredMusic));
        }
        setCurrentDraftId(draft.id); setContentType(draft.contentType || "post"); setCaption(draft.caption || "");
        setSelectedHashtags(Array.isArray(draft.hashtags) ? draft.hashtags : []); setTaggedFriends(Array.isArray(draft.taggedFriends) ? draft.taggedFriends.slice(0, 15) : []);
        setAudience(draft.audience || "public"); setCommentsEnabled(draft.commentsEnabled !== false); setOriginalAudio(draft.originalAudio !== false);
        setSelectedFilter(draft.filter || "none"); setSpeed(Number(draft.speed || 1)); setMuted(Boolean(draft.muted)); setOverlayText(draft.overlayText || "");
        setSelectedSound(draft.selectedSound || ""); setMusicName(draft.musicName || ""); setMusicVolume(Number(draft.musicVolume ?? 1)); setSelectedBackground(draft.background || "none");
        setLocationText(draft.locationText || ""); setShareToStory(Boolean(draft.shareToStory)); setAllowSharing(draft.allowSharing !== false); setAllowDownloads(Boolean(draft.allowDownloads)); setBrandedContent(Boolean(draft.brandedContent)); setBrandName(draft.brandName || ""); setCoverFrameTime(Number(draft.coverFrameTime || 0)); setCoverSource(draft.coverSource || "frame"); setCoverFit(draft.coverFit || "cover"); setCoverPositionX(Number(draft.coverPositionX ?? 50)); setCoverPositionY(Number(draft.coverPositionY ?? 50)); setCoverZoom(Number(draft.coverZoom || 1));
        setStep("edit"); setMessage("Draft reopened. Continue editing where you stopped.");
      } catch (error) { console.error("Vezlivo draft restore error:", error); setError("Could not reopen this draft."); }
    })();
    return () => { cancelled = true; };
  }, [draftId]);


  /* =====================================================
     PREVIEW CLEANUP
  ===================================================== */

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl
        );
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (musicUrl) {
        URL.revokeObjectURL(musicUrl);
      }
      if (backgroundUrl) {
        URL.revokeObjectURL(backgroundUrl);
      }
    };
  }, [musicUrl, backgroundUrl]);

  useEffect(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.volume = musicVolume;
    }
  }, [musicVolume]);

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl);
      }
    };
  }, [coverPreviewUrl]);



  /* =====================================================
     CAMERA CLEANUP
  ===================================================== */

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current
          .getTracks()
          .forEach((track) =>
            track.stop()
          );
      }

      if (recordingTimerRef.current) {
        clearInterval(
          recordingTimerRef.current
        );
      }
    };
  }, []);


  /* =====================================================
     HASHTAGS
  ===================================================== */

  useEffect(() => {
    const detected = extractHashtags(caption);
    if (!detected.length) return;
    setSelectedHashtags((current) =>
      [...new Set([...current, ...detected])].slice(0, 30)
    );
  }, [caption]);


  /* =====================================================
     CHOOSE CREATE TYPE
  ===================================================== */

  const chooseCreateType = (
    type
  ) => {
    setError("");
    setMessage("");

    setContentType(type);

    /*
      POST:
      photo or video

      REEL:
      video only

      STORY:
      photo or video
    */

    if (type === "reel") {
      openCamera("user", "reel");
      return;
    }

    setStep("create");
  };


  /* =====================================================
     FILE PREPARATION
  ===================================================== */

  const prepareFile = (
    file,
    type
  ) => {
    setMessage("");
    setError("");

    if (!file) {
      return;
    }

    if (
      contentType === "reel" &&
      type !== "video"
    ) {
      setError(
        "A Reel must be a video."
      );
      return;
    }

    if (type === "video") {
      if (
        !file.type.startsWith("video/")
      ) {
        setError(
          "Please choose a video file."
        );
        return;
      }

      if (
        file.size >
        MAX_VIDEO_SIZE
      ) {
        setError(
          "This video is larger than 500 MB."
        );
        return;
      }
    }

    if (type === "image") {
      if (
        !file.type.startsWith("image/")
      ) {
        setError(
          "Please choose an image."
        );
        return;
      }

      if (
        file.size >
        MAX_PHOTO_SIZE
      ) {
        setError(
          "This photo is larger than 20 MB."
        );
        return;
      }
    }

    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl
      );
    }

    const url =
      URL.createObjectURL(file);

    setMediaFile(file);
    setMediaType(type);
    setPreviewUrl(url);

    setSelectedFilter("none");
    setSpeed(1);
    setMuted(false);
    setOverlayText("");

    setStep("edit");
  };


  /* =====================================================
     FILE PICKERS
  ===================================================== */

  const chooseMedia = (
    event
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const type =
      file.type.startsWith("video/")
        ? "video"
        : "image";

    prepareFile(
      file,
      type
    );

    event.target.value = "";
  };


  const chooseVideoOnly = (
    event
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    prepareFile(
      file,
      "video"
    );

    event.target.value = "";
  };


  /* =====================================================
     MUSIC + VISUALS
  ===================================================== */

  const chooseMusic = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("audio/")) {
      setError("Please choose an audio file.");
      event.target.value = "";
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("This audio file is larger than 50 MB.");
      event.target.value = "";
      return;
    }

    if (musicUrl) {
      URL.revokeObjectURL(musicUrl);
    }

    const url = URL.createObjectURL(file);

    setMusicFile(file);
    setMusicUrl(url);
    setMusicName(file.name);
    setSelectedSound(file.name);
    setError("");
    setShowSoundPanel(true);

    event.target.value = "";
  };

  const stopSoundPreview = () => {
    if (soundPreviewRef.current) {
      soundPreviewRef.current.pause();
      soundPreviewRef.current.currentTime = 0;
    }
    setPreviewingSoundId("");
  };

  const previewLibrarySound = (sound) => {
    const url = sound.audioURL || sound.audioUrl || sound.url;
    if (!url) return;

    if (previewingSoundId === sound.id) {
      stopSoundPreview();
      return;
    }

    stopSoundPreview();
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = musicVolume;
    audio.onended = () => setPreviewingSoundId("");
    soundPreviewRef.current = audio;
    setPreviewingSoundId(sound.id);
    audio.play().catch((error) => {
      console.error("Sound preview could not start:", error);
      setPreviewingSoundId("");
    });
  };

  const selectLibrarySound = (sound) => {
    const url = sound.audioURL || sound.audioUrl || sound.url;
    if (!url) return;

    stopSoundPreview();
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    setMusicFile(null);
    setMusicUrl(url);
    setMusicName(sound.title || sound.name || "Vezlivo sound");
    setSelectedSound(sound.title || sound.name || "Vezlivo sound");
    setOriginalAudio(true);
    setError("");
  };

  const filteredSoundLibrary = soundLibrary.filter((sound) => {
    const category = sound.category || "Trending";
    const matchesCategory = category.toLowerCase() === soundCategory.toLowerCase();
    const query = soundSearch.trim().toLowerCase();
    const text = `${sound.title || sound.name || ""} ${sound.artist || ""}`.toLowerCase();
    return matchesCategory && (!query || text.includes(query));
  });

  const removeMusic = () => {
    if (musicUrl) {
      URL.revokeObjectURL(musicUrl);
    }

    if (musicAudioRef.current) {
      musicAudioRef.current.pause();
      musicAudioRef.current.currentTime = 0;
    }

    setMusicFile(null);
    setMusicUrl("");
    setMusicName("");
    setSelectedSound("Original sound");
    setOriginalAudio(true);
  };

  const chooseBackground = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image for your visual background.");
      event.target.value = "";
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("This visual is larger than 20 MB.");
      event.target.value = "";
      return;
    }

    if (backgroundUrl) {
      URL.revokeObjectURL(backgroundUrl);
    }

    const url = URL.createObjectURL(file);

    setBackgroundFile(file);
    setBackgroundUrl(url);
    setSelectedBackground("phone");
    setShowVisualPanel(true);
    setError("");

    event.target.value = "";
  };

  const removeBackground = () => {
    if (backgroundUrl) {
      URL.revokeObjectURL(backgroundUrl);
    }

    setBackgroundFile(null);
    setBackgroundUrl("");
    setSelectedBackground("none");
  };

  const selectedBackgroundStyle =
    backgroundUrl
      ? {
          backgroundImage: `url(${backgroundUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {
          background:
            VISUAL_BACKGROUNDS.find(
              (item) =>
                item.value === selectedBackground
            )?.css || "#000000",
        };

  const syncMusicToVideo = () => {
    const video = previewVideoRef.current;
    const audio = musicAudioRef.current;

    if (!video || !audio || !musicUrl) {
      return;
    }

    const difference =
      Math.abs(audio.currentTime - video.currentTime);

    if (difference > 0.35) {
      try {
        audio.currentTime = video.currentTime;
      } catch {}
    }
  };

  const handlePreviewPlay = () => {
    const audio = musicAudioRef.current;

    if (!audio || !musicUrl) {
      return;
    }

    syncMusicToVideo();

    audio.play().catch(() => {});
  };

  const handlePreviewPause = () => {
    musicAudioRef.current?.pause();
  };

  /* =====================================================
     CAMERA
  ===================================================== */

  const openCamera = async (
    facing = cameraFacing,
    requestedType = contentType
  ) => {
    setError("");
    setMessage("");

    if (requestedType) {
      setContentType(
        requestedType
      );
    }

    try {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setError(
          "Camera recording is not supported by this browser."
        );
        return;
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current
          .getTracks()
          .forEach((track) =>
            track.stop()
          );
      }

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode: facing,
            },
            audio: true,
          }
        );

      mediaStreamRef.current =
        stream;

      setCameraFacing(facing);
      setCameraOpen(true);
      setCameraReady(true);

      setTimeout(() => {
        if (
          cameraVideoRef.current
        ) {
          cameraVideoRef.current.srcObject =
            stream;

          cameraVideoRef.current
            .play()
            .catch(() => {});
        }
      }, 100);
    } catch (cameraError) {
      console.error(
        "Camera error:",
        cameraError
      );

      setError(
        "Vezlivo could not access your camera. Please allow camera permission."
      );
    }
  };


  const stopCamera = () => {
    if (
      mediaStreamRef.current
    ) {
      mediaStreamRef.current
        .getTracks()
        .forEach((track) =>
          track.stop()
        );

      mediaStreamRef.current =
        null;
    }

    if (
      cameraVideoRef.current
    ) {
      cameraVideoRef.current.srcObject =
        null;
    }

    setCameraOpen(false);
    setCameraReady(false);
    setIsRecording(false);

    if (recordingTimerRef.current) {
      clearInterval(
        recordingTimerRef.current
      );

      recordingTimerRef.current =
        null;
    }
  };


  const switchCamera = async () => {
    if (isRecording) {
      return;
    }

    const nextFacing =
      cameraFacing === "user"
        ? "environment"
        : "user";

    await openCamera(
      nextFacing
    );
  };


  /* =====================================================
     RECORD VIDEO
  ===================================================== */

  const startRecording = () => {
    if (
      !mediaStreamRef.current
    ) {
      return;
    }

    recordedChunksRef.current =
      [];

    let recorder;

    const preferredTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];

    let selectedMime = "";

    for (
      const mimeType of preferredTypes
    ) {
      if (
        MediaRecorder.isTypeSupported?.(
          mimeType
        )
      ) {
        selectedMime =
          mimeType;
        break;
      }
    }

    try {
      recorder =
        new MediaRecorder(
          mediaStreamRef.current,
          selectedMime
            ? {
                mimeType:
                  selectedMime,
              }
            : undefined
        );
    } catch {
      try {
        recorder =
          new MediaRecorder(
            mediaStreamRef.current
          );
      } catch {
        setError(
          "Video recording is not supported on this device."
        );
        return;
      }
    }

    mediaRecorderRef.current =
      recorder;

    recorder.ondataavailable =
      (event) => {
        if (
          event.data &&
          event.data.size > 0
        ) {
          recordedChunksRef.current.push(
            event.data
          );
        }
      };

    recorder.onerror = () => {
      setError(
        "Something went wrong while recording."
      );

      stopRecording();
    };

    recorder.onstop = () => {
      const blob =
        new Blob(
          recordedChunksRef.current,
          {
            type:
              recorder.mimeType ||
              "video/webm",
          }
        );

      const file =
        new File(
          [blob],
          `vezlivo-${Date.now()}.webm`,
          {
            type:
              blob.type ||
              "video/webm",
          }
        );

      stopCamera();

      prepareFile(
        file,
        "video"
      );

      setIsRecording(false);
      setRecordingSeconds(0);
    };

    try {
      recorder.start(250);
    } catch {
      setError(
        "Vezlivo could not start recording."
      );
      return;
    }

    setIsRecording(true);
    setRecordingSeconds(0);

    recordingTimerRef.current =
      setInterval(() => {
        setRecordingSeconds(
          (value) => {
            const next =
              value + 1;

            if (
              next >=
              recordingLimit
            ) {
              setTimeout(
                () => {
                  stopRecording();
                },
                0
              );
            }

            return next;
          }
        );
      }, 1000);
  };


  const stopRecording = () => {
    if (
      recordingTimerRef.current
    ) {
      clearInterval(
        recordingTimerRef.current
      );

      recordingTimerRef.current =
        null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !==
        "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  };


  /* =====================================================
     MEDIA ACTIONS
  ===================================================== */

  const removeMedia = () => {
    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl
      );
    }

    setMediaFile(null);
    setMediaType("");
    setPreviewUrl("");
    setCaption("");
    setOverlayText("");
    setSelectedFilter("none");
    setSpeed(1);
    setMuted(false);
    removeMusic();
    removeBackground();
    clearCover();
    setLocationText("");
    setShareToStory(false);
    setAllowSharing(true);
    setAllowDownloads(false);
    setBrandedContent(false);
    setBrandName("");
    setCoverFrameTime(0);
    setCoverFit("cover");
    setCoverPositionX(50);
    setCoverPositionY(50);
    setCoverZoom(1);
    setShowCoverEditor(false);
    setShowAdvancedPublish(false);
    setContentType("");
    setStep("create");
    setMessage("");
    setError("");
  };


  const goBack = () => {
    if (uploading) {
      return;
    }

    if (cameraOpen) {
      stopCamera();
      return;
    }

    if (step === "edit") {
      setStep("create");
      return;
    }

    if (step === "post") {
      setStep("edit");
      return;
    }

    window.history.back();
  };


  /* =====================================================
     VIDEO SETTINGS
  ===================================================== */

  useEffect(() => {
    if (
      previewVideoRef.current
    ) {
      previewVideoRef.current.playbackRate =
        speed;

      previewVideoRef.current.muted =
        muted ||
        !originalAudio;
    }
  }, [
    speed,
    muted,
    originalAudio,
    step,
  ]);


  /* =====================================================
     HASHTAGS / TAG FRIENDS
  ===================================================== */

  const addHashtag = (rawValue) => {
    const tag = normalizeHashtag(rawValue);

    if (!tag) {
      return;
    }

    setSelectedHashtags((current) =>
      current.includes(tag)
        ? current
        : [...current, tag].slice(0, 30)
    );

    setHashtagInput("");
  };

  const removeHashtag = (tagToRemove) => {
    setSelectedHashtags((current) =>
      current.filter((tag) => tag !== tagToRemove)
    );
  };

  const addTaggedFriend = () => {
    const cleaned = String(tagFriendInput || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/[^\p{L}\p{N}_.]/gu, "");

    if (!cleaned) {
      return;
    }

    const tag = `@${cleaned}`;

    if (taggedFriends.includes(tag)) {
      setTagFriendInput("");
      return;
    }

    if (taggedFriends.length >= 15) {
      setError("You can tag a maximum of 15 friends.");
      return;
    }

    setTaggedFriends((current) => [...current, tag]);
    setTagFriendInput("");
    setError("");
  };

  const removeTaggedFriend = (tagToRemove) => {
    setTaggedFriends((current) =>
      current.filter((tag) => tag !== tagToRemove)
    );
  };

  const hashtagSuggestions =
    VEZLIVO_HASHTAG_SUGGESTIONS.filter((tag) =>
      !selectedHashtags.includes(tag) &&
      (
        !hashtagInput ||
        tag.toLowerCase().includes(
          hashtagInput.replace(/^#/, "").toLowerCase()
        )
      )
    ).slice(0, 8);

  const saveDraft = async () => {
    if (!mediaFile) { setError("Select or record media before saving a draft."); return; }
    try {
      setSavingDraft(true); setError(""); setMessage("");
      const id = currentDraftId || `draft-${Date.now()}`;
      await putVezlivoDraft({
        id, uid: user?.uid || "", contentType: contentType || "post", mediaType,
        fileName: mediaFile.name || "Vezlivo media",
        mediaMimeType: mediaFile.type || (mediaType === "video" ? "video/webm" : "image/jpeg"),
        mediaBlob: await mediaFile.arrayBuffer(),
        caption: caption.trim(),
        hashtags: selectedHashtags, taggedFriends: taggedFriends.slice(0, 15), audience, commentsEnabled, originalAudio, shareToStory, allowSharing, allowDownloads, brandedContent, brandName, locationText, coverFrameTime, coverSource, coverFit, coverPositionX, coverPositionY, coverZoom,
        selectedSound, musicName, musicVolume,
        musicFileName: musicFile?.name || "",
        musicMimeType: musicFile?.type || "",
        musicBlob: musicFile ? await musicFile.arrayBuffer() : null,
        background: backgroundFile?.name || selectedBackground, filter: selectedFilter, speed, muted,
        overlayText: overlayText.trim(), savedAt: Date.now(),
      });
      setCurrentDraftId(id); setMessage("Draft saved on this device. You can continue editing it later.");
    } catch (draftError) { console.error("Vezlivo draft error:", draftError); setError("Could not save this draft on your device."); }
    finally { setSavingDraft(false); }
  };

  /* =====================================================
     REEL COVER + PUBLISHING CONTROLS
  ===================================================== */

  const clearCover = () => {
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }
    setCoverFile(null);
    setCoverPreviewUrl("");
    setCoverSource("frame");
  };

  const chooseCoverPhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image for your Reel cover.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_PHOTO_SIZE) {
      setError("This cover photo is larger than 20 MB.");
      event.target.value = "";
      return;
    }

    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    const url = URL.createObjectURL(file);
    setCoverFile(file);
    setCoverPreviewUrl(url);
    setCoverSource("photo");
    setError("");
    event.target.value = "";
  };

  const captureCoverFrame = async () => {
    if (!mediaFile || mediaType !== "video") {
      setError("A video is required to choose a cover frame.");
      return;
    }

    const video = coverVideoRef.current || previewVideoRef.current;
    if (!video) {
      setError("The video is still loading. Try again in a moment.");
      return;
    }

    try {
      const duration = Number(video.duration || 0);
      const safeTime = Math.min(Math.max(Number(coverFrameTime) || 0, 0), Math.max(duration - 0.05, 0));

      if (Math.abs(video.currentTime - safeTime) > 0.05) {
        await new Promise((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked, { once: true });
          try { video.currentTime = safeTime; } catch { resolve(); }
        });
      }

      if (!video.videoWidth || !video.videoHeight) {
        throw new Error("Video dimensions are not available yet.");
      }

      const canvas = document.createElement("canvas");
      const maxWidth = 1080;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create cover image.");

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not create cover image.")), "image/jpeg", 0.9);
      });

      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      const url = URL.createObjectURL(blob);
      const file = new File([blob], `vezlivo-cover-${Date.now()}.jpg`, { type: "image/jpeg" });

      setCoverFile(file);
      setCoverPreviewUrl(url);
      setCoverSource("frame");
      setCoverFrameTime(safeTime);
      setError("");
      return file;
    } catch (coverError) {
      console.error("Vezlivo cover capture error:", coverError);
      setError("Vezlivo could not create that cover frame. Try another frame.");
      return null;
    }
  };

  const setCoverFromCurrentVideo = () => {
    const video = previewVideoRef.current;
    if (!video) {
      setError("The video preview is not ready yet.");
      return;
    }
    setCoverFrameTime(Number(video.currentTime || 0));
    setTimeout(() => captureCoverFrame(), 0);
  };

  const coverStyle = {
    objectFit: coverFit,
    objectPosition: `${coverPositionX}% ${coverPositionY}%`,
    transform: `scale(${coverZoom})`,
  };

  /* =====================================================
     PUBLISH
  ===================================================== */

  const publishPost =
    async () => {
      setMessage("");
      setError("");

      if (!user) {
        setError(
          "Please log in before publishing."
        );
        return;
      }

      if (!mediaFile) {
        setError(
          "Please select or record something first."
        );
        return;
      }

      if (
        caption.length >
        MAX_CAPTION
      ) {
        setError(
          "Your caption is too long."
        );
        return;
      }

      try {
        setUploading(true);
        setUploadProgress(0);

        const postId =
          push(
            ref(
              database,
              contentType === "story"
                ? "stories"
                : "posts"
            )
          ).key;

        if (!postId) {
          throw new Error(
            "Could not create the post."
          );
        }

        const extension =
          mediaFile.name.includes(".")
            ? mediaFile.name
                .split(".")
                .pop()
                .toLowerCase()
            : mediaType === "video"
            ? "webm"
            : "jpg";

        const storagePath =
          `${contentType === "story" ? "stories" : "posts"}/${user.uid}/${postId}.${extension}`;

        const fileReference =
          storageRef(
            storage,
            storagePath
          );

        setMessage(
          contentType === "story"
            ? "Uploading your Vezlivo story..."
            : contentType === "reel"
            ? "Uploading your Vezlivo Reel..."
            : "Uploading your Vezlivo post..."
        );

        const uploadFile = (file, path, onProgress) => {
          const fileReference = storageRef(storage, path);
          const task = uploadBytesResumable(fileReference, file, {
            contentType: file.type || "application/octet-stream",
          });

          return new Promise((resolve, reject) => {
            task.on(
              "state_changed",
              (snapshot) => {
                if (onProgress) {
                  onProgress(snapshot.bytesTransferred, snapshot.totalBytes);
                }
              },
              reject,
              async () => {
                try {
                  resolve(await getDownloadURL(task.snapshot.ref));
                } catch (urlError) {
                  reject(urlError);
                }
              }
            );
          });
        };

        let mediaTransferred = 0;
        let musicTransferred = 0;
        let coverTransferred = 0;

        const updateCombinedProgress = () => {
          const total =
            mediaFile.size +
            (musicFile?.size || 0) +
            (coverFile?.size || 0);
          const transferred =
            mediaTransferred +
            musicTransferred +
            coverTransferred;
          setUploadProgress(total > 0 ? Math.min(99, Math.round((transferred / total) * 100)) : 0);
        };

        const musicExtension = musicFile
          ? (musicFile.name.includes(".") ? musicFile.name.split(".").pop().toLowerCase() : "mp3")
          : "";

        // A Reel cover is optional. Vezlivo never silently chooses a frame for the creator.
        // The creator can scrub to any frame and press "Use this frame", or choose a photo.
        const selectedCoverFile = coverFile;

        const coverStoragePath =
          contentType === "reel" && mediaType === "video" && selectedCoverFile
            ? `covers/${user.uid}/${postId}.jpg`
            : "";

        const uploadJobs = [
          uploadFile(
            mediaFile,
            storagePath,
            (transferred) => {
              mediaTransferred = transferred;
              updateCombinedProgress();
            }
          ),
        ];

        if (musicFile) {
          uploadJobs.push(
            uploadFile(
              musicFile,
              `sounds/${user.uid}/${postId}.${musicExtension}`,
              (transferred) => {
                musicTransferred = transferred;
                updateCombinedProgress();
              }
            )
          );
        }

        if (selectedCoverFile) {
          uploadJobs.push(
            uploadFile(
              selectedCoverFile,
              coverStoragePath,
              (transferred) => {
                coverTransferred = transferred;
                updateCombinedProgress();
              }
            )
          );
        }

        const uploadedUrls = await Promise.all(uploadJobs);
        const mediaURL = uploadedUrls[0];
        const musicURL = musicFile
          ? uploadedUrls[1]
          : (musicUrl || "");
        const coverURL = selectedCoverFile
          ? uploadedUrls[musicFile ? 2 : 1]
          : "";

        setUploadProgress(99);

        const detectedHashtags = [
          ...new Set([
            ...extractHashtags(caption),
            ...selectedHashtags,
          ]),
        ].slice(0, 30);

        const mentions =
          extractMentions(
            caption
          );

        const username =
          user.displayName ||
          user.email?.split("@")[0] ||
          "Vezlivo user";

        const now =
          Date.now();

        const baseData = {
          id: postId,

          uid: user.uid,

          username,

          userEmail:
            user.email || "",

          userPhotoURL:
            user.photoURL || "",

          mediaType,

          mediaURL,

          storagePath,

          caption:
            caption.trim(),

          hashtags:
            detectedHashtags,

          mentions: [
            ...new Set([
              ...mentions,
              ...taggedFriends,
            ]),
          ],

          taggedFriends,

          audience,

          commentsEnabled,

          originalAudio,

          selectedSound,

          musicName,

          musicURL,

          musicVolume,

          background:
            backgroundFile?.name ||
            selectedBackground,

          filter:
            selectedFilter,

          speed,

          muted,

          overlayText:
            overlayText.trim(),

          createdAt: now,

          updatedAt: now,
          location: locationText.trim(),
          allowSharing,
          allowDownloads,
          brandedContent,
          brandName: brandName.trim(),
          coverURL,
          coverStoragePath,
          coverSource,
          coverFrameTime: Number(coverFrameTime || 0),
          coverFit,
          coverPositionX,
          coverPositionY,
          coverZoom,
        };


        /* ===============================================
           STORY
        =============================================== */

        if (
          contentType === "story"
        ) {
          const expiresAt =
            now +
            24 *
              60 *
              60 *
              1000;

          await set(
            ref(
              database,
              `stories/${postId}`
            ),
            {
              ...baseData,

              type: "story",

              expiresAt,

              status:
                "published",

              views: 0,

              replies: 0,
            }
          );

          setUploadProgress(100);

          setMessage(
            "Your story is now live on Vezlivo for 24 hours."
          );
        } else {
          /* =============================================
             POST / REEL
          ============================================= */

          const postData = {
            ...baseData,

            postType:
              contentType === "reel"
                ? "reel"
                : "post",

            likes: 0,

            likesCount: 0,

            comments: 0,

            commentsCount: 0,

            shares: 0,

            reposts: 0,

            saves: 0,

            views: 0,

            viewsCount: 0,

            status:
              "published",
          };

          await set(
            ref(
              database,
              `posts/${user.uid}/${postId}`
            ),
            postData
          );

          if (
            mediaType === "video"
          ) {
            await set(
              ref(
                database,
                `videos/${user.uid}/${postId}`
              ),
              {
                ...postData,

                // Backward-compatible alias for older video consumers.
                videoURL: mediaURL,
              }
            );
          }

          if (contentType === "reel" && shareToStory) {
            const storyId = push(ref(database, "stories")).key;
            if (storyId) {
              const expiresAt = now + 24 * 60 * 60 * 1000;
              await set(ref(database, `stories/${storyId}`), {
                id: storyId,
                uid: user.uid,
                username,
                userEmail: user.email || "",
                userPhotoURL: user.photoURL || "",
                type: "story",
                storyType: "reelShare",
                sharedPostId: postId,
                mediaType: "video",
                mediaURL,
                coverURL,
                caption: caption.trim(),
                createdAt: now,
                expiresAt,
                status: "published",
                views: 0,
                replies: 0,
              });
            }
          }

          await Promise.all(
            detectedHashtags.map((hashtag) => {
              const cleanTag = hashtag.replace(/^#/, "").toLowerCase();
              return set(
                ref(database, `hashtagsUsage/${cleanTag}`),
                { hashtag, lastUsedAt: now }
              );
            })
          );

          setUploadProgress(100);

          setMessage(
            contentType === "reel"
              ? "Your Reel is live on Vezlivo."
              : "Your post is live on Vezlivo."
          );
        }

        setTimeout(() => {
          removeMedia();
        }, 1200);

        if (currentDraftId) {
          try { await deleteVezlivoDraft(currentDraftId); }
          catch (draftDeleteError) { console.warn("Vezlivo draft cleanup failed:", draftDeleteError); }
        }

      } catch (
        publishError
      ) {
        console.error(
          "Vezlivo publish error:",
          publishError
        );

        setError(
          publishError?.message ||
            "Something went wrong while publishing your content."
        );
      } finally {
        setUploading(false);
      }
    };


  /* =====================================================
     LOGIN
  ===================================================== */

  if (!user) {
    return (
      <main
        style={
          styles.page
        }
      >
        <section
          style={
            styles.loginCard
          }
        >
          <img
            src="/Logo.png"
            alt="Vezlivo"
            style={
              styles.loginLogo
            }
          />

          <h1
            style={
              styles.title
            }
          >
            Create on Vezlivo
          </h1>

          <p
            style={
              styles.muted
            }
          >
            Log in to create
            and share your
            content.
          </p>

          <button
            type="button"
            style={
              styles.primaryButton
            }
            onClick={() =>
              window.history.back()
            }
          >
            Go back
          </button>
        </section>
      </main>
    );
  }


  /* =====================================================
     CAMERA
  ===================================================== */

  if (cameraOpen) {
    return (
      <main
        style={
          styles.cameraPage
        }
      >
        <video
          ref={
            cameraVideoRef
          }
          autoPlay
          playsInline
          muted
          style={
            styles.cameraVideo
          }
        />

        <div
          style={
            styles.cameraGradient
          }
        />

        <div
          style={
            styles.cameraTop
          }
        >
          <button
            type="button"
            style={
              styles.cameraIconButton
            }
            onClick={
              isRecording
                ? stopRecording
                : stopCamera
            }
          >
            ×
          </button>

          <div
            style={
              styles.cameraModeTitle
            }
          >
            {contentType ===
            "reel"
              ? "Reel"
              : contentType ===
                "story"
              ? "Story"
              : "Post"}
          </div>

          <button
            type="button"
            style={
              styles.cameraIconButton
            }
            onClick={
              switchCamera
            }
            disabled={
              isRecording
            }
          >
            ↻
          </button>
        </div>


        {!isRecording && (
          <div
            style={
              styles.cameraTopControls
            }
          >
            <button
              type="button"
              style={
                styles.cameraSmallControl
              }
              onClick={() =>
                setShowSoundPanel(
                  (value) =>
                    !value
                )
              }
            >
              ♪
              <span>
                Sound
              </span>
            </button>

            <button
              type="button"
              style={
                styles.cameraSmallControl
              }
              onClick={() =>
                setShowCameraOptions(
                  (value) =>
                    !value
                )
              }
            >
              {recordingLimit}s
              <span>
                Length
              </span>
            </button>
          </div>
        )}


        {showSoundPanel &&
          !isRecording && (
            <div
              style={
                styles.soundPanel
              }
            >
              <strong>
                Add sound
              </strong>

              <button
                type="button"
                style={
                  selectedSound ===
                  "Original sound"
                    ? styles.soundOptionActive
                    : styles.soundOption
                }
                onClick={() => {
                  setSelectedSound(
                    "Original sound"
                  );

                  setShowSoundPanel(
                    false
                  );
                }}
              >
                Original sound
              </button>

              <button
                type="button"
                style={
                  selectedSound ===
                  "Vezlivo music"
                    ? styles.soundOptionActive
                    : styles.soundOption
                }
                onClick={() => {
                  setSelectedSound(
                    "Vezlivo music"
                  );

                  setShowSoundPanel(
                    false
                  );
                }}
              >
                Vezlivo music
              </button>
            </div>
          )}


        {showCameraOptions &&
          !isRecording && (
            <div
              style={
                styles.lengthPanel
              }
            >
              <strong>
                Video length
              </strong>

              <button
                type="button"
                style={
                  recordingLimit ===
                  15
                    ? styles.lengthActive
                    : styles.lengthButton
                }
                onClick={() => {
                  setRecordingLimit(
                    15
                  );

                  setShowCameraOptions(
                    false
                  );
                }}
              >
                15 seconds
              </button>

              <button
                type="button"
                style={
                  recordingLimit ===
                  60
                    ? styles.lengthActive
                    : styles.lengthButton
                }
                onClick={() => {
                  setRecordingLimit(
                    60
                  );

                  setShowCameraOptions(
                    false
                  );
                }}
              >
                60 seconds
              </button>
            </div>
          )}


        <div
          style={
            styles.cameraBottom
          }
        >
          <div
            style={
              styles.cameraHint
            }
          >
            {isRecording
              ? `${recordingSeconds}s / ${recordingLimit}s`
              : "Tap the button to record"}
          </div>

          <button
            type="button"
            style={{
              ...styles.recordButton,

              ...(isRecording
                ? styles.recordingButton
                : {}),
            }}
            onClick={
              isRecording
                ? stopRecording
                : startRecording
            }
          >
            <span
              style={
                isRecording
                  ? styles.recordingSquare
                  : styles.recordingCircle
              }
            />
          </button>


          <div
            style={
              styles.cameraBottomActions
            }
          >
            {contentType !==
              "reel" && (
              <button
                type="button"
                style={
                  styles.cameraBottomAction
                }
                onClick={() =>
                  photoInputRef.current?.click()
                }
              >
                <span>
                  ▧
                </span>
                Photo
              </button>
            )}

            <button
              type="button"
              style={
                styles.cameraBottomAction
              }
              onClick={() =>
                fileInputRef.current?.click()
              }
            >
              <span>
                ▣
              </span>
              Gallery
            </button>
          </div>
        </div>


        <input
          ref={
            fileInputRef
          }
          type="file"
          accept="video/*"
          hidden
          onChange={
            chooseVideoOnly
          }
        />

        <input
          ref={
            photoInputRef
          }
          type="file"
          accept="image/*"
          hidden
          onChange={
            chooseMedia
          }
        />

        {error && (
          <div
            style={
              styles.cameraError
            }
          >
            {error}
          </div>
        )}
      </main>
    );
  }


  /* =====================================================
     CREATE MENU
  ===================================================== */

  if (
    step === "create"
  ) {
    return (
      <main
        style={
          styles.createPage
        }
      >
        <header
          style={
            styles.createHeader
          }
        >
          <button
            type="button"
            style={
              styles.backButton
            }
            onClick={
              goBack
            }
          >
            ×
          </button>

          <h1
            style={
              styles.headerTitle
            }
          >
            Create
          </h1>

          <div
            style={
              styles.headerSpacer
            }
          />
        </header>


        <section
          style={
            styles.createHero
          }
        >
          <img
            src="/Logo.png"
            alt="Vezlivo"
            style={
              styles.heroLogo
            }
          />

          <h2
            style={
              styles.heroTitle
            }
          >
            What do you want to create?
          </h2>

          <p
            style={
              styles.heroSubtitle
            }
          >
            Choose Post, Reel or Story.
          </p>
        </section>


        <section
          style={
            styles.createChoiceList
          }
        >

          {/* POST */}

          <button
            type="button"
            style={
              styles.createChoice
            }
            onClick={() => {
              setContentType(
                "post"
              );
              setError("");
              setMessage("");
              setStep("postChooser");
            }}
          >
            <div
              style={
                styles.choiceIcon
              }
            >
              +
            </div>

            <div
              style={
                styles.choiceText
              }
            >
              <strong>
                Post
              </strong>

              <span>
                Share a photo or video
                with your followers.
              </span>
            </div>

            <b>
              →
            </b>
          </button>


          {/* REEL */}

          <button
            type="button"
            style={
              styles.createChoice
            }
            onClick={() => {
              setContentType(
                "reel"
              );

              setError("");
              setMessage("");

              setStep(
                "reelChooser"
              );
            }}
          >
            <div
              style={
                styles.choiceIcon
              }
            >
              ▶
            </div>

            <div
              style={
                styles.choiceText
              }
            >
              <strong>
                Reel
              </strong>

              <span>
                Create a short vertical
                video.
              </span>
            </div>

            <b>
              →
            </b>
          </button>


          {/* STORY */}

          <button
            type="button"
            style={
              styles.createChoice
            }
            onClick={() => {
              setContentType(
                "story"
              );

              setError("");
              setMessage("");

              setStep(
                "storyChooser"
              );
            }}
          >
            <div
              style={
                styles.choiceIcon
              }
            >
              ○
            </div>

            <div
              style={
                styles.choiceText
              }
            >
              <strong>
                Story
              </strong>

              <span>
                Share something that
                disappears after 24 hours.
              </span>
            </div>

            <b>
              →
            </b>
          </button>

        </section>


        {error && (
          <div
            style={
              styles.errorBox
            }
          >
            {error}
          </div>
        )}
      </main>
    );
  }


  /* =====================================================
     POST / REEL / STORY CHOOSER
  ===================================================== */

  if (
    step === "postChooser" ||
    step === "reelChooser" ||
    step === "storyChooser"
  ) {
    const isPost =
      step === "postChooser";

    const isReel =
      step === "reelChooser";

    const isStory =
      step === "storyChooser";

    return (
      <main
        style={
          styles.createPage
        }
      >
        <header
          style={
            styles.createHeader
          }
        >
          <button
            type="button"
            style={
              styles.backButton
            }
            onClick={() =>
              setStep("create")
            }
          >
            ←
          </button>

          <h1
            style={
              styles.headerTitle
            }
          >
            {isPost
              ? "New Post"
              : isReel
              ? "New Reel"
              : "New Story"}
          </h1>

          <div
            style={
              styles.headerSpacer
            }
          />
        </header>


        <section
          style={
            styles.chooserHero
          }
        >
          <div
            style={
              styles.chooserIcon
            }
          >
            {isPost
              ? "+"
              : isReel
              ? "▶"
              : "○"}
          </div>

          <h2>
            {isPost
              ? "Create a post"
              : isReel
              ? "Create a Reel"
              : "Create a Story"}
          </h2>

          <p>
            {isPost
              ? "Choose a photo or video."
              : isReel
              ? "Record or upload a short video."
              : "Choose a photo or video to share for 24 hours."}
          </p>
        </section>


        <section
          style={
            styles.mediaChooserGrid
          }
        >

          {/* CAMERA */}

          <button
            type="button"
            style={
              styles.mediaChooserButton
            }
            onClick={() =>
              openCamera(
                "user",
                contentType
              )
            }
          >
            <span>
              ●
            </span>

            <strong>
              Camera
            </strong>

            <small>
              Record now
            </small>
          </button>


          {/* PHOTO */}

          {!isReel && (
            <button
              type="button"
              style={
                styles.mediaChooserButton
              }
              onClick={() =>
                photoInputRef.current?.click()
              }
            >
              <span>
                ▧
              </span>

              <strong>
                Photo
              </strong>

              <small>
                Choose photo
              </small>
            </button>
          )}


          {/* VIDEO */}

          <button
            type="button"
            style={
              styles.mediaChooserButton
            }
            onClick={() =>
              fileInputRef.current?.click()
            }
          >
            <span>
              ▣
            </span>

            <strong>
              Video
            </strong>

            <small>
              Choose video
            </small>
          </button>

        </section>


        <input
          ref={
            fileInputRef
          }
          type="file"
          accept="video/*"
          hidden
          onChange={
            chooseVideoOnly
          }
        />

        <input
          ref={
            photoInputRef
          }
          type="file"
          accept="image/*"
          hidden
          onChange={
            chooseMedia
          }
        />


        {error && (
          <div
            style={
              styles.errorBox
            }
          >
            {error}
          </div>
        )}
      </main>
    );
  }


  /* =====================================================
     EDIT
  ===================================================== */

  if (
    step === "edit"
  ) {
    const activeBackground =
      backgroundUrl
        ? "phone"
        : selectedBackground;

    return (
      <main
        style={
          styles.editPage
        }
      >
        <header
          style={
            styles.editHeader
          }
        >
          <button
            type="button"
            style={
              styles.lightButton
            }
            onClick={
              goBack
            }
            aria-label="Back"
          >
            ←
          </button>

          <div className="editorHeaderTitle">
            <strong>
              {contentType ===
              "reel"
                ? "Edit Reel"
                : contentType ===
                  "story"
                ? "Edit Story"
                : "Edit Post"}
            </strong>
            <span>
              Make it yours
            </span>
          </div>

          <button
            type="button"
            style={
              styles.nextButton
            }
            onClick={() =>
              setStep("post")
            }
          >
            Next
          </button>
        </header>

        <div className="vezlivo-editor-shell">

          <section className="vezlivo-editor-preview-pane">
            <div
              className="vezlivo-media-stage"
              style={
                activeBackground !== "none"
                  ? selectedBackgroundStyle
                  : { background: "#000000" }
              }
            >
              <div
                style={{
                  ...styles.mediaFrame,
                  background: "transparent",
                }}
              >
                {mediaType ===
                "video" ? (
                  <video
                    ref={
                      previewVideoRef
                    }
                    src={
                      previewUrl
                    }
                    controls
                    playsInline
                    autoPlay
                    loop
                    muted={
                      muted ||
                      !originalAudio
                    }
                    onPlay={
                      handlePreviewPlay
                    }
                    onPause={
                      handlePreviewPause
                    }
                    onSeeked={
                      syncMusicToVideo
                    }
                    onTimeUpdate={
                      syncMusicToVideo
                    }
                    style={{
                      ...styles.previewMedia,

                      filter:
                        FILTERS.find(
                          (item) =>
                            item.value ===
                            selectedFilter
                        )?.value ||
                        "none",
                    }}
                  />
                ) : (
                  <img
                    src={
                      previewUrl
                    }
                    alt="Selected Vezlivo media"
                    style={{
                      ...styles.previewMedia,

                      filter:
                        FILTERS.find(
                          (item) =>
                            item.value ===
                            selectedFilter
                        )?.value ||
                        "none",
                    }}
                  />
                )}

                {overlayText && (
                  <div
                    style={
                      styles.textOverlay
                    }
                  >
                    {overlayText}
                  </div>
                )}

                {musicUrl && (
                  <div className="vezlivo-audio-chip">
                    ♪ {musicName || "Added sound"}
                  </div>
                )}

                <div
                  style={
                    styles.previewBadge
                  }
                >
                  {contentType.toUpperCase()}
                </div>
              </div>
            </div>

            {musicUrl && (
              <audio
                ref={musicAudioRef}
                src={musicUrl}
                preload="auto"
                loop
              />
            )}

            <div className="vezlivo-editor-timeline">
              <span>
                {mediaType === "video"
                  ? "Video timeline"
                  : "Photo"}
              </span>

              <div className="vezlivo-timeline-track">
                <div className="vezlivo-timeline-progress" />
              </div>

              <span>
                {speed}×
              </span>
            </div>
          </section>

          <aside className="vezlivo-editor-toolbar">

            <div className="vezlivo-toolbar-heading">
              <strong>Edit</strong>
              <span>
                Tools
              </span>
            </div>

            <div className="vezlivo-tool-grid">

              <button
                type="button"
                className="vezlivo-editor-tool"
                onClick={() =>
                  setShowSoundPanel(
                    (value) =>
                      !value
                  )
                }
              >
                <span>♫</span>
                <b>Sound</b>
                <small>
                  {musicUrl
                    ? "Added"
                    : "Add music"}
                </small>
              </button>

              <button
                type="button"
                className="vezlivo-editor-tool"
                onClick={() =>
                  setShowVisualPanel(
                    (value) =>
                      !value
                  )
                }
              >
                <span>▧</span>
                <b>Visual</b>
                <small>
                  Background
                </small>
              </button>

              <button
                type="button"
                className="vezlivo-editor-tool"
                onClick={() =>
                  setShowTextEditor(
                    (value) =>
                      !value
                  )
                }
              >
                <span>T</span>
                <b>Text</b>
                <small>
                  Add words
                </small>
              </button>

              <button
                type="button"
                className="vezlivo-editor-tool"
                onClick={() =>
                  setSelectedFilter(
                    (current) => {
                      const index =
                        FILTERS.findIndex(
                          (item) =>
                            item.value ===
                            current
                        );

                      return FILTERS[
                        (index + 1) %
                          FILTERS.length
                      ].value;
                    }
                  )
                }
              >
                <span>◐</span>
                <b>Filter</b>
                <small>
                  {FILTERS.find(
                    (item) =>
                      item.value ===
                      selectedFilter
                  )?.name || "Original"}
                </small>
              </button>

              {mediaType === "video" && (
                <>
                  <button
                    type="button"
                    className="vezlivo-editor-tool"
                    onClick={() =>
                      setSpeed(
                        (current) => {
                          const index =
                            SPEEDS.indexOf(
                              current
                            );

                          return SPEEDS[
                            (index + 1) %
                              SPEEDS.length
                          ];
                        }
                      )
                    }
                  >
                    <span>1×</span>
                    <b>Speed</b>
                    <small>
                      {speed}×
                    </small>
                  </button>

                  <button
                    type="button"
                    className="vezlivo-editor-tool"
                    onClick={() =>
                      setOriginalAudio(
                        (value) =>
                          !value
                      )
                    }
                  >
                    <span>
                      {originalAudio
                        ? "🔊"
                        : "🔇"}
                    </span>
                    <b>Original</b>
                    <small>
                      {originalAudio
                        ? "On"
                        : "Off"}
                    </small>
                  </button>
                </>
              )}

              <button
                type="button"
                className="vezlivo-editor-tool"
                onClick={() =>
                  setShowMoreTools(
                    (value) =>
                      !value
                  )
                }
              >
                <span>•••</span>
                <b>More</b>
                <small>
                  More tools
                </small>
              </button>

            </div>

            {showSoundPanel && (
              <div className="vezlivo-editor-panel">
                <div className="vezlivo-panel-title">
                  <div>
                    <strong>Add sound</strong>
                    <span>Choose a Vezlivo sound or use audio from your phone</span>
                  </div>
                  <button type="button" onClick={() => setShowSoundPanel(false)}>×</button>
                </div>

                <div className="vezlivo-sound-search-row">
                  <input
                    type="search"
                    value={soundSearch}
                    onChange={(event) => setSoundSearch(event.target.value)}
                    placeholder="Search sounds"
                    aria-label="Search Vezlivo sounds"
                  />
                </div>

                <div className="vezlivo-sound-categories">
                  {["Trending", "Funny", "Gospel", "Popular"].map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={soundCategory === category ? "active" : ""}
                      onClick={() => setSoundCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                <div className="vezlivo-sound-list">
                  {filteredSoundLibrary.length > 0 ? filteredSoundLibrary.map((sound) => (
                    <div key={sound.id} className="vezlivo-sound-item">
                      <button
                        type="button"
                        className="vezlivo-sound-play"
                        onClick={() => previewLibrarySound(sound)}
                        aria-label={previewingSoundId === sound.id ? "Pause sound preview" : "Preview sound"}
                      >
                        {previewingSoundId === sound.id ? "❚❚" : "▶"}
                      </button>
                      <button type="button" className="vezlivo-sound-select" onClick={() => selectLibrarySound(sound)}>
                        <strong>{sound.title || sound.name || "Vezlivo sound"}</strong>
                        <span>{sound.artist || "Vezlivo"}</span>
                      </button>
                    </div>
                  )) : (
                    <div className="vezlivo-empty-panel">
                      No {soundCategory.toLowerCase()} sounds available yet. Add sounds to Vezlivo's Firebase sound library to make them appear here.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="vezlivo-panel-action"
                  onClick={() => musicInputRef.current?.click()}
                >
                  <span>＋</span>
                  <div>
                    <b>Choose from phone</b>
                    <small>Select an audio file from your device</small>
                  </div>
                </button>

                {musicUrl && (
                  <div className="vezlivo-selected-file">
                    <div>
                      <strong>♪ {musicName || "Added sound"}</strong>
                      <span>{selectedSound || "Selected sound"}</span>
                    </div>
                    <button type="button" onClick={removeMusic}>Remove</button>
                  </div>
                )}

                {musicUrl && (
                  <label className="vezlivo-range-row">
                    <span>Sound volume</span>
                    <input type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} />
                    <b>{Math.round(musicVolume * 100)}%</b>
                  </label>
                )}

                <input ref={musicInputRef} type="file" accept="audio/*" hidden onChange={chooseMusic} />
              </div>
            )}

            {showVisualPanel && (
              <div className="vezlivo-editor-panel">
                <div className="vezlivo-panel-title">
                  <div>
                    <strong>
                      Visual & Background
                    </strong>
                    <span>
                      Change the look behind your media
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setShowVisualPanel(
                        false
                      )
                    }
                  >
                    ×
                  </button>
                </div>

                <div className="vezlivo-visual-grid">
                  {VISUAL_BACKGROUNDS.map(
                    (visual) => (
                      <button
                        key={
                          visual.value
                        }
                        type="button"
                        className={
                          activeBackground ===
                          visual.value
                            ? "vezlivo-visual-option active"
                            : "vezlivo-visual-option"
                        }
                        onClick={() => {
                          setSelectedBackground(
                            visual.value
                          );
                          if (
                            visual.value !==
                            "phone"
                          ) {
                            setBackgroundFile(
                              null
                            );
                            if (backgroundUrl) {
                              URL.revokeObjectURL(
                                backgroundUrl
                              );
                            }
                            setBackgroundUrl(
                              ""
                            );
                          }
                        }}
                      >
                        <span
                          style={{
                            background:
                              visual.css,
                          }}
                        />
                        <b>
                          {visual.name}
                        </b>
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  className="vezlivo-panel-action"
                  onClick={() =>
                    backgroundInputRef.current?.click()
                  }
                >
                  <span>▣</span>
                  <div>
                    <b>
                      Choose visual from phone
                    </b>
                    <small>
                      Use an image from your gallery as the background
                    </small>
                  </div>
                </button>

                {backgroundUrl && (
                  <div className="vezlivo-selected-file">
                    <div>
                      <strong>
                        Phone visual
                      </strong>
                      <span>
                        Using your selected image
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={
                        removeBackground
                      }
                    >
                      Remove
                    </button>
                  </div>
                )}

                <input
                  ref={
                    backgroundInputRef
                  }
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={
                    chooseBackground
                  }
                />
              </div>
            )}

            {showTextEditor && (
              <div className="vezlivo-editor-panel">
                <div className="vezlivo-panel-title">
                  <div>
                    <strong>
                      Add text
                    </strong>
                    <span>
                      Place text over your video
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setShowTextEditor(
                        false
                      )
                    }
                  >
                    ×
                  </button>
                </div>

                <div className="vezlivo-text-row">
                  <input
                    value={
                      overlayText
                    }
                    onChange={(
                      event
                    ) =>
                      setOverlayText(
                        event.target.value
                      )
                    }
                    placeholder="Write something..."
                    maxLength={120}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowTextEditor(
                        false
                      )
                    }
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {showMoreTools && (
              <div className="vezlivo-editor-panel">
                <div className="vezlivo-panel-title">
                  <div>
                    <strong>
                      More editing tools
                    </strong>
                    <span>
                      Quick controls for your media
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setShowMoreTools(
                        false
                      )
                    }
                  >
                    ×
                  </button>
                </div>

                <div className="vezlivo-more-tools">
                  <button
                    type="button"
                    onClick={() => {
                      setMuted(
                        (value) =>
                          !value
                      );
                    }}
                  >
                    <b>
                      {muted
                        ? "🔇"
                        : "🔊"}
                    </b>
                    <span>
                      Mute preview
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFilter(
                        "none"
                      );
                    }}
                  >
                    <b>
                      ↺
                    </b>
                    <span>
                      Reset filter
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={
                      removeMedia
                    }
                  >
                    <b>
                      🗑
                    </b>
                    <span>
                      Change media
                    </span>
                  </button>
                </div>
              </div>
            )}

          </aside>
        </div>

        <div className="vezlivo-editor-hint">
          <span>Tip</span>
          Edit your video first, then tap <b>Next</b> to add the caption and publish.
        </div>
      </main>
    );
  }


  /* =====================================================
     FINAL PUBLISH SCREEN
  ===================================================== */

  const isReelPublish = contentType === "reel";
  const isNarrowScreen = typeof window !== "undefined" && window.innerWidth < 820;
  const publishTitle = isReelPublish ? "New Reel" : contentType === "story" ? "New Story" : "New Post";
  const publishButtonText = uploading
    ? `Publishing ${uploadProgress}%`
    : contentType === "story"
    ? "Share Story"
    : isReelPublish
    ? "Publish Reel"
    : "Post";

  return (
    <main style={styles.professionalPostPage}>
      <header style={styles.professionalPostHeader}>
        <button type="button" style={styles.professionalBackButton} onClick={goBack} disabled={uploading} aria-label="Go back">←</button>
        <div style={styles.professionalHeaderTitle}>
          <strong>{publishTitle}</strong>
          <span>{isReelPublish ? "Finish your Reel" : "Finish your post"}</span>
        </div>
        <div style={styles.professionalHeaderActions}>
          <button type="button" style={styles.draftHeaderButton} onClick={saveDraft} disabled={savingDraft || uploading || !mediaFile}>{savingDraft ? "Saving…" : "Draft"}</button>
          <button type="button" style={styles.professionalPublishButton} disabled={uploading || !mediaFile} onClick={publishPost}>{publishButtonText}</button>
        </div>
      </header>

      <section style={styles.professionalCompactContent}>
        <section style={styles.professionalMediaCard}>
          <div style={styles.professionalMediaPreview}>
            {mediaType === "video" ? (
              <video
                ref={previewVideoRef}
                src={previewUrl}
                controls
                playsInline
                autoPlay
                loop
                muted={muted || !originalAudio}
                style={{ ...styles.professionalMedia, filter: selectedFilter }}
              />
            ) : (
              <img src={previewUrl} alt="Selected Vezlivo media" style={{ ...styles.professionalMedia, filter: selectedFilter }} />
            )}
            {isReelPublish && <span style={styles.reelPreviewBadge}>REEL</span>}
          </div>

          {isReelPublish && (
            <div style={styles.mediaQuickActions}>
              <button type="button" style={styles.mediaQuickButton} onClick={() => setStep("edit")}>✦ Edit video</button>
              <button type="button" style={styles.mediaQuickButton} onClick={() => setShowCoverEditor((value) => !value)}>▣ Cover</button>
              <button type="button" style={styles.mediaQuickButton} onClick={() => setStep("reelChooser")}>↻ Replace</button>
            </div>
          )}
        </section>

        {isReelPublish && showCoverEditor && (
          <section style={styles.professionalSectionCard}>
            <div style={styles.sectionHeaderRow}>
              <div>
                <h2 style={styles.sectionHeading}>Choose your Reel cover</h2>
                <p style={styles.sectionSubheading}>Move through the video and stop on the exact frame you want. Vezlivo will not choose it for you.</p>
              </div>
              <button type="button" style={styles.smallDoneButton} onClick={() => setShowCoverEditor(false)}>Done</button>
            </div>

            <div style={{ ...styles.coverEditorGrid, ...(isNarrowScreen ? styles.coverEditorGridNarrow : {}) }}>
              <div style={styles.coverPreviewBox}>
                {coverPreviewUrl ? (
                  <img src={coverPreviewUrl} alt="Reel cover" style={{ ...styles.coverPreviewImage, ...coverStyle }} />
                ) : (
                  <video src={previewUrl} muted playsInline style={{ ...styles.coverPreviewImage, objectFit: "cover", objectPosition: `${coverPositionX}% ${coverPositionY}%`, transform: `scale(${coverZoom})` }} />
                )}
                <span style={styles.coverSafeLabel}>9:16 cover</span>
              </div>

              <div style={styles.coverControls}>
                {mediaType === "video" && (
                  <>
                    <video
                      src={previewUrl}
                      ref={(node) => { coverVideoRef.current = node; }}
                      controls
                      playsInline
                      muted
                      style={styles.coverFrameVideo}
                      onTimeUpdate={(event) => setCoverFrameTime(Number(event.currentTarget.currentTime || 0))}
                    />
                    <input
                      type="range"
                      min="0"
                      max={Math.max(Number(coverVideoRef.current?.duration || 1), 1)}
                      step="0.05"
                      value={Math.min(coverFrameTime, Math.max(Number(coverVideoRef.current?.duration || 1), 1))}
                      onChange={(event) => {
                        const nextTime = Number(event.target.value);
                        setCoverFrameTime(nextTime);
                        if (coverVideoRef.current) {
                          try { coverVideoRef.current.currentTime = nextTime; } catch {}
                        }
                      }}
                      style={styles.coverScrubber}
                    />
                    <div style={styles.coverFrameActions}>
                      <span style={styles.coverFrameTime}>Frame: {coverFrameTime.toFixed(1)}s</span>
                      <button type="button" style={styles.inlineActionButton} onClick={setCoverFromCurrentVideo}>Use this frame</button>
                    </div>
                  </>
                )}

                <div style={styles.coverChoiceRow}>
                  <button type="button" style={coverSource === "frame" ? styles.coverChoiceActive : styles.coverChoice} onClick={() => { setCoverSource("frame"); setCoverFile(null); if (coverPreviewUrl) { URL.revokeObjectURL(coverPreviewUrl); setCoverPreviewUrl(""); } }}>Video frame</button>
                  <button type="button" style={coverSource === "photo" ? styles.coverChoiceActive : styles.coverChoice} onClick={() => coverInputRef.current?.click()}>Photo from phone</button>
                </div>

                <label style={styles.coverRangeLabel}><span>Zoom</span><input type="range" min="1" max="2.5" step="0.05" value={coverZoom} onChange={(event) => setCoverZoom(Number(event.target.value))} /><b>{coverZoom.toFixed(2)}×</b></label>
                <label style={styles.coverRangeLabel}><span>Move left / right</span><input type="range" min="0" max="100" value={coverPositionX} onChange={(event) => setCoverPositionX(Number(event.target.value))} /><b>{Math.round(coverPositionX)}%</b></label>
                <label style={styles.coverRangeLabel}><span>Move up / down</span><input type="range" min="0" max="100" value={coverPositionY} onChange={(event) => setCoverPositionY(Number(event.target.value))} /><b>{Math.round(coverPositionY)}%</b></label>
                <div style={styles.coverFitRow}>
                  <span style={styles.coverFitLabel}>Crop</span>
                  <button type="button" style={coverFit === "cover" ? styles.coverChoiceActive : styles.coverChoice} onClick={() => setCoverFit("cover")}>Fill</button>
                  <button type="button" style={coverFit === "contain" ? styles.coverChoiceActive : styles.coverChoice} onClick={() => setCoverFit("contain")}>Fit</button>
                  <button type="button" style={styles.secondaryActionButton} onClick={() => { setCoverZoom(1); setCoverPositionX(50); setCoverPositionY(50); }}>Reset</button>
                </div>
              </div>
            </div>
            <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={chooseCoverPhoto} />
          </section>
        )}

        <section style={styles.professionalSectionCard}>
          <div style={styles.sectionHeaderRow}>
            <div><h2 style={styles.sectionHeading}>Caption</h2><p style={styles.sectionSubheading}>Tell people what your content is about.</p></div>
            <span style={styles.counter}>{caption.length}/{MAX_CAPTION}</span>
          </div>
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder={isReelPublish ? "Write a caption for your Reel…" : "Write a caption…"} maxLength={MAX_CAPTION} disabled={uploading} style={styles.professionalCaption} />
        </section>

        {contentType !== "story" && (
          <section style={styles.professionalSectionCard}>
            <div style={styles.sectionHeaderRow}>
              <div><h2 style={styles.sectionHeading}>Hashtags</h2><p style={styles.sectionSubheading}>Add relevant hashtags or use the suggestions.</p></div>
              <span style={styles.counter}>{selectedHashtags.length}/30</span>
            </div>
            <div style={styles.professionalInputRow}>
              <span style={styles.inputPrefix}>#</span>
              <input value={hashtagInput} onChange={(event) => setHashtagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addHashtag(hashtagInput); } }} placeholder="Add a hashtag" disabled={uploading || selectedHashtags.length >= 30} style={styles.professionalInput} />
              <button type="button" style={styles.inlineActionButton} onClick={() => addHashtag(hashtagInput)} disabled={uploading}>Add</button>
            </div>
            <div style={styles.professionalChipList}>{selectedHashtags.map((tag) => <button key={tag} type="button" style={styles.professionalChip} onClick={() => removeHashtag(tag)}>{tag} ×</button>)}</div>
            <div style={styles.suggestionLabel}>{hashtagInput ? "Suggestions" : "Popular on Vezlivo"}</div>
            <div style={styles.professionalChipList}>{hashtagSuggestions.map((tag) => <button key={tag} type="button" style={styles.suggestionChip} onClick={() => addHashtag(tag)}>{tag}</button>)}</div>
          </section>
        )}

        {contentType !== "story" && (
          <section style={styles.professionalSectionCard}>
            <button type="button" style={styles.advancedHeaderButton} onClick={() => setShowAdvancedPublish((value) => !value)}>
              <span><strong>More options</strong><small>Tags, location, audience, sharing, comments, branded content and other controls</small></span>
              <b>{showAdvancedPublish ? "⌃" : "⌄"}</b>
            </button>

            {showAdvancedPublish && (
              <div style={styles.advancedOptions}>
                <div style={styles.moreOptionBlock}>
                  <div style={styles.moreOptionTitle}><strong>Tag people</strong><span>{taggedFriends.length}/15</span></div>
                  <div style={styles.professionalInputRow}>
                    <span style={styles.inputPrefix}>@</span>
                    <input value={tagFriendInput} onChange={(event) => setTagFriendInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTaggedFriend(); } }} placeholder="Username" disabled={uploading || taggedFriends.length >= 15} style={styles.professionalInput} />
                    <button type="button" style={styles.inlineActionButton} onClick={addTaggedFriend} disabled={uploading || taggedFriends.length >= 15}>Add</button>
                  </div>
                  <div style={styles.professionalChipList}>{taggedFriends.map((tag) => <button key={tag} type="button" style={styles.professionalChip} onClick={() => removeTaggedFriend(tag)}>{tag} ×</button>)}</div>
                </div>

                <div style={styles.moreOptionBlock}>
                  <strong>Location</strong>
                  <div style={{ ...styles.professionalInputRow, marginTop: "8px" }}><span style={styles.inputPrefix}>⌖</span><input value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="Add location" disabled={uploading} style={styles.professionalInput} /></div>
                </div>

                <div style={styles.moreOptionBlock}>
                  <strong>Audience</strong>
                  <div style={{ ...styles.audienceGrid, ...(isNarrowScreen ? styles.audienceGridNarrow : {}) }}>
                    {[['public','Everyone','Anyone on Vezlivo'],['followers','Followers','People who follow you'],['private','Only me','Only you can see it']].map(([value,title,sub]) => <button key={value} type="button" onClick={() => setAudience(value)} disabled={uploading} style={audience === value ? styles.audienceOptionActive : styles.audienceOption}><span style={styles.audienceRadio}>{audience === value ? "✓" : ""}</span><span><strong>{title}</strong><small>{sub}</small></span></button>)}
                  </div>
                </div>

                <div style={styles.moreOptionBlock}>
                  <strong>Sharing & interaction</strong>
                  {isReelPublish && <label style={styles.toggleRow}><span><strong>Share to Story</strong><small>Add this Reel to your Story for 24 hours.</small></span><button type="button" onClick={() => setShareToStory((value) => !value)} disabled={uploading} style={shareToStory ? styles.toggleActive : styles.toggleInactive}><i /></button></label>}
                  <label style={styles.toggleRow}><span><strong>Allow sharing</strong><small>Let people share your content.</small></span><button type="button" onClick={() => setAllowSharing((value) => !value)} disabled={uploading} style={allowSharing ? styles.toggleActive : styles.toggleInactive}><i /></button></label>
                  <label style={styles.toggleRow}><span><strong>Allow downloads</strong><small>Let people save your video.</small></span><button type="button" onClick={() => setAllowDownloads((value) => !value)} disabled={uploading} style={allowDownloads ? styles.toggleActive : styles.toggleInactive}><i /></button></label>
                  <label style={styles.toggleRow}><span><strong>Comments</strong><small>Allow people to comment.</small></span><button type="button" onClick={() => setCommentsEnabled((value) => !value)} disabled={uploading} style={commentsEnabled ? styles.toggleActive : styles.toggleInactive}><i /></button></label>
                </div>

                <div style={styles.moreOptionBlock}>
                  <label style={styles.toggleRow}><span><strong>Branded content</strong><small>Use this when the content promotes a brand, product or service.</small></span><button type="button" onClick={() => setBrandedContent((value) => !value)} disabled={uploading} style={brandedContent ? styles.toggleActive : styles.toggleInactive}><i /></button></label>
                  {brandedContent && <div style={styles.brandField}><label style={styles.brandLabel}>Brand or partner name</label><input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Optional" disabled={uploading} style={styles.professionalInputFull} /></div>}
                  <div style={styles.infoNotice}><strong>Promote is separate</strong><span>Publishing is free. Promote can be used later if you want paid reach.</span></div>
                </div>
              </div>
            )}
          </section>
        )}

        {uploading && <section style={styles.uploadStatusCard}><div style={styles.uploadStatusTop}><strong>Publishing your {isReelPublish ? "Reel" : contentType === "story" ? "Story" : "post"}…</strong><b>{uploadProgress}%</b></div><div style={styles.uploadTrack}><div style={{ ...styles.uploadTrackFill, width: `${uploadProgress}%` }} /></div></section>}
        {message && <div style={styles.successMessage}>{message}</div>}
        {error && <div style={styles.errorMessage}>{error}</div>}

        <div style={styles.bottomPublishActions}>
          <button type="button" style={styles.bottomDraftButton} onClick={saveDraft} disabled={savingDraft || uploading || !mediaFile}>{savingDraft ? "Saving…" : "Save draft"}</button>
          <button type="button" style={styles.bottomPublishButton} onClick={publishPost} disabled={uploading || !mediaFile}>{publishButtonText}</button>
        </div>
      </section>
    </main>
  );

}

/* =========================================================
   STYLES
========================================================= */

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f7f7f8",
    color: "#111111",
    boxSizing: "border-box",
    paddingBottom: "30px",
  },

  createPage: {
    minHeight: "100vh",
    background: "#f7f7f8",
    color: "#111111",
    paddingBottom: "40px",
  },

  createHeader: {
    height: "64px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    background: "#ffffff",
    borderBottom: "1px solid #e8e8e8",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },

  headerTitle: {
    margin: 0,
    fontSize: "21px",
    fontWeight: 800,
  },

  headerSpacer: {
    width: "42px",
  },

  backButton: {
    border: "none",
    background: "transparent",
    fontSize: "29px",
    cursor: "pointer",
    width: "42px",
    height: "42px",
  },

  createHero: {
    textAlign: "center",
    padding: "34px 20px 25px",
  },

  heroLogo: {
    width: "70px",
    height: "70px",
    objectFit: "contain",
    borderRadius: "18px",
    marginBottom: "15px",
  },

  heroTitle: {
    margin: "0 0 7px",
    fontSize: "25px",
    fontWeight: 850,
  },

  heroSubtitle: {
    margin: 0,
    color: "#737373",
    fontSize: "14px",
  },

  createChoiceList: {
    maxWidth: "600px",
    margin: "0 auto",
    padding: "0 16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  createChoice: {
    width: "100%",
    minHeight: "92px",
    border: "1px solid #e2e2e2",
    borderRadius: "20px",
    background: "#ffffff",
    display: "grid",
    gridTemplateColumns: "62px 1fr 25px",
    alignItems: "center",
    gap: "13px",
    padding: "14px 17px",
    textAlign: "left",
    cursor: "pointer",
    boxShadow: "0 5px 18px rgba(0,0,0,.045)",
  },

  choiceIcon: {
    width: "56px",
    height: "56px",
    borderRadius: "17px",
    background: "#111111",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontSize: "25px",
    fontWeight: 800,
  },

  choiceText: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },

  chooserHero: {
    textAlign: "center",
    padding: "34px 20px 25px",
  },

  chooserIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "20px",
    background: "#111111",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    margin: "0 auto 15px",
    fontSize: "27px",
  },

  mediaChooserGrid: {
    maxWidth: "600px",
    margin: "0 auto",
    padding: "0 16px",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0,1fr))",
    gap: "12px",
  },

  mediaChooserButton: {
    minHeight: "150px",
    border: "1px solid #e2e2e2",
    borderRadius: "20px",
    background: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    cursor: "pointer",
    boxShadow: "0 5px 18px rgba(0,0,0,.04)",
  },

  chooserIconText: {
    fontSize: "12px",
  },

  title: {
    fontSize: "28px",
    margin: "10px 0",
  },

  muted: {
    color: "#737373",
    lineHeight: 1.5,
    margin: 0,
  },

  loginCard: {
    width: "calc(100% - 32px)",
    maxWidth: "430px",
    margin: "80px auto",
    padding: "35px 25px",
    borderRadius: "24px",
    background: "#ffffff",
    textAlign: "center",
    boxSizing: "border-box",
    boxShadow: "0 10px 35px rgba(0,0,0,.08)",
  },

  loginLogo: {
    width: "76px",
    height: "76px",
    objectFit: "contain",
  },

  primaryButton: {
    marginTop: "22px",
    border: "none",
    borderRadius: "13px",
    padding: "13px 22px",
    background: "#111111",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },

  errorBox: {
    margin: "18px 16px",
    padding: "13px 15px",
    borderRadius: "13px",
    background: "#fff0f0",
    color: "#b00020",
    fontSize: "14px",
    lineHeight: 1.4,
  },

  cameraPage: {
    position: "fixed",
    inset: 0,
    background: "#000000",
    color: "#ffffff",
    overflow: "hidden",
    zIndex: 100,
  },

  cameraVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  cameraGradient: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "linear-gradient(rgba(0,0,0,.42), transparent 28%, transparent 62%, rgba(0,0,0,.8))",
  },

  cameraTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "82px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 18px",
  },

  cameraModeTitle: {
    fontSize: "17px",
    fontWeight: 800,
  },

  cameraIconButton: {
    width: "44px",
    height: "44px",
    border: "none",
    borderRadius: "50%",
    background: "rgba(0,0,0,.4)",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontSize: "27px",
    cursor: "pointer",
  },

  cameraTopControls: {
    position: "absolute",
    top: "95px",
    right: "15px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  cameraSmallControl: {
    border: "none",
    borderRadius: "13px",
    background: "rgba(0,0,0,.5)",
    color: "#ffffff",
    minWidth: "65px",
    padding: "9px 10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    fontWeight: 800,
    cursor: "pointer",
  },

  cameraBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: "22px 15px 25px",
    textAlign: "center",
  },

  cameraHint: {
    fontSize: "13px",
    marginBottom: "12px",
  },

  recordButton: {
    width: "82px",
    height: "82px",
    borderRadius: "50%",
    border: "5px solid #ffffff",
    background: "transparent",
    display: "grid",
    placeItems: "center",
    margin: "0 auto 16px",
    cursor: "pointer",
  },

  recordingButton: {
    borderRadius: "50%",
  },

  recordingCircle: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: "#ffffff",
    display: "block",
  },

  recordingSquare: {
    width: "30px",
    height: "30px",
    borderRadius: "6px",
    background: "#ffffff",
    display: "block",
  },

  cameraBottomActions: {
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    maxWidth: "430px",
    margin: "0 auto",
  },

  cameraBottomAction: {
    border: "none",
    background: "transparent",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    cursor: "pointer",
  },

  cameraError: {
    position: "absolute",
    left: "15px",
    right: "15px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "#ffffff",
    color: "#b00020",
    borderRadius: "15px",
    padding: "15px",
    textAlign: "center",
  },

  soundPanel: {
    position: "absolute",
    top: "150px",
    left: "15px",
    right: "15px",
    maxWidth: "330px",
    margin: "0 auto",
    padding: "15px",
    background: "rgba(20,20,20,.94)",
    borderRadius: "17px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    zIndex: 5,
  },

  lengthPanel: {
    position: "absolute",
    top: "150px",
    right: "15px",
    width: "190px",
    padding: "15px",
    background: "rgba(20,20,20,.94)",
    borderRadius: "17px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    zIndex: 5,
  },

  soundOption: {
    border: "1px solid #444444",
    background: "#242424",
    color: "#ffffff",
    padding: "10px",
    borderRadius: "10px",
    textAlign: "left",
    cursor: "pointer",
  },

  soundOptionActive: {
    border: "1px solid #ffffff",
    background: "#ffffff",
    color: "#111111",
    padding: "10px",
    borderRadius: "10px",
    textAlign: "left",
    cursor: "pointer",
    fontWeight: 800,
  },

  lengthButton: {
    border: "1px solid #444444",
    background: "#242424",
    color: "#ffffff",
    padding: "10px",
    borderRadius: "10px",
    cursor: "pointer",
  },

  lengthActive: {
    border: "1px solid #ffffff",
    background: "#ffffff",
    color: "#111111",
    padding: "10px",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: 800,
  },

  editPage: {
    minHeight: "100vh",
    background: "#111111",
    color: "#ffffff",
  },

  editHeader: {
    height: "62px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 15px",
    boxSizing: "border-box",
  },

  lightButton: {
    border: "none",
    background: "rgba(255,255,255,.12)",
    color: "#ffffff",
    borderRadius: "12px",
    width: "42px",
    height: "42px",
    fontSize: "22px",
    cursor: "pointer",
  },

  nextButton: {
    border: "none",
    background: "#ffffff",
    color: "#111111",
    borderRadius: "11px",
    padding: "10px 17px",
    fontWeight: 800,
    cursor: "pointer",
  },

  editorPreviewArea: {
    display: "flex",
    justifyContent: "center",
    padding: "0 16px 15px",
  },

  mediaFrame: {
    width: "min(100%, 430px)",
    height: "min(64vh, 620px)",
    background: "#000000",
    borderRadius: "20px",
    overflow: "hidden",
    position: "relative",
    display: "grid",
    placeItems: "center",
  },

  previewMedia: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },

  previewBadge: {
    position: "absolute",
    top: "12px",
    left: "12px",
    padding: "6px 9px",
    borderRadius: "9px",
    background: "rgba(0,0,0,.55)",
    fontSize: "10px",
    fontWeight: 800,
  },

  textOverlay: {
    position: "absolute",
    left: "20px",
    right: "20px",
    top: "50%",
    transform: "translateY(-50%)",
    textAlign: "center",
    fontSize: "30px",
    fontWeight: 900,
    textShadow: "0 2px 8px rgba(0,0,0,.8)",
    pointerEvents: "none",
    wordBreak: "break-word",
  },

  editTools: {
    background: "#181818",
    borderTop: "1px solid #292929",
    padding: "15px 16px 28px",
  },

  toolRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "8px",
  },

  toolButton: {
    border: "none",
    background: "#252525",
    color: "#ffffff",
    borderRadius: "13px",
    padding: "10px 5px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "5px",
    cursor: "pointer",
    fontSize: "12px",
  },

  textEditor: {
    display: "flex",
    gap: "8px",
    marginTop: "13px",
  },

  textInput: {
    flex: 1,
    border: "1px solid #444444",
    borderRadius: "12px",
    background: "#222222",
    color: "#ffffff",
    padding: "12px",
    outline: "none",
  },

  smallButton: {
    border: "none",
    borderRadius: "12px",
    padding: "0 15px",
    background: "#ffffff",
    color: "#111111",
    fontWeight: 700,
  },

  editSoundPanel: {
    marginTop: "12px",
    padding: "12px",
    background: "#222222",
    borderRadius: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "7px",
  },

  sectionTitle: {
    fontSize: "15px",
    margin: "18px 0 10px",
  },

  filterScroller: {
    display: "flex",
    gap: "10px",
    overflowX: "auto",
    paddingBottom: "5px",
  },

  filterButton: {
    minWidth: "75px",
    border: "2px solid transparent",
    borderRadius: "12px",
    background: "transparent",
    color: "#ffffff",
    padding: "3px",
    cursor: "pointer",
  },

  filterActive: {
    border: "2px solid #ffffff",
  },

  filterPreview: {
    width: "70px",
    height: "70px",
    borderRadius: "10px",
    overflow: "hidden",
    background: "#000000",
  },

  editInfo: {
    marginTop: "16px",
    display: "flex",
    justifyContent: "space-between",
    color: "#aaa",
    fontSize: "13px",
  },

  changeButton: {
    border: "none",
    background: "transparent",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },

  professionalPostPage: {
    minHeight: "100vh",
    background: "#f5f6f8",
    color: "#101114",
    paddingBottom: "50px",
  },

  professionalPostHeader: {
    position: "sticky",
    top: 0,
    zIndex: 30,
    minHeight: "68px",
    background: "rgba(255,255,255,.96)",
    backdropFilter: "blur(14px)",
    borderBottom: "1px solid #e4e6ea",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px 18px",
    boxSizing: "border-box",
  },
  professionalBackButton: { width: "42px", height: "42px", border: "1px solid #e0e2e6", borderRadius: "12px", background: "#fff", fontSize: "24px", cursor: "pointer" },
  professionalHeaderTitle: { flex: 1, display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 },
  professionalHeaderTitleStrong: { fontSize: "17px", fontWeight: 850 },
  professionalHeaderActions: { display: "flex", alignItems: "center", gap: "8px" },
  draftHeaderButton: { border: "1px solid #dfe1e6", background: "#fff", color: "#16181c", borderRadius: "11px", padding: "10px 13px", fontWeight: 750, cursor: "pointer" },
  professionalPublishButton: { border: "none", background: "#111214", color: "#fff", borderRadius: "11px", padding: "10px 15px", fontWeight: 850, cursor: "pointer" },
  professionalContent: { maxWidth: "1180px", margin: "0 auto", padding: "22px 16px 50px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: "18px", alignItems: "start" },
  professionalContentNarrow: { gridTemplateColumns: "1fr", padding: "14px 10px 40px" },
  professionalCompactContent: { maxWidth: "820px", margin: "0 auto", padding: "16px 14px 42px", display: "flex", flexDirection: "column", gap: "14px" },
  coverEditorGridNarrow: { gridTemplateColumns: "1fr" },
  audienceGridNarrow: { gridTemplateColumns: "1fr" },

  professionalMainColumn: { minWidth: 0, display: "flex", flexDirection: "column", gap: "14px" },
  professionalMediaCard: { background: "#fff", border: "1px solid #e1e3e7", borderRadius: "18px", overflow: "hidden", boxShadow: "0 5px 22px rgba(15,18,25,.04)" },
  professionalMediaPreview: { position: "relative", width: "100%", maxHeight: "650px", minHeight: "360px", background: "#0c0d0f", display: "grid", placeItems: "center", overflow: "hidden" },
  professionalMedia: { width: "100%", height: "min(650px, 70vh)", objectFit: "contain", display: "block" },
  reelPreviewBadge: { position: "absolute", top: "14px", left: "14px", padding: "6px 9px", borderRadius: "8px", background: "rgba(0,0,0,.6)", color: "#fff", fontSize: "10px", fontWeight: 850, letterSpacing: ".08em" },
  mediaQuickActions: { display: "flex", gap: "8px", padding: "12px", borderTop: "1px solid #e6e7ea", overflowX: "auto" },
  mediaQuickButton: { border: "1px solid #e0e2e6", background: "#fff", borderRadius: "10px", padding: "10px 13px", fontWeight: 750, cursor: "pointer", whiteSpace: "nowrap" },
  professionalSectionCard: { background: "#fff", border: "1px solid #e1e3e7", borderRadius: "18px", padding: "18px", boxShadow: "0 5px 22px rgba(15,18,25,.035)" },
  sectionHeaderRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "12px" },
  sectionHeading: { margin: 0, fontSize: "16px", fontWeight: 850 },
  sectionSubheading: { margin: "4px 0 0", color: "#737780", fontSize: "12px", lineHeight: 1.45 },
  counter: { color: "#858991", fontSize: "12px", whiteSpace: "nowrap" },
  smallDoneButton: { border: "none", background: "#111214", color: "#fff", borderRadius: "9px", padding: "8px 11px", fontWeight: 750, cursor: "pointer" },
  professionalCaption: { width: "100%", minHeight: "150px", resize: "vertical", border: "1px solid #dfe1e6", borderRadius: "13px", background: "#fafbfc", padding: "13px", boxSizing: "border-box", outline: "none", fontSize: "15px", lineHeight: 1.55 },
  professionalInputRow: { display: "flex", alignItems: "center", gap: "8px", border: "1px solid #dfe1e6", background: "#fafbfc", borderRadius: "12px", padding: "0 10px", minHeight: "48px" },
  inputPrefix: { color: "#7a7e86", fontWeight: 850 },
  professionalInput: { flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontSize: "14px" },
  professionalInputFull: { width: "100%", minHeight: "46px", border: "1px solid #dfe1e6", borderRadius: "11px", padding: "0 12px", boxSizing: "border-box", outline: "none" },
  inlineActionButton: { border: "none", background: "#111214", color: "#fff", borderRadius: "9px", padding: "8px 12px", fontWeight: 750, cursor: "pointer" },
  professionalChipList: { display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "11px" },
  professionalChip: { border: "none", background: "#111214", color: "#fff", borderRadius: "20px", padding: "7px 10px", fontSize: "12px", fontWeight: 750, cursor: "pointer" },
  suggestionLabel: { marginTop: "15px", fontSize: "12px", fontWeight: 800, color: "#6f737b" },
  suggestionChip: { border: "1px solid #e0e2e6", background: "#fff", color: "#25272c", borderRadius: "20px", padding: "7px 10px", fontSize: "12px", fontWeight: 700, cursor: "pointer" },
  audienceGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "9px" },
  audienceOption: { textAlign: "left", border: "1px solid #e1e3e7", background: "#fff", borderRadius: "12px", padding: "12px", display: "flex", gap: "9px", alignItems: "flex-start", cursor: "pointer" },
  audienceOptionActive: { textAlign: "left", border: "1px solid #111214", background: "#f6f6f7", borderRadius: "12px", padding: "12px", display: "flex", gap: "9px", alignItems: "flex-start", cursor: "pointer" },
  audienceRadio: { width: "22px", height: "22px", borderRadius: "50%", border: "1px solid #c8cad0", display: "grid", placeItems: "center", flexShrink: 0, fontSize: "12px", fontWeight: 850 },
  toggleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "15px", padding: "13px 0", borderTop: "1px solid #ececef" },
  toggleActive: { width: "48px", height: "28px", border: "none", borderRadius: "20px", background: "#111214", padding: "3px", display: "flex", justifyContent: "flex-end", flexShrink: 0, cursor: "pointer" },
  toggleInactive: { width: "48px", height: "28px", border: "none", borderRadius: "20px", background: "#d9dbe0", padding: "3px", display: "flex", justifyContent: "flex-start", flexShrink: 0, cursor: "pointer" },
  advancedHeaderButton: { width: "100%", border: "none", background: "transparent", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0, textAlign: "left", cursor: "pointer" },
  advancedOptions: { marginTop: "14px" },
  brandField: { margin: "4px 0 12px" },
  brandLabel: { display: "block", fontSize: "12px", fontWeight: 750, marginBottom: "7px" },
  infoNotice: { marginTop: "13px", padding: "12px", borderRadius: "12px", background: "#f5f6f8", display: "flex", flexDirection: "column", gap: "4px" },
  uploadStatusCard: { background: "#fff", border: "1px solid #e1e3e7", borderRadius: "15px", padding: "14px" },
  uploadStatusTop: { display: "flex", justifyContent: "space-between", fontSize: "13px" },
  uploadTrack: { height: "8px", background: "#e5e6e9", borderRadius: "10px", overflow: "hidden", marginTop: "10px" },
  uploadTrackFill: { height: "100%", background: "#111214", borderRadius: "10px" },
  successMessage: { padding: "12px", borderRadius: "12px", background: "#eef8f0", color: "#17652a", fontSize: "13px" },
  errorMessage: { padding: "12px", borderRadius: "12px", background: "#fff0f0", color: "#b00020", fontSize: "13px" },
  bottomPublishActions: { display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "9px" },
  bottomDraftButton: { border: "1px solid #dfe1e6", background: "#fff", color: "#15171a", borderRadius: "12px", padding: "14px", fontWeight: 800, cursor: "pointer" },
  bottomPublishButton: { border: "none", background: "#111214", color: "#fff", borderRadius: "12px", padding: "14px", fontWeight: 850, cursor: "pointer" },
  professionalSideCard: { position: "sticky", top: "90px", background: "#fff", border: "1px solid #e1e3e7", borderRadius: "18px", padding: "16px", boxShadow: "0 5px 22px rgba(15,18,25,.035)" },
  sideCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "12px", borderBottom: "1px solid #ececef" },
  checkItem: { display: "flex", gap: "9px", padding: "12px 0", borderBottom: "1px solid #f0f1f3" },
  sideTip: { marginTop: "13px", padding: "12px", borderRadius: "12px", background: "#f6f7f8", display: "flex", flexDirection: "column", gap: "5px" },
  coverEditorGrid: { display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: "18px", alignItems: "start" },
  coverPreviewBox: { position: "relative", width: "100%", aspectRatio: "9 / 16", background: "#0d0e10", borderRadius: "14px", overflow: "hidden" },
  coverPreviewImage: { width: "100%", height: "100%", display: "block", objectFit: "cover", objectPosition: "50% 50%" },
  coverSafeLabel: { position: "absolute", left: "9px", bottom: "9px", background: "rgba(0,0,0,.65)", color: "#fff", padding: "5px 7px", borderRadius: "7px", fontSize: "10px", fontWeight: 750 },
  coverControls: { display: "flex", flexDirection: "column", gap: "12px" },
  coverFrameVideo: { width: "100%", maxHeight: "300px", borderRadius: "12px", background: "#0c0d0f", objectFit: "contain" },
  coverScrubber: { width: "100%", cursor: "pointer" },
  coverFrameActions: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" },
  coverFrameTime: { fontSize: "12px", color: "#656970", fontWeight: 750 },
  moreOptionBlock: { paddingTop: "14px", marginTop: "14px", borderTop: "1px solid #ececef" },
  moreOptionTitle: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
  coverChoiceRow: { display: "flex", gap: "8px" },
  coverChoice: { border: "1px solid #dfe1e6", background: "#fff", borderRadius: "10px", padding: "9px 11px", fontWeight: 750, cursor: "pointer" },
  coverChoiceActive: { border: "1px solid #111214", background: "#111214", color: "#fff", borderRadius: "10px", padding: "9px 11px", fontWeight: 800, cursor: "pointer" },
  coverRangeLabel: { display: "grid", gridTemplateColumns: "1fr 1.5fr 45px", gap: "9px", alignItems: "center", fontSize: "12px", color: "#60646c" },
  coverFitRow: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "7px" },
  coverFitLabel: { fontSize: "12px", fontWeight: 800, marginRight: "3px" },
  secondaryActionButton: { border: "1px solid #dfe1e6", background: "#fff", borderRadius: "9px", padding: "8px 10px", fontWeight: 750, cursor: "pointer" },
  postPage: {
    minHeight: "100vh",
    background: "#f7f7f8",
    color: "#111111",
    paddingBottom: "35px",
  },

  postHeader: {
    height: "62px",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 15px",
    borderBottom: "1px solid #e7e7e7",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },

  publishButton: {
    border: "none",
    background: "#111111",
    color: "#ffffff",
    borderRadius: "11px",
    padding: "10px 15px",
    fontWeight: 800,
    cursor: "pointer",
  },

  postPreviewRow: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    background: "#ffffff",
    padding: "16px",
    borderBottom: "1px solid #e8e8e8",
  },

  smallMediaFrame: {
    width: "72px",
    height: "92px",
    borderRadius: "11px",
    overflow: "hidden",
    background: "#111111",
    flexShrink: 0,
  },

  smallMedia: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  previewDetails: {
    minWidth: 0,
  },

  mediaTypeBadge: {
    display: "inline-block",
    marginTop: "6px",
    padding: "4px 7px",
    borderRadius: "7px",
    background: "#f0f0f0",
    fontSize: "10px",
    fontWeight: 800,
  },

  smallMuted: {
    color: "#777777",
    fontSize: "13px",
    margin: "5px 0 0",
  },

  postForm: {
    maxWidth: "680px",
    margin: "0 auto",
    padding: "20px 16px",
  },

  label: {
    display: "block",
    fontWeight: 800,
    marginBottom: "8px",
  },

  captionInput: {
    width: "100%",
    minHeight: "130px",
    resize: "vertical",
    border: "1px solid #dedede",
    borderRadius: "15px",
    background: "#ffffff",
    padding: "14px",
    fontSize: "16px",
    lineHeight: 1.5,
    outline: "none",
    boxSizing: "border-box",
  },

  characterCount: {
    textAlign: "right",
    color: "#777777",
    fontSize: "12px",
    marginTop: "5px",
  },

  tagBox: {
    marginTop: "15px",
    padding: "13px",
    borderRadius: "14px",
    background: "#ffffff",
    border: "1px solid #e5e5e5",
  },

  tags: {
    display: "flex",
    flexWrap: "wrap",
    gap: "7px",
    marginTop: "8px",
  },

  tag: {
    padding: "6px 9px",
    borderRadius: "20px",
    background: "#f0f0f0",
    fontSize: "12px",
    fontWeight: 700,
  },

  detectedBox: {
    marginTop: "12px",
    padding: "11px",
    borderRadius: "12px",
    background: "#ffffff",
    border: "1px solid #e5e5e5",
    fontSize: "13px",
  },

  settingRow: {
    marginTop: "12px",
    padding: "16px",
    borderRadius: "15px",
    background: "#ffffff",
    border: "1px solid #e5e5e5",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "15px",
  },

  settingDescription: {
    display: "block",
    marginTop: "4px",
    color: "#777777",
    fontSize: "12px",
  },

  select: {
    border: "1px solid #d7d7d7",
    borderRadius: "10px",
    padding: "9px",
    background: "#ffffff",
  },

  switchOn: {
    width: "48px",
    height: "28px",
    border: "none",
    borderRadius: "20px",
    background: "#111111",
    padding: "3px",
    display: "flex",
    justifyContent: "flex-end",
    cursor: "pointer",
  },

  switchOff: {
    width: "48px",
    height: "28px",
    border: "none",
    borderRadius: "20px",
    background: "#d4d4d4",
    padding: "3px",
    display: "flex",
    justifyContent: "flex-start",
    cursor: "pointer",
  },

  storyNotice: {
    marginTop: "14px",
    padding: "14px",
    borderRadius: "14px",
    background: "#ffffff",
    border: "1px solid #e5e5e5",
    color: "#555555",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  uploadBox: {
    marginTop: "18px",
    padding: "15px",
    borderRadius: "15px",
    background: "#ffffff",
    border: "1px solid #e2e2e2",
    textAlign: "center",
  },

  progressTrack: {
    height: "8px",
    background: "#e5e5e5",
    borderRadius: "10px",
    overflow: "hidden",
    margin: "12px 0 7px",
  },

  progressFill: {
    height: "100%",
    background: "#111111",
    borderRadius: "10px",
    transition: "width .2s ease",
  },

  successBox: {
    marginTop: "15px",
    padding: "13px",
    borderRadius: "13px",
    background: "#edf9f0",
    color: "#17652a",
    fontSize: "14px",
  },

  publishLarge: {
    width: "100%",
    marginTop: "20px",
    border: "none",
    borderRadius: "15px",
    padding: "16px",
    background: "#111111",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 800,
    cursor: "pointer",
  },
};


export default Create;