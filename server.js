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

/* =========================
   RATE LIMIT (ANTI SPAM)
========================= */

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
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
    files: 5
  }
});

app.use(cors());
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/* =========================
   FORM ENDPOINT
========================= */

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
      telegramSelected
    } = req.body;

    /* =========================
       BASIC VALIDATION
    ========================= */

    if (!name || !phone || !question) {
      return res.status(400).json({ error: "Invalid request" });
    }

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

    /* =========================
       MESSAGE TEXT
    ========================= */

    const textMessage = `
📩 Новая заявка BERLIANI

👤 ФИО: ${name}
🌍 Страна: ${country}
📞 Телефон: ${phone}

📧 Email: ${email || ""}
📲 WhatsApp: ${whatsappPhone || ""} ${whatsappUsername || ""}
📲 Telegram: ${telegramPhone || ""} ${telegramUsername || ""}

🧭 Способ связи:
Messenger: ${methodMessenger}
WhatsApp: ${whatsappSelected}
Telegram: ${telegramSelected}
Email: ${methodEmail}
Call: ${call}
Message: ${message}
Other: ${methodOther}

🌐 IP: ${ip}

❓ Вопрос:
${question}
`;

    /* =========================
       TELEGRAM MESSAGE
    ========================= */

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

    /* =========================
       TELEGRAM FILES
    ========================= */

    if (req.files && req.files.length > 0) {

      const media = req.files.map((file, index) => ({
        type: "document",
        media: `attach://file${index}`
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
