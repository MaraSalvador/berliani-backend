import FormData from "form-data";
import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch";
import http from "http";
import https from "https";
import rateLimit from "express-rate-limit";

http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

/* RATE LIMIT */

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests"
});

app.use("/send", limiter);

/* FILE UPLOAD */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 5,
    fields: 200,
    fieldSize: 500 * 1024
  }
});

app.use(cors({
  origin: ["https://berliani.com", "https://www.berliani.com"]
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const recentPhones = new Map();

/* FORM ENDPOINT */

app.post("/send", upload.array("files"), async (req, res) => {

  try {

    const origin = req.headers.origin;

    const allowedOrigins = [
      "https://berliani.com",
      "https://www.berliani.com",
      null
    ];

    if (origin && !allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: "Invalid origin" });
    }

    if (req.headers["x-form-secret"] !== process.env.FORM_SECRET) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const {
      name,
      country,
      phone,
      question,
      email,
      whatsappPhone,
      whatsappUsername,
      telegramPhone,
      telegramUsername,
      call,
      message,
      methodMessenger,
      methodEmail,
      methodOther,
      whatsappSelected,
      telegramSelected,
      language,
      timezone,
      screen,
      referrer,
      page,
      timeOnSite,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      platform,
      userAgent,
      trafficSource,
      actions,
      phoneEdits,
      typingTime
    } = req.body;

    if (!name || !phone || !question) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const now = Date.now();
    const last = recentPhones.get(phone);

    if (last && now - last < 60000) {
      return res.status(429).json({ error: "Too many requests" });
    }

    recentPhones.set(phone, now);

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (req.files) {
      for (const file of req.files) {
        if (!allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({ error: "Invalid file type" });
        }
      }
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      "unknown";

    let geoText = "";

    try {
      const geoRes = await fetch(`http://ip-api.com/json/${ip}`);
      const geoData = await geoRes.json();

      geoText =
        "📍 " + (geoData.city || "") + ", " + (geoData.country || "") +
        "\n📡 ISP: " + (geoData.isp || "");
    } catch {}

    const contactMethods = [];

    if (methodMessenger === "true") contactMethods.push("☑ Мессенджеры");
    if (whatsappSelected === "true") contactMethods.push("   ☑ WhatsApp");
    if (telegramSelected === "true") contactMethods.push("   ☑ Telegram");
    if (methodEmail === "true") contactMethods.push("☑ Электронная почта");
    if (call === "true") contactMethods.push("☑ Позвонить");
    if (message === "true") contactMethods.push("☑ Сообщение");
    if (methodOther === "true") contactMethods.push("☑ Другое");

    const contactBlock =
      contactMethods.length > 0
        ? contactMethods.join("\n")
        : "Не указан";

    const utmBlock = `
${utm_source ? "Источник: " + utm_source : ""}
${utm_medium ? "\nКанал: " + utm_medium : ""}
${utm_campaign ? "\nКампания: " + utm_campaign : ""}
${utm_term ? "\nКлюч: " + utm_term : ""}
${utm_content ? "\nКонтент: " + utm_content : ""}
`;

    const textMessage = `
📩 BERLIANI

━━━━━━━━━━━━━━━
👤 ${name}
📞 ${phone}
🌍 ${country}

━━━━━━━━━━━━━━━
🧭 СПОСОБ СВЯЗИ
${contactBlock}

━━━━━━━━━━━━━━━
❓ ВОПРОС
${question}

━━━━━━━━━━━━━━━
🌐 ${trafficSource}
⏱ ${timeOnSite} сек
`;

    /* TELEGRAM */

    if (telegramUsername) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramUsername.replace("@",""),
      text: "Благодарим за обращение. Мы скоро свяжемся с Вами."
    })
  });
}

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: textMessage
      })
    });

    /* FILES TELEGRAM */

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {

        const formData = new FormData();

        formData.append("chat_id", TELEGRAM_CHAT_ID);

        const safeName = Buffer.from(file.originalname, "latin1").toString("utf8");

        formData.append("document", file.buffer, { filename: safeName });

        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
          method: "POST",
          body: formData
        });
      }
    }

    const attachments = (req.files || []).map(file => ({
      filename: Buffer.from(file.originalname, "latin1").toString("utf8"),
      content: file.buffer.toString("base64"),
      encoding: "base64"
    }));

    /* EMAIL ТЕБЕ */

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "BERLIANI <contact@mail.berliani.com>",
        to: ["berliani@jewelry-diamonds.ru"],
        subject: "Новая заявка BERLIANI",
        text: textMessage,
        attachments: attachments
      })
    });

    /* АВТООТВЕТ */

    if (email) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "BERLIANI <contact@mail.berliani.com>",
          to: [email],
          subject: "BERLIANI — Ваш запрос получен",
          html: `
<div style="
  background:#ffffff;
  font-family: 'Times New Roman', serif;
  max-width:520px;
  margin:auto;
  padding:80px 40px;
  text-align:center;
  color:#000;
">

  <div style="
    font-size:18px;
    letter-spacing:0.3em;
    margin-bottom:60px;
  ">
    BERLIANI
  </div>

  <div style="
    font-size:24px;
    margin-bottom:20px;
  ">
    Благодарим за обращение
  </div>

  <div style="
    font-size:15px;
    color:#444;
    margin-bottom:60px;
    line-height:1.8;
  ">
    Ваш запрос успешно получен.<br>
    Персональный менеджер свяжется с Вами<br>
    в ближайшее время.
  </div>

  <div style="
    width:60px;
    height:1px;
    background:#000;
    margin:0 auto 60px;
  "></div>

  <div style="
    font-size:11px;
    letter-spacing:0.3em;
    color:#999;
  ">
    JEWELRY & DIAMONDS
  </div>

</div>
`
        })
      });
    }

    res.json({ success: true });

  } catch (err) {

    console.error("SERVER ERROR:", err);

    res.status(500).json({
      success: false,
      error: "Server error"
    });

  }

});

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(413).json({ error: err.message });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

setInterval(() => {
  fetch("https://berliani-backend.onrender.com").catch(() => {});
}, 14 * 60 * 1000);
