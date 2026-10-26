import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());

const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN || "trendy_verify_2026";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

// Main model fail/busy hole porer model e jabe
const MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];

const SYSTEM_PROMPT = `
তুমি Trendy Choice অনলাইন শপের বাংলা কাস্টমার সার্ভিস সহকারী।
স্বাভাবিক, ভদ্র ও সংক্ষিপ্ত বাংলায় উত্তর দেবে।

জানা তথ্য:
- ঢাকায় ডেলিভারি চার্জ ৮০ টাকা।
- ঢাকার বাইরে ডেলিভারি চার্জ ১২০ টাকা।
- Cash on Delivery আছে। পণ্য হাতে পেয়ে দেখে পেমেন্ট করা যায়।
- ওয়েবসাইট: https://r4yh4n-dev.github.io/trendy-choice/
- WhatsApp: 01826459122

পণ্যের দাম, স্টক, গ্যারান্টি বা বৈশিষ্ট্য সম্পর্কে তথ্য জানা না থাকলে বানিয়ে বলবে না।
কাস্টমারকে পণ্যের নাম বা ছবি দিতে বলবে, অথবা WhatsApp/ইনবক্সে যোগাযোগ করতে বলবে।
অপ্রাসঙ্গিক প্রশ্নে সংক্ষেপে জানাবে যে তুমি Trendy Choice-এর কাস্টমার সার্ভিস সহকারী।
`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Quota shesh hole oi model ke kichu somoy skip korbe
const cooldownUntil = {};

function isQuota(error) {
  const msg = String(error?.message || "");
  return error?.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg);
}

function isBusy(error) {
  const msg = String(error?.message || "");
  return (
    [429, 500, 503].includes(error?.status) ||
    /503|429|UNAVAILABLE|overloaded|high demand/i.test(msg)
  );
}

app.get("/", (req, res) => {
  res.send("Trendy Choice AI Bot is running!");
});

app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

async function sendReply(id, message) {
  const response = await fetch(
    "https://graph.facebook.com/v23.0/me/messages",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id },
        message: { text: message.slice(0, 1900) },
        access_token: PAGE_ACCESS_TOKEN
      })
    }
  );

  if (!response.ok) {
    console.error("Facebook API error:", await response.text());
  }
}

async function getAIReply(question) {
  if (!ai) {
    return "দুঃখিত, আপাতত উত্তর দিতে সমস্যা হচ্ছে। আমাদের ইনবক্স টিম আপনাকে সাহায্য করবে।";
  }

  for (const model of MODELS) {
    if ((cooldownUntil[model] || 0) > Date.now()) continue;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await ai.models.generateContent({
          model,
          contents: question,
          config: {
            systemInstruction: SYSTEM_PROMPT
          }
        });

        const text = result.text?.trim();
        if (text) {
          console.log(`Reply from ${model}`);
          return text;
        }
        break; // khali reply hole next model
      } catch (error) {
        console.error(
          `Gemini error (${model}, try ${attempt + 1}):`,
          error.message
        );
        if (isQuota(error)) {
          cooldownUntil[model] = Date.now() + 60 * 60 * 1000; // 1 ghonta skip
          break;
        }
        if (!isBusy(error)) break; // onno error hole next model
        await sleep(500);
      }
    }
  }

  return "দুঃখিত, আপাতত উত্তর দিতে সমস্যা হচ্ছে। একটু পরে আবার মেসেজ করুন, অথবা WhatsApp-এ যোগাযোগ করুন: 01826459122";
}

app.post("/webhook", (req, res) => {
  res.sendStatus(200);
  if (!PAGE_ACCESS_TOKEN) return;

  for (const entry of req.body.entry || []) {
    for (const event of entry.messaging || []) {
      if (
        !event.message ||
        event.message.is_echo ||
        !event.sender?.id ||
        !event.message.text
      ) continue;

      const senderId = event.sender.id;
      const question = event.message.text;

      getAIReply(question)
        .then(answer => sendReply(senderId, answer))
        .catch(error => console.error("Reply error:", error.message));
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Bot running on " + PORT));
