import type { LeadScore, Match, Message, StyleProfile } from "../types/domain";
import { canOfferInstagram } from "../scoring/rubric";

export interface ReplyPlan {
  actionType: "reply" | "ig_handoff" | "noop";
  text?: string;
  reason: string;
}

const OPENERS = [
  "וואלה נשמע אש\nמה הסיפור?",
  "רגע מה\nאיך הגעת לזה?",
  "חחחח אוקיי אני מקשיב",
  "איזה כיף לשמוע\nמה איתך בימים אלו?"
];

const REVIVE_LINES = [
  "חחחחח נעלמת לי",
  "שאלה חשובה\nאת יותר ספונטנית או מתוכננת מדי?",
  "וואלה באתי לשאול משהו נורמלי ואז ויתרתי",
  "היייי\nמה שלומךךך?"
];

const LOW_EFFORT_EXITS = [
  "חחחח סבבה\nאני אפסיק לחקור אותך דרך האפליקציה",
  "וואלה מכבד\nנראה לי האפליקציה מנצחת פה",
  "חחחח הכל טוב\nלא נכריח את זה"
];

export function generateReply(match: Match, messages: Message[], score: LeadScore, styleProfile: StyleProfile, igThreshold: number): ReplyPlan {
  const sorted = messages.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const inbound = sorted.filter((message) => message.sender === "match");
  const outbound = sorted.filter((message) => message.sender === "me");
  const latestInbound = inbound.at(-1);

  if (!latestInbound) {
    return {
      actionType: "reply",
      text: personalize(pick(OPENERS, match.id), styleProfile),
      reason: "No inbound message yet; use a short curiosity opener."
    };
  }

  if (match.igOfferedAt) {
    return {
      actionType: "noop",
      reason: "Instagram was already offered; avoid repeating the pitch."
    };
  }

  if (canOfferInstagram(score, igThreshold)) {
    return {
      actionType: "ig_handoff",
      text: buildInstagramHandoff(latestInbound.text, styleProfile),
      reason: "Lead passed IG threshold and all required handoff gates."
    };
  }

  const directReply = createDirectQuestionReply(latestInbound.text, styleProfile);
  if (directReply) {
    return {
      actionType: "reply",
      text: directReply,
      reason: "Latest inbound message asks a direct question; answer it before applying low-score fallback."
    };
  }

  if (score.finalScore < 40 && outbound.length >= 3) {
    return {
      actionType: "reply",
      text: personalize(pick(LOW_EFFORT_EXITS, latestInbound.id), styleProfile),
      reason: "Low-potential thread; send a graceful low-pressure close."
    };
  }

  if (hoursSince(latestInbound.timestamp) > 72) {
    return {
      actionType: "reply",
      text: personalize(pick(REVIVE_LINES, latestInbound.id), styleProfile),
      reason: "Thread is slow; use one lightweight revive prompt."
    };
  }

  return {
    actionType: "reply",
    text: createContextualReply(latestInbound.text, styleProfile),
    reason: "Continue building reciprocity before an IG handoff."
  };
}

function buildInstagramHandoff(latestInbound: string, styleProfile: StyleProfile): string {
  const handle = styleProfile.igHandle || "@yourhandle";
  if (/photo|pic|picture|voice|send/i.test(latestInbound)) {
    return `יותר נוח לשלוח את זה שם תאכלס\nאני ${handle}`;
  }
  if (/meet|drink|coffee|plan|date/i.test(latestInbound)) {
    return `האפליקציה הזאת קצת עקומה לתכנן דברים\nאם בא לך תוסיפי אותי באינסטגרם: ${handle}`;
  }
  return `נראה לי תקבלי עליי רושם יותר טוב שם\nאני ${handle} באינסטגרם`;
}

function createContextualReply(text: string, styleProfile: StyleProfile): string {
  const normalized = text.trim();
  if (/\?$/.test(normalized)) {
    return personalize("וואלה כן\nנראלי לפחות\nמה איתך?", styleProfile);
  }
  if (/קשה|קשוח|עצוב|באסה|לא הולך|bad day|hard day|rough/i.test(normalized)) {
    return personalize("וואי אני מצטער לשמוע\nרוצה לספר לי מה קרה?", styleProfile);
  }
  if (/free|פנוי|פנויה|יושבים|נפגש|meet|coffee|קפה|drink/i.test(normalized)) {
    return personalize("יאללה אני זורם\nמתי נוח לך?", styleProfile);
  }
  if (/travel|trip|city|beach|mountain/i.test(normalized)) {
    return personalize("חחחחח טוב זה אומר הרבה\nאת מתכננת הכל או זורמת?", styleProfile);
  }
  if (/food|restaurant|cook|dinner|drink/i.test(normalized)) {
    return personalize("וואלה נושא חשוב\nמה הדבר הכי טוב שאכלת לאחרונה?", styleProfile);
  }
  if (/music|show|concert|song/i.test(normalized)) {
    return personalize("וואלה\nמה את שמה בלופים עכשיו?", styleProfile);
  }
  return personalize(pick(["חחחחח מה", "רגע מה", "וואלה לא ציפיתי לזה", "חחחח תסבירי"], normalized), styleProfile);
}

function createDirectQuestionReply(text: string, styleProfile: StyleProfile): string | undefined {
  const normalized = text.trim();
  if (/what (are|r) (you|u) looking for|מה אתה מחפש|מה מחפש|מה אתה רוצה/i.test(normalized)) {
    return personalize(answerInLanguage(normalized, styleProfile.gabiProfile.answerBank.lookingFor), styleProfile);
  }

  if (/do you have (ig|instagram)|what'?s your (ig|instagram)|יש לך אינסט|מה האינסט/i.test(normalized)) {
    return personalize(`כןן\n${styleProfile.igHandle}`, styleProfile);
  }

  const profileAnswer = answerProfileQuestion(normalized, styleProfile);
  if (profileAnswer) return personalize(profileAnswer, styleProfile);

  return undefined;
}

function answerProfileQuestion(text: string, styleProfile: StyleProfile): string | undefined {
  const profile = styleProfile.gabiProfile;

  if (/tell me about yourself|about you|who are you|ספר על עצמך|מי אתה|קצת עליך/i.test(text)) {
    return answerInLanguage(text, profile.answerBank.aboutMe);
  }

  if (/where do you live|where are you from|location|איפה אתה גר|מאיפה אתה|איפה אתה/i.test(text)) {
    return answerInLanguage(text, profile.answerBank.location);
  }

  if (/what do you do for fun|hobbies|interests|free time|תחביב|מה עושה לכיף|מה אתה עושה לכיף|בזמן הפנוי/i.test(text)) {
    return answerInLanguage(text, profile.answerBank.hobbies);
  }

  if (/what do you do|what'?s your job|work|job|career|מה אתה עושה|במה אתה עובד|עבודה/i.test(text)) {
    return answerInLanguage(text, profile.answerBank.work);
  }

  if (/weekend|weekends|סופש|סוף שבוע/i.test(text)) {
    return answerInLanguage(text, profile.answerBank.weekend);
  }

  if (/age|old are you|בן כמה/i.test(text) && profile.age) {
    return hasHebrew(text) ? `${profile.age}` : `${profile.age}`;
  }

  if (/school|college|university|לומד|איפה למדת|תואר/i.test(text)) {
    if (profile.education && !profile.education.toLowerCase().includes("fill this in")) {
      return answerInLanguage(text, profile.education);
    }
    return answerInLanguage(text, profile.unknownAnswer);
  }

  return undefined;
}

function answerInLanguage(question: string, hebrewishAnswer: string): string {
  if (hasHebrew(question)) return hebrewishAnswer;
  const englishAnswers: Record<string, string> = {
    [hebrewishAnswer]: hebrewishAnswer
  };
  if (hebrewishAnswer.includes("וייב טוב")) return "Honestly nothing too dramatic\nGood vibe and see where it goes\nWhat about you?";
  if (hebrewishAnswer.includes("אני גבי")) {
    return "Short version?\nI'm Gabi, I build things on the internet, drink too much coffee, and like beach/food/conversations that don't feel like a job interview";
  }
  if (hebrewishAnswer.includes("בונה תוכנה")) return "I build software/web stuff\nNo idea how to make that sound less nerdy 😂";
  if (hebrewishAnswer.includes("ניו יורק")) return "I'm kind of between New York and Israel depending on the season";
  if (hebrewishAnswer.includes("ים, קפה")) return "Beach, coffee, gym, building stuff on my computer\nand pretending I'm not competitive";
  if (hebrewishAnswer.includes("מול מחשב")) return "If I'm not on my computer then probably coffee/beach/food/friends\nsomething like that";
  if (hebrewishAnswer.includes("שאלה טובה")) return "Hahaha good question\nI need to answer that like a person, not off the top of my head";
  return englishAnswers[hebrewishAnswer] ?? hebrewishAnswer;
}

function personalize(text: string, styleProfile: StyleProfile): string {
  const banned = styleProfile.bannedPhrases.reduce((reply, phrase) => reply.replaceAll(phrase, ""), text);
  return banned.length <= styleProfile.maxMessageCharacters
    ? banned
    : `${banned.slice(0, styleProfile.maxMessageCharacters - 1)}...`;
}

function pick(values: string[], seed: string): string {
  const index = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % values.length;
  return values[index];
}

function hasHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

function hoursSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 3_600_000;
}
