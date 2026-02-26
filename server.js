import FormData from "form-data";
import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

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
      methods,
      ip,
      location
    } = req.body;

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
