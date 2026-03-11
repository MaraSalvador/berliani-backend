import FormData from "form-data";
import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch";
import http from "http";
import https from "https";

http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      "unknown";

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
        headers: { "Content-Type": "application/json" },
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
        formData.append(`file${index}`, file.buffer, {
          filename: file.originalname
        });
      });

      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMediaGroup`,
        {
          method: "POST",
          body: formData
        }
      );

    }

    const emailRes = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.RESEND_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    from: "BERLIANI <contact@mail.berliani.com>",
    to: ["berliani@jewelry-diamonds.ru"],
    subject: "Новая заявка BERLIANI",
    text: textMessage
  })
});

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
