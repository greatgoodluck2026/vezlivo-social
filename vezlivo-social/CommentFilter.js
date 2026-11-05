const blockedWords = [
  "badword",
  "badword2",
  "badword3",
  "idiot",
  "stupid",
  "fool",
  "dumb"
];

const normalizeText = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const checkComment = (text) => {
  if (!text || typeof text !== "string") {
    return {
      allowed: false,
      reason: "Comment cannot be empty."
    };
  }

  const cleanedText = normalizeText(text);

  if (cleanedText.length === 0) {
    return {
      allowed: false,
      reason: "Comment cannot be empty."
    };
  }

  if (cleanedText.length > 500) {
    return {
      allowed: false,
      reason: "Comment is too long."
    };
  }

  const words = cleanedText.split(" ");

  const foundBlockedWord = words.find((word) =>
    blockedWords.includes(word)
  );

  if (foundBlockedWord) {
    return {
      allowed: false,
      reason: "This comment contains language that is not allowed on Vezlivo."
    };
  }

  const repeatedCharacters = /(.)\1{7,}/i;

  if (repeatedCharacters.test(cleanedText)) {
    return {
      allowed: false,
      reason: "Please do not send repeated or spam characters."
    };
  }

  const repeatedWords = /\b(\w+)(?:\s+\1){4,}\b/i;

  if (repeatedWords.test(cleanedText)) {
    return {
      allowed: false,
      reason: "Please do not spam the same word repeatedly."
    };
  }

  return {
    allowed: true,
    reason: ""
  };
};

export const filterComment = (text) => {
  const result = checkComment(text);

  if (result.allowed) {
    return text.trim();
  }

  return "";
};