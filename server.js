import FormData from "form-data";
import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch";
import http from "http";
import https from "https";
import rateLimit from "express-rate-limit";

async function safeFetch(url, options = {}, timeout = 60000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!res.ok) throw new Error("Fetch failed");

    return res;
  } finally {
    clearTimeout(id);
  }
}

http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

const app = express();
const countryNames = new Intl.DisplayNames(['ru'], { type: 'region' });

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
    fileSize: 20 * 1024 * 1024,
    files: 5,
    fields: 200,
    fieldSize: 500 * 1024
  }
});

const allowedOrigins = [
  "https://berliani.com",
  "https://www.berliani.com"
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"));
    }
  }
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function escapeHTML(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseUserAgent(ua = "") {
  ua = ua.toLowerCase();

  let os = "Unknown";
  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac os")) os = "macOS";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";

  let browser = "Unknown";
  let version = "";

  const match =
    ua.match(/chrome\/([\d.]+)/) ||
    ua.match(/firefox\/([\d.]+)/) ||
    ua.match(/version\/([\d.]+).*safari/) ||
    ua.match(/edg\/([\d.]+)/);

  if (ua.includes("chrome") && !ua.includes("edg")) browser = "Chrome";
  else if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("edg")) browser = "Edge";

  if (match) version = match[1];

  let device = "Desktop";
  let model = "—";

  if (ua.includes("iphone")) {
    device = "iPhone";
    model = "iPhone";
  } else if (ua.includes("ipad")) {
    device = "iPad";
    model = "iPad";
  } else if (ua.includes("android")) {
    device = "Android";
    const m = ua.match(/android.*;\s?([^)]+)\)/);
    if (m) model = m[1];
  } else if (ua.includes("macintosh")) {
    device = "Mac";
    model = "Mac";
  }

  const isBot =
    ua.includes("bot") ||
    ua.includes("crawler") ||
    ua.includes("spider");

  return { os, browser, version, device, model, type: isBot ? "Bot" : "User" };
}

/* FORM */

app.post("/send", upload.array("files"), async (req, res) => {

  try {

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
      typingTime,
      company
    } = req.body;

        // === VALIDATION ===

    if (!name || name.trim().length < 2 || name.length > 100) {
      return res.status(400).json({ error: "Invalid name" });
    }

    if (!question || question.trim().length < 10 || question.length > 2000) {
      return res.status(400).json({ error: "Invalid question" });
    }

    if (!/^\+\d{6,15}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid phone" });
    }

    if (email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    // === BOT CHECK ===
if (company && company.trim() !== "") {
  return res.status(400).json({ error: "Bot detected" });
}

    /* FILE VALIDATION */

    const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

    if (req.files) {
  for (const file of req.files) {
    if (
      !ALLOWED_TYPES.includes(file.mimetype) &&
      !file.originalname.toLowerCase().endsWith('.heic') &&
      !file.originalname.toLowerCase().endsWith('.heif')
    ) {
      return res.status(400).json({ error: "Invalid file type" });
    }
  }
}

    /* IP */

    const ip =
  (req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim() ||
  req.headers["x-real-ip"] ||
  req.connection?.remoteAddress ||
  req.socket?.remoteAddress ||
  "";

    /* GEO */

let geoText = "-";
let geoData = {};

try {
  if (ip && ip !== '127.0.0.1' && ip !== '::1') {
    try {
      const geoRes = await safeFetch(`https://ipapi.co/${ip}/json/`, {}, 3000);
      geoData = await geoRes.json();
    } catch {}
  }

  geoText =
    geoData?.country_name
      ? "📍 " + (geoData.city || "") + ", " + geoData.country_name +
        "\n📡 ISP: " + (geoData.org || "")
      : "IP: " + (ip || "unknown");

} catch {}

    /* CONTACT METHODS */

    const contactMethods = [];

    if (methodMessenger === "true") contactMethods.push("☑ Мессенджеры");
    if (whatsappSelected === "true") contactMethods.push("   ☑ WhatsApp");
    if (telegramSelected === "true") contactMethods.push("   ☑ Telegram");
    if (methodEmail === "true") contactMethods.push("☑ Email");
    if (call === "true") contactMethods.push("☑ Call");
    if (message === "true") contactMethods.push("☑ Message");
    if (methodOther === "true") contactMethods.push("☑ Other");

    const contactBlock =
      contactMethods.length > 0
        ? contactMethods.join("\n")
        : "Не указан";

    /* MESSENGERS */

    const messengersBlock = `
${whatsappSelected === "true" ? "WhatsApp: " + (whatsappPhone || "-") + " " + (whatsappUsername || "") : ""}
${telegramSelected === "true" ? "\nTelegram: " + (telegramPhone || "-") + " " + (telegramUsername || "") : ""}
`;

    /* TIME */

    const now = new Date().toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow"
    });

    /* UTM */

    const utmBlock = `
${utm_source ? "Источник: " + utm_source : ""}
${utm_medium ? "\nКанал: " + utm_medium : ""}
${utm_campaign ? "\nКампания: " + utm_campaign : ""}
${utm_term ? "\nКлюч: " + utm_term : ""}
${utm_content ? "\nКонтент: " + utm_content : ""}
`;

    const uaParsed = parseUserAgent(
  userAgent || req.headers["user-agent"] || ""
);

    const safeName = escapeHTML(name);
const safeQuestion = escapeHTML(question);
const safeEmail = escapeHTML(email || "");
    
    /* MESSAGE */
    const textMessage = `
WWW.BERLIANI.COM
ЗАПРОС С САЙТА | REQUEST FROM THE WEBSITE
━━━━━━━━━━━━━━━━━━━

· ДАТА И ВРЕМЯ ОТПРАВКИ ЗАПРОСА / DATE AND TIME OF THE REQUEST · ${now}

Имя и фамилия / First & Last Name: ${safeName}
Номер телефона / Phone Number: ${phone}
Электронная почта / Email: ${safeEmail || '-'}
Страна / Country: ${country ? (countryNames.of(country) || country) : '-'}

━━━━━━━━━━━━━━━━━━━
· КОНТАКТЫ / CONTACT ·
${messengersBlock || '-'}

━━━━━━━━━━━━━━━━━━━
· СПОСОБЫ ОБРАТНОЙ СВЯЗИ / CONTACT METHODS ·
${contactBlock}

━━━━━━━━━━━━━━━━━━━
· ТЕКСТ ЗАПРОСА / MESSAGE ·
${safeQuestion}

━━━━━━━━━━━━━━━━━━━
ИСТОЧНИК ТРАФИКА / TRAFFIC SOURCE: ${trafficSource}
ВРЕМЯ НА САЙТЕ / TIME ON SITE: ${timeOnSite} сек

━━━━━━━━━━━━━━━━━━━
МЕСТОПОЛОЖЕНИЕ / LOCATION:
${geoText}

━━━━━━━━━━━━━━━━━━━
АНАЛИТИКА / ANALYTICS

Страница формы / Form Page: ${page || '-'}
Источник перехода / Referrer: ${referrer || '-'}
Действия пользователя / User Actions: ${actions || '-'}
Время набора / Typing Time: ${typingTime || 0} сек
Количество правок / Number of Edits: ${phoneEdits || 0}
Браузер: ${uaParsed.browser} ${uaParsed.version}
ОС: ${uaParsed.os}
Устройство: ${uaParsed.device}
Модель: ${uaParsed.model}
Тип: ${uaParsed.type}

━━━━━━━━━━━━━━━━━━━
УСТРОЙСТВО / DEVICE

ОС устройства / Operating System: ${platform || '-'}
Разрешение экрана / Screen Resolution: ${screen || '-'}
Язык интерфейса / Language: ${language || '-'}
Часовой пояс / Timezone: ${timezone || '-'}

━━━━━━━━━━━━━━━━━━━
UTM-МЕТКИ / UTM TAGS:
${utmBlock || '—'}
`;

   /* TELEGRAM TEXT */

try {
  await safeFetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: textMessage
    })
  });
} catch (e) {
  console.error("TELEGRAM TEXT ERROR:", e);
}

const attachments = (req.files || []).map(file => ({
  filename: Buffer.from(file.originalname, "latin1").toString("utf8"),
  content: file.buffer.toString("base64"),
  encoding: "base64"
}));

/* ADMIN EMAIL */

try {
  const r = await safeFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
  from: "BERLIANI <privilege@berliani.com>",
  to: ["berliani@jewelry-diamonds.ru"],
  subject: "BERLIANI — Exclusive Client Request",
  text: textMessage,
  attachments: attachments
})
  });

  console.log("EMAIL SENT:", r.status);

} catch (e) {
  console.error("EMAIL ERROR:", e);
}

/* TELEGRAM FILES */

if (req.files && req.files.length > 0) {

  for (const file of req.files) {

    const formData = new FormData();

    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    formData.append("chat_id", TELEGRAM_CHAT_ID);
    formData.append("document", file.buffer, decodedName);

    try {

      const tgFileRes = await safeFetch(
  `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`,
  {
    method: "POST",
    body: formData
  },
  30000
);

      const tgFileData = await tgFileRes.json();
      console.log("TG FILE RESPONSE:", tgFileData);

    } catch (e) {
      console.error("TG FILE ERROR:", decodedName, e);
    }

  }

}

/* AUTO EMAIL */

console.log("USER EMAIL:", email);
if (email) {
  try {

    const r = await safeFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "BERLIANI <privilege@berliani.com>",
        to: [email],
        reply_to: "privilege@berliani.com",
        subject: "BERLIANI — Confirmation",
        html: `
        
<div style="background:#ffffff;font-family:'Times New Roman',serif;max-width:520px;margin:auto;padding:80px 40px;text-align:center;color:#000;">

<div style="font-size:18px;letter-spacing:0.3em;margin-bottom:60px;">
BERLIANI
</div>

<div style="font-size:22px;margin-bottom:24px;">
Благодарим за обращение
</div>

<div style="font-size:15px;color:#444;margin-bottom:40px;line-height:1.8;">
Ваш запрос принят<br>
Персональный менеджер свяжется с Вами
</div>

<div style="font-size:12px;color:#777;line-height:1.7;margin-bottom:60px;">
Системное уведомление — ответ не требуется
</div>

<div style="font-size:11px;letter-spacing:0.3em;color:#999;">
JEWELRY & DIAMONDS
</div>

</div>
`
      })
    });

    const data = await r.json();

console.log("AUTO EMAIL STATUS:", r.status);
console.log("AUTO EMAIL RESPONSE:", data);

  } catch (e) {
    console.error("AUTO EMAIL ERROR:", e);
  }
}
    
    res.json({ success: true });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ success: false });
  }

});

/* SERVER */

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/* KEEP ALIVE */

setInterval(() => {
  fetch("https://berliani-backend.onrender.com").catch(() => {});
}, 14 * 60 * 1000);
