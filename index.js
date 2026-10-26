
import express from "express";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "trendy_verify_2026";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

app.get("/", (req, res) => {
  res.send("Trendy Choice AI Bot is running!");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

async function reply(senderId, message) {
  if (!PAGE_ACCESS_TOKEN) return;

  await fetch("https://graph.facebook.com/v23.0/me/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: senderId },
      message: { text: message },
      access_token: PAGE_ACCESS_TOKEN
    })
  });
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  for (const entry of req.body.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.message || event.message.is_echo) continue;

      const text = (event.message.text || "").toLowerCase();
      const sender = event.sender.id;
      let answer;

      if (/দাম|price|কত টাকা/.test(text)) {
        answer = "কোন প্রোডাক্টটির দাম জানতে চান? নাম বা ছবি পাঠান।";
      } else if (/ডেলিভারি|delivery|কুরিয়ার/.test(text)) {
        answer = "ঢাকায় ডেলিভারি চার্জ ৮০ টাকা, ঢাকার বাইরে ১২০ টাকা।";
      } else if (/ক্যাশ|cod|পেমেন্ট|payment/.test(text)) {
        answer = "আমাদের Cash on Delivery সুবিধা আছে। প্রোডাক্ট হাতে পেয়ে দেখে তারপর পেমেন্ট করতে পারবেন।";
      } else if (/অর্ডার|order|কিনতে চাই/.test(text)) {
        answer = "অর্ডার করতে প্রোডাক্টের নাম, আপনার নাম, ফোন নম্বর ও সম্পূর্ণ ঠিকানা দিন।";
      } else {
        answer = "ধন্যবাদ Trendy Choice-এ মেসেজ করার জন্য! 😊 কী জানতে চান লিখুন, প্রয়োজনে আমাদের টিম সাহায্য করবে।";
      }

      try {
        await reply(sender, answer);
      } catch (error) {
        console.error("Reply failed:", error.message);
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Bot running on " + PORT));
