import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApp, loadConfig } from "../server.js";

const runningServers = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

test("отправляет заполненную заявку и фотографию почтовому транспорту", async () => {
  const sentEmails = [];
  const mailer = {
    async sendMail(email) {
      sentEmails.push(email);
    }
  };
  const { baseUrl } = await startTestServer(mailer);
  const form = createValidForm();

  const response = await fetch(`${baseUrl}/api/photo-request`, { method: "POST", body: form });
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.ok, true);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "sagatel.petrosyan@yandex.com");
  assert.match(sentEmails[0].text, /\+7 \(927\) 123-45-67/);
  assert.equal(sentEmails[0].attachments.length, 1);
  assert.equal(sentEmails[0].attachments[0].contentType, "image/jpeg");
});

test("отклоняет файл с поддельным MIME-типом", async () => {
  const sentEmails = [];
  const mailer = { async sendMail(email) { sentEmails.push(email); } };
  const { baseUrl } = await startTestServer(mailer);
  const form = createValidForm(new Blob(["это не фотография"], { type: "image/jpeg" }));

  const response = await fetch(`${baseUrl}/api/photo-request`, { method: "POST", body: form });
  const result = await response.json();

  assert.equal(response.status, 400);
  assert.equal(result.ok, false);
  assert.equal(sentEmails.length, 0);
});

test("скрыто принимает спам-бота, но не отправляет письмо", async () => {
  const sentEmails = [];
  const mailer = { async sendMail(email) { sentEmails.push(email); } };
  const { baseUrl } = await startTestServer(mailer);
  const form = createValidForm();
  form.set("company_site", "https://spam.example");

  const response = await fetch(`${baseUrl}/api/photo-request`, { method: "POST", body: form });

  assert.equal(response.status, 201);
  assert.equal(sentEmails.length, 0);
});

async function startTestServer(mailer) {
  const config = loadConfig({ NODE_ENV: "test", SMTP_FROM: "site@yandex.com" });
  const app = createApp({ config, mailer, rateLimitEnabled: false, logger: { error() {} } });
  const server = app.listen(0);
  runningServers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return { baseUrl: `http://127.0.0.1:${port}` };
}

function createValidForm(photo = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01])], { type: "image/jpeg" })) {
  const form = new FormData();
  form.set("name", "Анна");
  form.set("phone", "+7 (927) 123-45-67");
  form.set("furniture", "Диван");
  form.set("comment", "Нужна перетяжка");
  form.set("consent", "on");
  form.set("company_site", "");
  form.append("photos", photo, "sofa.jpg");
  return form;
}

