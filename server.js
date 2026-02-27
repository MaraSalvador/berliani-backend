import FormData from "form-data";
import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch";
import nodemailer from "nodemailer";

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const transporter = nodemailer.createTransport({
  host: "smtp.yandex.ru",
  port: 465,
  secure: true,
  auth: {
    user: process.env.YANDEX_USER,
    pass: process.env.YANDEX_PASS
  }
});

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
  req.headers["x-forwarded-for"] ||
  req.socket.remoteAddress ||
  "unknown";

    const message = `
Новое обращение BERLIANI

ФИО: ${name}
Страна: ${country}
Телефон: ${phone}

Способ связи:
${methods}

IP: ${ip}
Гео: ${location}

Вопрос:
${question}
await transporter.sendMail({
  from: process.env.YANDEX_USER,
  to: process.env.YANDEX_USER,
  subject: "Новая заявка BERLIANI",
  text: message
});
`;

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const formData = new FormData();
        formData.append("chat_id", TELEGRAM_CHAT_ID);
        formData.append("caption", message);
        formData.append("document", file.buffer, file.originalname);

        await fetch(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`,
          {
            method: "POST",
            body: formData
          }
        );
      }
    } else {
      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(message)}`
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
