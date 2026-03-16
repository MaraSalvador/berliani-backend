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
    fileSize: 10 * 1024 * 1024,
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

    const headerUserAgent = req.headers["user-agent"] || "";

    let device = "Компьютер";
    let browser = "Не определён";
    let osName = "Не определена";

    if (/iphone/i.test(headerUserAgent)) device = "iPhone";
    else if (/android/i.test(headerUserAgent)) device = "Android";
    else if (/ipad/i.test(headerUserAgent)) device = "iPad";
    else if (/mac/i.test(headerUserAgent)) device = "Mac";
    else if (/windows/i.test(headerUserAgent)) device = "Windows ПК";

    if (/edg/i.test(headerUserAgent)) browser = "Edge";
    else if (/chrome/i.test(headerUserAgent)) browser = "Chrome";
    else if (/firefox/i.test(headerUserAgent)) browser = "Firefox";
    else if (/safari/i.test(headerUserAgent)) browser = "Safari";

    if (/iphone|ipad/i.test(headerUserAgent)) osName = "iOS";
    else if (/android/i.test(headerUserAgent)) osName = "Android";
    else if (/mac/i.test(headerUserAgent)) osName = "macOS";
    else if (/windows/i.test(headerUserAgent)) osName = "Windows";

    const contactMethods = [];

    if (methodMessenger === "true") contactMethods.push("☑ Мессенджеры");
    if (whatsappSelected === "true") contactMethods.push("   ☑ WhatsApp");
    if (telegramSelected === "true") contactMethods.push("   ☑ Telegram");
    if (methodEmail === "true") contactMethods.push("☑ Электронная почта");
    if (call === "true") contactMethods.push("☑ Позвонить по телефону");
    if (message === "true") contactMethods.push("☑ Ответить сообщением");
    if (methodOther === "true") contactMethods.push("☑ Другое");

    const contactBlock =
      contactMethods.length > 0
        ? contactMethods.join("\n")
        : "Не указан";

    const utmData = [];

    if (utm_source) utmData.push("Источник: " + utm_source);
    if (utm_medium) utmData.push("Канал: " + utm_medium);
    if (utm_campaign) utmData.push("Кампания: " + utm_campaign);
    if (utm_term) utmData.push("Ключевое слово: " + utm_term);
    if (utm_content) utmData.push("Контент: " + utm_content);

    const utmBlock =
      utmData.length > 0
        ? utmData.join("\n")
        : "UTM отсутствуют";

    const textMessage = `
📩 Свой вопрос из раздела FAQ | сайт BERLIANI |

👤 ФИО: ${name}
🌍 Страна: ${country}
📞 Телефон: ${phone}

📧 Email: ${email || ""}
📲 WhatsApp: ${whatsappPhone || ""} ${whatsappUsername || ""}
📲 Telegram: ${telegramPhone || ""} ${telegramUsername || ""}

🧭 Способ связи:
${contactBlock}

🌐 IP: ${ip}
${geoText}

💻 Устройство: ${device}
🖥 ОС: ${osName}
🌐 Браузер: ${browser}

🚦 Источник трафика: ${trafficSource || ""}
🌐 Язык: ${language || ""}
🕒 Часовой пояс: ${timezone || ""}
📱 Экран: ${screen || ""}

🔗 Referrer: ${referrer || "direct"}

🧭 Действия: ${actions || ""}
☎ Редактирования телефона: ${phoneEdits || 0}
⌨ Время ввода сообщения: ${typingTime || 0} сек

📄 Страница: ${page || ""}
⏱ Время на сайте: ${timeOnSite || ""} сек

📊 UTM:
${utmBlock}

❓ Вопрос:
${question}
`;

    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: textMessage
        })
      }
    );

    if (req.files && req.files.length > 0) {

      for (const file of req.files) {

        const formData = new FormData();

        formData.append("chat_id", TELEGRAM_CHAT_ID);

        formData.append(
          "document",
          file.buffer,
          { filename: file.originalname }
        );

        await fetch(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`,
          {
            method: "POST",
            body: formData
          }
        );
      }
    }

    const attachments = (req.files || []).map(file => ({
      filename: file.originalname,
      content: file.buffer.toString("base64"),
      encoding: "base64"
    }));

    await fetch(
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

  fetch("https://berliani-backend.onrender.com")
    .catch(() => {});

}, 14 * 60 * 1000);
