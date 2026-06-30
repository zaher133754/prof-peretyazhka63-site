import { createMailer, loadConfig } from "../server.js";

const config = loadConfig();
const mailer = createMailer(config);

if (!mailer) {
  console.error("Заполните SMTP_USER, SMTP_PASS и SMTP_FROM в файле .env.");
  process.exitCode = 1;
} else {
  try {
    await mailer.verify();
    console.log("Соединение с почтой настроено правильно.");
  } catch (error) {
    console.error("Не удалось подключиться к SMTP Яндекса:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    mailer.close();
  }
}

