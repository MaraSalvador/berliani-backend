import FormData from "form-data";
import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch";
import http from "http";
import https from "https";
import rateLimit from "express-rate-limit";

async function safeFetch(url, options = {}, timeout = 5000) {
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
      typingTime
    } = req.body;

    if (!name || !phone || !question) {
      return res.status(400).json({ error: "Invalid request" });
    }

    /* FILE VALIDATION */

    const ALLOWED_TYPES = [
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
        if (!ALLOWED_TYPES.includes(file.mimetype)) {
          return res.status(400).json({ error: "Invalid file type" });
        }
      }
    }

    /* IP */

    const ip =
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      "";

    /* GEO */

    let geoText = "-";

    try {
      const geoRes = await safeFetch(`https://ipapi.co/${ip}/json/`);
      const geoData = await geoRes.json();

      geoText =
        "📍 " + (geoData.city || "") + ", " + (geoData.country_name || "") +
        "\n📡 ISP: " + (geoData.org || "");
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

    /* MESSAGE */

    const textMessage = `
📩 FAQ from site BERLIANI

━━━━━━━━━━━━━━━
🗓 ${now}

👤 ${name}
📞 ${phone}
📧 ${email || '-'}
🌍 ${country || '-'}

━━━━━━━━━━━━━━━
📲 КОНТАКТЫ
${messengersBlock || '-'}

━━━━━━━━━━━━━━━
🧭 СПОСОБ СВЯЗИ
${contactBlock}

━━━━━━━━━━━━━━━
❓ ВОПРОС
${question}

━━━━━━━━━━━━━━━
🌐 ${trafficSource}
⏱ ${timeOnSite} сек

━━━━━━━━━━━━━━━
📍 GEO
${geoText}

━━━━━━━━━━━━━━━
📊 АНАЛИТИКА

📄 ${page || '-'}
🔗 ${referrer || '-'}
🧠 ${actions || '-'}
✍️ ${typingTime || 0} сек
📱 ${phoneEdits || 0}
🧠 UA: ${userAgent || '-'}

━━━━━━━━━━━━━━━
💻 УСТРОЙСТВО

🖥 ${platform || '-'}
📐 ${screen || '-'}
🌍 ${language || '-'}
⏰ ${timezone || '-'}

━━━━━━━━━━━━━━━
📢 UTM
${utmBlock || '—'}
`;

    /* TELEGRAM TEXT */

    await safeFetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: textMessage
      })
    });

    /* TELEGRAM FILES (ONE MESSAGE) */

    if (req.files && req.files.length > 0) {

  const media = req.files.map(file => {
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    return {
      type: "document",
      media: "attach://" + decodedName
    };
  });

  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHAT_ID);
  formData.append("media", JSON.stringify(media));

  req.files.forEach(file => {
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    formData.append(decodedName, file.buffer, decodedName);
  });

  await safeFetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMediaGroup`, {
    method: "POST",
    body: formData
  });
}

    /* EMAIL */

    const attachments = (req.files || []).map(file => ({
      filename: Buffer.from(file.originalname, "latin1").toString("utf8"),
      content: file.buffer.toString("base64"),
      encoding: "base64"
    }));

    await safeFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "BERLIANI <privilege@berliani.com>",
        to: ["berliani@jewelry-diamonds.ru"],
        subject: "Новая заявка BERLIANI",
        text: textMessage,
        attachments: attachments
      })
    });

/* AUTO EMAIL */

if (email) {
  await safeFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "BERLIANI <privilege@berliani.com>",
      to: [email],
      subject: "Подтверждение обращения",
      html: `
<div style="background:#ffffff;font-family:'Times New Roman',serif;max-width:520px;margin:auto;padding:80px 40px;text-align:center;color:#000;">

<div style="font-size:18px;letter-spacing:0.3em;margin-bottom:60px;">
BERLIANI
</div>

<div style="font-size:22px;margin-bottom:24px;">
Благодарим Вас за обращение
</div>

<div style="font-size:15px;color:#444;margin-bottom:40px;line-height:1.8;">
Ваш запрос получен.<br>
Персональный менеджер свяжется с Вами в ближайшее время.
</div>

<div style="font-size:12px;color:#777;line-height:1.7;margin-bottom:60px;">
Данное письмо сформировано автоматически.<br>
Пожалуйста, не отвечайте на него — адрес предназначен только для отправки уведомлений.
</div>

<div style="font-size:11px;letter-spacing:0.3em;color:#999;">
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
