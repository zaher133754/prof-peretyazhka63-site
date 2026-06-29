document.documentElement.classList.add("js");

const TELEGRAM_USERNAME = "sagatel_petrosyan";
const BASE_MESSAGE = "Здравствуйте! Хочу рассчитать стоимость перетяжки мебели.";
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_PHOTO_COUNT = 5;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const menuToggle = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector(".mobile-menu");

function closeMenu() {
  if (!menuToggle || !mobileMenu) return;
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Открыть меню");
  mobileMenu.classList.remove("open");
  document.body.classList.remove("menu-open");
}

if (menuToggle && mobileMenu) {
  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Открыть меню" : "Закрыть меню");
    mobileMenu.classList.toggle("open", !isOpen);
    document.body.classList.toggle("menu-open", !isOpen);
  });

  mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1180) closeMenu();
  });
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const targetId = link.getAttribute("href");
    if (!targetId || targetId === "#") return;
    const target = document.querySelector(targetId);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", targetId);
  });
});

const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.08 }
  );
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const filterButtons = document.querySelectorAll(".filter-button");
const portfolioItems = document.querySelectorAll(".portfolio-item");

filterButtons.forEach((button) => {
  button.setAttribute("aria-pressed", button.classList.contains("active") ? "true" : "false");
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    filterButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    portfolioItems.forEach((item) => {
      item.hidden = filter !== "all" && item.dataset.category !== filter;
    });
  });
});

const galleryModal = document.querySelector("#gallery-modal");
if (galleryModal) {
  const modalImage = galleryModal.querySelector("img");
  const modalCaption = galleryModal.querySelector("p");

  portfolioItems.forEach((item) => {
    item.addEventListener("click", () => {
      modalImage.src = item.dataset.full;
      modalImage.alt = item.dataset.alt || "Работа до и после";
      modalCaption.textContent = item.dataset.alt || "Работа до и после";
      galleryModal.showModal();
      document.body.classList.add("modal-open");
    });
  });

  galleryModal.querySelector(".modal-close").addEventListener("click", () => galleryModal.close());
  galleryModal.addEventListener("click", (event) => {
    if (event.target === galleryModal) galleryModal.close();
  });
  galleryModal.addEventListener("close", () => document.body.classList.remove("modal-open"));
}

document.querySelectorAll(".faq-list details").forEach((details) => {
  details.addEventListener("toggle", () => {
    if (!details.open) return;
    document.querySelectorAll(".faq-list details").forEach((other) => {
      if (other !== details) other.open = false;
    });
  });
});

function formatPhone(value) {
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits[0] === "8") digits = `7${digits.slice(1)}`;
  if (digits[0] !== "7") digits = `7${digits}`;
  digits = digits.slice(0, 11);

  let formatted = "+7";
  if (digits.length > 1) formatted += ` (${digits.slice(1, 4)}`;
  if (digits.length >= 4) formatted += ")";
  if (digits.length > 4) formatted += ` ${digits.slice(4, 7)}`;
  if (digits.length > 7) formatted += `-${digits.slice(7, 9)}`;
  if (digits.length > 9) formatted += `-${digits.slice(9, 11)}`;
  return formatted;
}

const form = document.querySelector("#request-form");
if (form) {
  const phoneInput = form.elements.phone;
  const photoInput = form.elements.photos;
  const photoPreview = form.querySelector(".photo-preview");
  const formStatus = form.querySelector(".form-status");
  let previewUrls = [];

  phoneInput.addEventListener("input", () => {
    phoneInput.value = formatPhone(phoneInput.value);
    clearFieldError(phoneInput);
  });
  phoneInput.addEventListener("blur", () => {
    if (phoneInput.value.replace(/\D/g, "") === "7") phoneInput.value = "";
  });

  form.querySelectorAll("input, select, textarea").forEach((field) => {
    field.addEventListener("change", () => clearFieldError(field));
  });

  photoInput.addEventListener("change", () => {
    clearPhotoPreviews();
    const files = [...photoInput.files];
    const photoError = validatePhotos(files);

    if (photoError) {
      showFieldError(photoInput, photoError);
      return;
    }

    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      const caption = document.createElement("figcaption");

      previewUrls.push(url);
      image.src = url;
      image.alt = "Предпросмотр выбранной фотографии";
      caption.textContent = file.name;
      figure.append(image, caption);
      photoPreview.append(figure);
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    formStatus.textContent = "";

    const name = form.elements.name;
    const furniture = form.elements.furniture;
    const consent = form.elements.consent;
    const photos = [...photoInput.files];
    const phoneDigits = phoneInput.value.replace(/\D/g, "");
    let valid = true;

    clearFormErrors(form);
    if (name.value.trim().length < 2) {
      showFieldError(name, "Укажите имя");
      valid = false;
    }
    if (phoneDigits.length !== 11 || phoneDigits[0] !== "7") {
      showFieldError(phoneInput, "Введите телефон полностью");
      valid = false;
    }
    if (!furniture.value) {
      showFieldError(furniture, "Выберите тип мебели");
      valid = false;
    }
    const photoError = validatePhotos(photos);
    if (photoError) {
      showFieldError(photoInput, photoError);
      valid = false;
    }
    if (!consent.checked) {
      showFieldError(consent, "Нужно согласие на обработку данных");
      valid = false;
    }

    if (!valid) {
      form.querySelector(".invalid")?.focus();
      formStatus.textContent = "Проверьте отмеченные поля.";
      formStatus.style.color = "var(--danger)";
      return;
    }

    const comment = form.elements.comment.value.trim();
    const message = [
      BASE_MESSAGE,
      "",
      `Имя: ${name.value.trim()}`,
      `Телефон: ${phoneInput.value}`,
      `Мебель: ${furniture.value}`,
      `Фото: ${photos.length} ${photoCountLabel(photos.length)}`,
      comment ? `Комментарий: ${comment}` : ""
    ].filter(Boolean).join("\n");

    openTelegramRequest(message, photos, formStatus);
  });

  function clearPhotoPreviews() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    photoPreview.replaceChildren();
  }
}

function validatePhotos(files) {
  if (!files.length) return "Прикрепите хотя бы одно фото";
  if (files.length > MAX_PHOTO_COUNT) return `Можно прикрепить не более ${MAX_PHOTO_COUNT} фото`;
  if (files.some((file) => !ALLOWED_PHOTO_TYPES.has(file.type))) return "Поддерживаются только JPG, PNG и WEBP";
  if (files.some((file) => file.size > MAX_PHOTO_SIZE)) return "Размер каждого фото не должен превышать 10 МБ";
  return "";
}

function photoCountLabel(count) {
  if (count === 1) return "фотография";
  if (count >= 2 && count <= 4) return "фотографии";
  return "фотографий";
}

async function openTelegramRequest(message, photos, formStatus) {
  formStatus.style.color = "var(--moss)";

  if (navigator.share && navigator.canShare?.({ files: photos })) {
    formStatus.textContent = `Выберите Telegram и чат @${TELEGRAM_USERNAME}.`;
    try {
      await navigator.share({
        title: "Заявка на расчёт перетяжки мебели",
        text: `${message}\n\nПолучатель: @${TELEGRAM_USERNAME}`,
        files: photos
      });
      formStatus.textContent = "Фото и текст переданы в Telegram. Проверьте чат и отправьте сообщение.";
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        formStatus.textContent = "Отправка отменена. Форма и выбранные фото сохранены.";
        return;
      }
    }
  }

  formStatus.textContent = "Открываем чат в Telegram. Добавьте выбранные фото кнопкой-скрепкой и отправьте сообщение.";
  window.open(`https://t.me/${TELEGRAM_USERNAME}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}

function getErrorElement(field) {
  const label = field.closest("label");
  return label?.querySelector(".field-error") || null;
}

function showFieldError(field, message) {
  field.classList.add("invalid");
  field.setAttribute("aria-invalid", "true");
  if (field.type === "file") field.closest("label")?.querySelector(".photo-picker")?.classList.add("invalid");
  const error = getErrorElement(field);
  if (error) error.textContent = message;
}

function clearFieldError(field) {
  field.classList.remove("invalid");
  field.removeAttribute("aria-invalid");
  if (field.type === "file") field.closest("label")?.querySelector(".photo-picker")?.classList.remove("invalid");
  const error = getErrorElement(field);
  if (error) error.textContent = "";
}

function clearFormErrors(targetForm) {
  targetForm.querySelectorAll(".invalid").forEach((field) => clearFieldError(field));
}

const legalModal = document.querySelector("#legal-modal");
const legalContent = legalModal?.querySelector("[data-legal-content]");
const legalTexts = {
  privacy: `
    <h2>Политика конфиденциальности</h2>
    <p>Мастерская «Проф Перетяжка 63» получает только те данные, которые посетитель добровольно указывает в форме: имя, телефон, тип мебели, фотографии и комментарий.</p>
    <h3>Для чего используются данные</h3>
    <p>Чтобы связаться с посетителем, уточнить задачу и подготовить предварительный расчёт работ. Данные не используются для автоматических рассылок и не передаются третьим лицам, кроме случаев, предусмотренных законом.</p>
    <h3>Как отозвать согласие</h3>
    <p>Для удаления данных позвоните по номеру <a href="tel:+79277680700">+7 (927) 768-07-00</a>. Обращение будет обработано в разумный срок.</p>
  `,
  consent: `
    <h2>Согласие на обработку персональных данных</h2>
    <p>Отправляя форму, пользователь добровольно соглашается на обработку указанных имени, номера телефона, типа мебели, фотографий и комментария мастерской «Проф Перетяжка 63».</p>
    <p>Цель обработки — обратная связь по заявке, консультация и предварительная оценка стоимости ремонта или перетяжки мебели. Согласие действует до достижения этой цели или до его отзыва пользователем.</p>
    <p>Отозвать согласие можно по телефону <a href="tel:+79277680700">+7 (927) 768-07-00</a>.</p>
  `
};

if (legalModal && legalContent) {
  document.querySelectorAll("[data-legal]").forEach((button) => {
    button.addEventListener("click", () => {
      legalContent.innerHTML = legalTexts[button.dataset.legal] || "";
      legalModal.showModal();
      document.body.classList.add("modal-open");
    });
  });
  legalModal.querySelector(".modal-close").addEventListener("click", () => legalModal.close());
  legalModal.addEventListener("click", (event) => {
    if (event.target === legalModal) legalModal.close();
  });
  legalModal.addEventListener("close", () => document.body.classList.remove("modal-open"));
}

const backToTop = document.querySelector(".back-to-top");
if (backToTop) {
  const updateBackToTop = () => backToTop.classList.toggle("visible", window.scrollY > 700);
  window.addEventListener("scroll", updateBackToTop, { passive: true });
  updateBackToTop();
  backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

const mobileStickyCta = document.querySelector(".mobile-sticky-cta");
const heroPrimaryCta = document.querySelector(".hero-buttons .button-accent");
const requestSection = document.querySelector("#request");
if (mobileStickyCta && heroPrimaryCta && requestSection && "IntersectionObserver" in window) {
  let heroCtaVisible = true;
  let requestVisible = false;

  const updateStickyCta = () => {
    mobileStickyCta.classList.toggle("visible", !heroCtaVisible && !requestVisible && window.scrollY > 120);
  };

  const stickyObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.target === heroPrimaryCta) heroCtaVisible = entry.isIntersecting;
        if (entry.target === requestSection) requestVisible = entry.isIntersecting;
      });
      updateStickyCta();
    },
    { threshold: 0.15 }
  );
  stickyObserver.observe(heroPrimaryCta);
  stickyObserver.observe(requestSection);
}

const year = document.querySelector("#current-year");
if (year) year.textContent = new Date().getFullYear();
