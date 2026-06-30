import "dotenv/config";

import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import nodemailer from "nodemailer";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MAX_PHOTO_COUNT = 5;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_PHOTO_SIZE = 18 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FURNITURE = new Set([
  "Диван",
  "Кресло",
  "Стулья",
  "Кухонный уголок",
  "Кожаная мебель",
  "Мебель для бизнеса",
  "Другое"
]);

export function loadConfig(env = process.env) {
  const smtpPort = Number.parseInt(env.SMTP_PORT || "465", 10);
  return {
    nodeEnv: env.NODE_ENV || "development",
    port: Number.parseInt(env.PORT || "3000", 10),
    trustProxy: env.TRUST_PROXY === "1",
    smtpHost: env.SMTP_HOST || "smtp.yandex.com",
    smtpPort,
    smtpSecure: smtpPort === 465,
    smtpUser: env.SMTP_USER || "",
    smtpPass: env.SMTP_PASS || "",
    smtpFrom: env.SMTP_FROM || env.SMTP_USER || "",
    mailTo: env.MAIL_TO || "sagatel.petrosyan@yandex.com",
    allowedOrigins: (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  };
}

export function createMailer(config) {
  if (!config.smtpUser || !config.smtpPass || !config.smtpFrom) return null;

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass
    },
    tls: {
      minVersion: "TLSv1.2"
    }
  });
}

export function createApp({
  config = loadConfig(),
  mailer = createMailer(config),
  rateLimitEnabled = true,
  logger = console
} = {}) {
  const app = express();
  app.disable("x-powered-by");

  if (config.trustProxy) app.set("trust proxy", 1);

  app.use((request, response, next) => {
    response.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
    });
    next();
  });

  const requestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 6,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => !rateLimitEnabled,
    handler: (_request, response) => {
      response.status(429).json({
        ok: false,
        message: "Слишком много попыток отправки. Подождите 15 минут и попробуйте снова."
      });
    }
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: MAX_PHOTO_COUNT,
      fileSize: MAX_PHOTO_SIZE,
      fields: 8,
      fieldSize: 4 * 1024
    },
    fileFilter: (_request, file, callback) => {
      if (ALLOWED_PHOTO_TYPES.has(file.mimetype)) {
        callback(null, true);
        return;
      }

      const error = new Error("Поддерживаются только фотографии JPG, PNG и WEBP.");
      error.code = "UNSUPPORTED_PHOTO_TYPE";
      callback(error);
    }
  });

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, mailConfigured: Boolean(mailer) });
  });

  app.post(
    "/api/photo-request",
    requestLimiter,
    (request, response, next) => {
      if (isAllowedOrigin(request, config.allowedOrigins)) {
        next();
        return;
      }
      response.status(403).json({ ok: false, message: "Отправка с этого адреса запрещена." });
    },
    upload.array("photos", MAX_PHOTO_COUNT),
    async (request, response) => {
      if (normalizeSingleLine(request.body.company_site, 200)) {
        response.status(201).json({ ok: true, message: "Заявка отправлена. Мы скоро свяжемся с вами." });
        return;
      }

      const data = validateRequest(request.body, request.files || []);
      if (!data.ok) {
        response.status(400).json({ ok: false, message: data.message });
        return;
      }

      if (!mailer) {
        logger.error("Email delivery is not configured: SMTP_USER, SMTP_PASS and SMTP_FROM are required.");
        response.status(503).json({
          ok: false,
          message: "Отправка временно недоступна. Пожалуйста, позвоните нам или попробуйте позже."
        });
        return;
      }

      const requestId = crypto.randomUUID();
      try {
        await mailer.sendMail(buildEmail(data.value, config, requestId));
        response.status(201).json({
          ok: true,
          message: "Заявка отправлена. Мы скоро свяжемся с вами."
        });
      } catch (error) {
        logger.error("Failed to send photo request email", {
          requestId,
          error: error instanceof Error ? error.message : String(error)
        });
        response.status(502).json({
          ok: false,
          message: "Почтовый сервер не принял заявку. Попробуйте отправить её ещё раз через минуту."
        });
      }
    }
  );

  app.get(["/", "/index.html"], (_request, response) => {
    response.set("Cache-Control", "no-cache");
    response.sendFile(path.join(ROOT_DIR, "index.html"));
  });
  app.get("/styles.css", (_request, response) => response.sendFile(path.join(ROOT_DIR, "styles.css")));
  app.get("/script.js", (_request, response) => response.sendFile(path.join(ROOT_DIR, "script.js")));
  app.use(
    "/images",
    express.static(path.join(ROOT_DIR, "images"), {
      dotfiles: "deny",
      index: false,
      maxAge: config.nodeEnv === "production" ? "7d" : 0
    })
  );

  app.use((request, response) => {
    if (request.path.startsWith("/api/")) {
      response.status(404).json({ ok: false, message: "Адрес API не найден." });
      return;
    }
    response.status(404).type("text/plain").send("Страница не найдена");
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError) {
      const message = {
        LIMIT_FILE_SIZE: "Размер каждого фото не должен превышать 10 МБ.",
        LIMIT_FILE_COUNT: "Можно прикрепить не более 5 фотографий.",
        LIMIT_UNEXPECTED_FILE: "Можно прикрепить не более 5 фотографий.",
        LIMIT_FIELD_VALUE: "Одно из полей формы слишком длинное."
      }[error.code] || "Не удалось обработать прикреплённые фотографии.";
      response.status(400).json({ ok: false, message });
      return;
    }

    if (error?.code === "UNSUPPORTED_PHOTO_TYPE") {
      response.status(400).json({ ok: false, message: error.message });
      return;
    }

    logger.error("Unhandled request error", error);
    response.status(500).json({ ok: false, message: "Не удалось обработать заявку." });
  });

  return app;
}

function validateRequest(body, photos) {
  const name = normalizeSingleLine(body.name, 80);
  const phoneDigits = String(body.phone || "").replace(/\D/g, "");
  const furniture = normalizeSingleLine(body.furniture, 80);
  const comment = normalizeMultiline(body.comment, 1000);
  const consent = body.consent === "on" || body.consent === "true";

  if (name.length < 2) return { ok: false, message: "Укажите имя." };
  if (!/^7\d{10}$/.test(phoneDigits)) return { ok: false, message: "Введите телефон полностью." };
  if (!ALLOWED_FURNITURE.has(furniture)) return { ok: false, message: "Выберите тип мебели." };
  if (!consent) return { ok: false, message: "Нужно согласие на обработку персональных данных." };
  if (!photos.length) return { ok: false, message: "Прикрепите хотя бы одно фото." };
  if (photos.length > MAX_PHOTO_COUNT) return { ok: false, message: "Можно прикрепить не более 5 фотографий." };

  const totalPhotoSize = photos.reduce((total, photo) => total + photo.size, 0);
  if (totalPhotoSize > MAX_TOTAL_PHOTO_SIZE) {
    return { ok: false, message: "Общий размер фотографий не должен превышать 18 МБ." };
  }

  for (const photo of photos) {
    const detectedType = detectImageType(photo.buffer);
    if (!detectedType || detectedType !== photo.mimetype) {
      return { ok: false, message: "Один из файлов не является фотографией JPG, PNG или WEBP." };
    }
  }

  return {
    ok: true,
    value: {
      name,
      phone: formatPhone(phoneDigits),
      furniture,
      comment,
      photos
    }
  };
}

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function buildEmail(data, config, requestId) {
  const submittedAt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Samara",
    dateStyle: "long",
    timeStyle: "short"
  }).format(new Date());

  const lines = [
    "Новая заявка с сайта «Проф Перетяжка 63»",
    "",
    `Имя: ${data.name}`,
    `Телефон: ${data.phone}`,
    `Мебель: ${data.furniture}`,
    `Комментарий: ${data.comment || "не указан"}`,
    `Фотографий: ${data.photos.length}`,
    `Дата: ${submittedAt}`,
    `Номер заявки: ${requestId}`
  ];

  return {
    from: `"Заявка с сайта" <${config.smtpFrom}>`,
    to: config.mailTo,
    subject: `Новая заявка: ${data.furniture}, ${data.phone}`,
    text: lines.join("\n"),
    attachments: data.photos.map((photo, index) => ({
      filename: `photo-${index + 1}.${extensionForType(photo.mimetype)}`,
      content: photo.buffer,
      contentType: photo.mimetype
    }))
  };
}

function extensionForType(type) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type] || "bin";
}

function formatPhone(digits) {
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

function normalizeSingleLine(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeMultiline(value, maxLength) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isAllowedOrigin(request, allowedOrigins) {
  const origin = request.get("origin");
  if (!origin) return true;

  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.host === request.get("host")) return true;
    return allowedOrigins.includes(parsedOrigin.origin);
  } catch {
    return false;
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const config = loadConfig();
  if (config.nodeEnv === "production" && !createMailer(config)) {
    throw new Error("SMTP_USER, SMTP_PASS and SMTP_FROM must be configured in production.");
  }

  const app = createApp({ config });
  const server = app.listen(config.port, () => {
    console.log(`Site is running at http://localhost:${config.port}`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

