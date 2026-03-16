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

/* =========================
   RATE LIMIT (ANTI SPAM)
========================= */

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests"
});

app.use("/send", limiter);

/* =========================
   FILE UPLOAD
========================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
    fields: 200,
    fieldSize: 500 * 1024
  }
});

app.use(cors({ origin: ["https://berliani.com","https://www.berliani.com"] }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const recentPhones = new Map();

/* =========================
   FORM ENDPOINT
========================= */

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

    /* =========================
       BASIC VALIDATION
    ========================= */

    if (!name || !phone || !question) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const now = Date.now();
    const last = recentPhones.get(phone);

    if (last && now - last < 60000) {
      return res.status(429).json({ error: "Too many requests" });
    }

    recentPhones.set(phone, now);

    /* =========================
       FILE TYPE VALIDATION
    ========================= */

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (req.files) {
      for (const file of req.files) {
        if (!allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({
            error: "Invalid file type"
          });
        }
      }
    }

    /* =========================
       USER IP
    ========================= */

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      "unknown";

    const headerUserAgent = req.headers["user-agent"] || "unknown";

    let geo = "";

    fetch(`http://ip-api.com/json/${ip}`)
      .then(r => r.json())
      .then(geoData => {
        geo = `
📍 ${geoData.city || ""}, ${geoData.country || ""}
📡 ISP: ${geoData.isp || ""}
`;
      })
      .catch(() => {});

    let device = "Unknown";
    let browser = "Unknown";
    let osName = "Unknown";

    if (headerUserAgent.includes("iPhone")) device = "iPhone";
    else if (headerUserAgent.includes("Android")) device = "Android phone";
    else if (headerUserAgent.includes("Mac")) device = "Mac";
    else if (headerUserAgent.includes("Windows")) device = "Windows PC";

    if (headerUserAgent.includes("Edg")) browser = "Edge";
    else if (headerUserAgent.includes("Chrome")) browser = "Chrome";
    else if (headerUserAgent.includes("Firefox")) browser = "Firefox";
    else if (headerUserAgent.includes("Safari")) browser = "Safari";

    if (headerUserAgent.includes("iPhone")) osName = "iOS";
    else if (headerUserAgent.includes("Android")) osName = "Android";
    else if (headerUserAgent.includes("Mac")) osName = "macOS";
    else if (headerUserAgent.includes("Windows")) osName = "Windows";

    /* =========================
       MESSAGE TEXT
    ========================= */

    const textMessage = `
📩 Свой вопрос из раздела FAQ | сайт BERLIANI |

👤 ФИО: ${name}
🌍 Страна: ${country}
📞 Телефон: ${phone}

📧 Email: ${email || ""}
📲 WhatsApp: ${whatsappPhone || ""} ${whatsappUsername || ""}
📲 Telegram: ${telegramPhone || ""} ${telegramUsername || ""}

🧭 Способ связи:

${methodMessenger === "true" ? "☑ Мессенджеры" : ""}
${whatsappSelected === "true" ? "   ☑ WhatsApp" : ""}
${telegramSelected === "true" ? "   ☑ Telegram" : ""}

${methodEmail === "true" ? "☑ Электронная почта" : ""}

${call === "true" ? "☑ Позвонить по номеру телефона\n   ☑ Номер указан в поле «Ваш номер телефона»" : ""}

${message === "true" ? "☑ Ответить сообщением\n   ☑ Номер указан в поле «Ваш номер телефона»" : ""}

${methodOther === "true" ? "☑ Другое\n   ☑ Способ связи указан в поле «Ваш вопрос»" : ""}
🌐 IP: ${ip}
${geo}
💻 Device: ${device}
🖥 OS: ${osName}
🌐 Browser: ${browser}
🖥 Platform: ${platform || ""}
📱 User Agent: ${headerUserAgent || ""}
🚦 Traffic source: ${trafficSource || ""}
🌐 Language: ${language || ""}
🕒 Timezone: ${timezone || ""}
📱 Screen: ${screen || ""}
🔗 Referrer: ${referrer || "direct"}
🧭 Actions: ${actions || ""}
☎ Phone edits: ${phoneEdits || 0}
⌨ Message typing: ${typingTime || 0} sec
📄 Page: ${page || ""}
⏱ Time on site: ${timeOnSite || ""} sec

📊 UTM:
Source: ${utm_source || ""}
Medium: ${utm_medium || ""}
Campaign: ${utm_campaign || ""}
Term: ${utm_term || ""}
Content: ${utm_content || ""}

❓ Вопрос:
${question}
`;

    /* =========================
       TELEGRAM FILES
    ========================= */

    if (!req.files || req.files.length === 0) {

      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: textMessage
          })
        }
      );

    }

    if (req.files && req.files.length > 0) {

      const media = req.files.map((file, index) => ({
        type: "document",
        media: `attach://file${index}`,
        caption: index === 0 ? textMessage : undefined
      }));

      const formData = new FormData();

      formData.append("chat_id", TELEGRAM_CHAT_ID);
      formData.append("media", JSON.stringify(media));

      req.files.forEach((file, index) => {

        formData.append(
          `file${index}`,
          file.buffer,
          { filename: file.originalname }
        );

      });

      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMediaGroup`,
        {
          method: "POST",
          body: formData
        }
      );

    }

    /* =========================
       EMAIL ATTACHMENTS
    ========================= */

    const attachments = (req.files || []).map(file => ({
      filename: file.originalname,
      content: file.buffer.toString("base64"),
      encoding: "base64"
    }));

    /* =========================
       SEND EMAIL
    ========================= */

    const emailRes = await fetch(
      "https://api.resend.com/emails",
      {
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
      }
    );

    const emailData = await emailRes.text();

    console.log(emailData);

    res.json({ success: true });

  } catch (err) {

    console.error("SERVER ERROR:", err);

    res.status(500).json({
      success: false,
      error: "Server error"
    });

  }

});

/* =========================
   SERVER
========================= */

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

  fetch("https://berliani-backend.onrender.com")
    .catch(() => {});

}, 14 * 60 * 1000);
