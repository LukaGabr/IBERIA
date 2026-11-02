// admin.js
// Handles admin login and live menu editing via Firebase Auth + Firestore

import { auth, db } from "../firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const loginView = document.getElementById("login-view");
const adminView = document.getElementById("admin-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const categoriesContainer = document.getElementById("categories-container");
const addCategoryBtn = document.getElementById("add-category-btn");
const statusMsg = document.getElementById("status-msg");
const importFileInput = document.getElementById("import-file-input");
const importProblems = document.getElementById("import-problems");
const importPreview = document.getElementById("import-preview");
const importBackupButton = document.getElementById("import-backup-btn");
const importBackupName = document.getElementById("import-backup-name");
const importConfirmButton = document.getElementById("import-confirm-btn");
const importCancelButton = document.getElementById("import-cancel-btn");
const importStatus = document.getElementById("import-status");

// ---------- AUTH ----------

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginView.style.display = "none";
    adminView.style.display = "block";
    loadCategories();
  } else {
    loginView.style.display = "flex";
    adminView.style.display = "none";
    resetImport(); // a signed-out page must not keep a ready-to-run import
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    loginError.textContent = "Login failed. Check your email and password.";
    console.error(error);
  }
});

logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

// ---------- LOAD & RENDER MENU ----------

async function loadCategories() {
  categoriesContainer.innerHTML = "<p>Loading menu...</p>";
  statusMsg.classList.remove("status-error");

  try {
    const menuRef = collection(db, "menu");
    const q = query(menuRef, orderBy("order"));
    const snapshot = await getDocs(q);

    categoriesContainer.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      renderCategory(docSnap.id, data);
    });
  } catch (error) {
    categoriesContainer.innerHTML = "";
    statusMsg.classList.add("status-error");
    statusMsg.textContent = "Couldn't load the menu. Refresh the page and try again.";
    console.error("Error loading menu:", error);
  }
}

// The data each card/row was loaded with, so a save keeps fields the editor
// doesn't show (and any field added later) instead of wiping them
const originalCategoryData = new WeakMap();
const originalDishData = new WeakMap();

function renderCategory(docId, data) {
  const catEl = document.createElement("div");
  catEl.className = "category-card";
  catEl.dataset.docId = docId;
  originalCategoryData.set(catEl, data);

  catEl.innerHTML = `
    <div class="category-header">
      <input type="text" class="category-name-input" placeholder="Category name">
      <input type="text" class="category-name-georgian-input" placeholder="Georgian name (optional)">
      <button class="btn-danger delete-category-btn">Delete Category</button>
    </div>
    <div class="dish-list"></div>
    <button class="btn-secondary add-dish-btn">+ Add Dish</button>
    <button class="btn-primary save-category-btn">Save Changes</button>
    <span class="save-confirm"></span>
  `;

  // Set as a DOM property, not an HTML attribute string — this sidesteps
  // HTML parsing entirely, so quote marks in the name (e.g. 12" Pizza) can't
  // break out of the attribute or inject markup.
  catEl.querySelector(".category-name-input").value = data.category;
  catEl.querySelector(".category-name-georgian-input").value = data.categoryGeorgian || "";

  const dishList = catEl.querySelector(".dish-list");
  // A category saved without an items array still opens, so dishes can be added to it
  (data.items || []).forEach((item) => {
    dishList.appendChild(renderDishRow(item));
  });

  // Add dish
  catEl.querySelector(".add-dish-btn").addEventListener("click", () => {
    dishList.appendChild(renderDishRow({ name: "", description: "" }));
  });

  // Save category
  catEl.querySelector(".save-category-btn").addEventListener("click", () => {
    saveCategory(catEl);
  });

  // Delete category
  catEl.querySelector(".delete-category-btn").addEventListener("click", () => {
    if (confirm(`Delete the entire "${data.category}" category? This cannot be undone.`)) {
      deleteCategory(docId, catEl);
    }
  });

  categoriesContainer.appendChild(catEl);
}

function renderDishRow(item) {
  const row = document.createElement("div");
  row.className = "dish-row";
  originalDishData.set(row, item);
  row.innerHTML = `
    <input type="text" class="dish-name-input" placeholder="Dish name">
    <input type="text" class="dish-name-georgian-input" placeholder="Georgian name (optional)">
    <input type="number" class="dish-price-input" placeholder="Price" min="0" step="0.01" inputmode="decimal">
    <button class="btn-danger remove-dish-btn">Remove</button>
    <textarea class="dish-desc-input" placeholder="Description"></textarea>
    <span class="dish-error" role="alert"></span>
  `;
  // Same fix as the category name above — set via DOM property, not
  // interpolated into the HTML string, so quote marks can't break out.
  row.querySelector(".dish-name-input").value = item.name || "";
  row.querySelector(".dish-desc-input").value = item.description || "";
  row.querySelector(".dish-name-georgian-input").value = item.nameGeorgian || "";
  if (Number.isFinite(item.price)) {
    row.querySelector(".dish-price-input").value = String(item.price);
  }
  row.querySelector(".remove-dish-btn").addEventListener("click", () => {
    row.remove();
  });
  return row;
}

// ---------- SAVE / DELETE ----------

const PRICE_RULE_MESSAGE = "Price must be more than 0, with at most 2 decimals, or left blank.";

// One rule for the editor and the importer: a number above 0 with at most 2 decimals.
// The cents check allows for floating-point noise (0.29 * 100 is 28.999999999999996)
function isValidPrice(priceValue) {
  if (typeof priceValue !== "number" || !Number.isFinite(priceValue) || priceValue <= 0) return false;
  const priceInCents = priceValue * 100;
  return Math.abs(priceInCents - Math.round(priceInCents)) < 1e-6;
}

// "" when the price is fine (a blank price is allowed), otherwise the message to show
function getPriceProblem(priceInput) {
  if (priceInput.validity.badInput) return PRICE_RULE_MESSAGE;
  const priceText = priceInput.value.trim();
  if (priceText === "") return "";
  return isValidPrice(Number(priceText)) ? "" : PRICE_RULE_MESSAGE;
}

// A dish built from its row, on top of the data it was loaded with.
// A blank price or Georgian name is left out rather than saved as 0 or ""
function buildDishFromRow(row) {
  const dish = {
    ...(originalDishData.get(row) || {}),
    name: row.querySelector(".dish-name-input").value.trim(),
    description: row.querySelector(".dish-desc-input").value.trim(),
  };
  const dishNameGeorgian = row.querySelector(".dish-name-georgian-input").value.trim();
  if (dishNameGeorgian) dish.nameGeorgian = dishNameGeorgian;
  else delete dish.nameGeorgian;

  const priceText = row.querySelector(".dish-price-input").value.trim();
  if (priceText === "") delete dish.price;
  else dish.price = Number(priceText);
  return dish;
}

async function saveCategory(catEl) {
  const docId = catEl.dataset.docId;
  const categoryName = catEl.querySelector(".category-name-input").value.trim();
  const confirmEl = catEl.querySelector(".save-confirm");

  const dishRows = Array.from(catEl.querySelectorAll(".dish-row"));

  // Check every price first; a bad one blocks the save and is shown on its row
  let hasInvalidPrice = false;
  dishRows.forEach((row) => {
    const priceInput = row.querySelector(".dish-price-input");
    const errorElement = row.querySelector(".dish-error");
    const priceProblem = getPriceProblem(priceInput);
    priceInput.classList.toggle("invalid", priceProblem !== "");
    errorElement.textContent = priceProblem;
    if (priceProblem) hasInvalidPrice = true;
  });
  if (hasInvalidPrice) {
    confirmEl.textContent = "❌ Fix the price errors above, then save again";
    return;
  }

  const items = dishRows
    .map((row) => buildDishFromRow(row))
    .filter((item) => item.name !== ""); // skip empty rows

  try {
    // Preserve existing order value
    const existingSnap = await getDocs(query(collection(db, "menu"), orderBy("order")));
    let order = 0;
    existingSnap.forEach((d) => {
      if (d.id === docId) order = d.data().order;
    });

    // Start from the loaded document so fields the editor doesn't show survive
    const categoryData = {
      ...(originalCategoryData.get(catEl) || {}),
      category: categoryName,
      order: order,
      items: items,
    };
    const categoryNameGeorgian = catEl.querySelector(".category-name-georgian-input").value.trim();
    if (categoryNameGeorgian) categoryData.categoryGeorgian = categoryNameGeorgian;
    else delete categoryData.categoryGeorgian;

    await setDoc(doc(db, "menu", docId), categoryData);

    confirmEl.textContent = "✔ Saved";
    setTimeout(() => (confirmEl.textContent = ""), 2000);
  } catch (error) {
    confirmEl.textContent = "❌ Error saving";
    console.error(error);
  }
}

async function deleteCategory(docId, catEl) {
  try {
    await deleteDoc(doc(db, "menu", docId));
    catEl.remove();
  } catch (error) {
    alert("Error deleting category. Check console for details.");
    console.error(error);
  }
}

// ---------- ADD NEW CATEGORY ----------

addCategoryBtn.addEventListener("click", async () => {
  const name = prompt("New category name:");
  if (!name || !name.trim()) return;

  try {
    const existingSnapshot = await getDocs(collection(db, "menu"));

    // Refuse a name that already exists (trimmed, ignoring capitals)
    const normalizedName = name.trim().toLowerCase();
    const nameAlreadyExists = existingSnapshot.docs.some(
      (existingDoc) =>
        (existingDoc.data().category || "").trim().toLowerCase() === normalizedName
    );
    if (nameAlreadyExists) {
      alert(`A category named "${name.trim()}" already exists. Choose a different name.`);
      return;
    }

    // Determine next order value
    const nextOrder = existingSnapshot.size;

    // Auto-generated document ID: can never overwrite an existing category,
    // and works for names in any alphabet (e.g. Georgian)
    const newCategoryRef = doc(collection(db, "menu"));
    await setDoc(newCategoryRef, {
      category: name.trim(),
      order: nextOrder,
      items: [],
    });
    statusMsg.textContent = `Category "${name}" created.`;
    setTimeout(() => (statusMsg.textContent = ""), 2500);
    loadCategories();
  } catch (error) {
    alert("Error creating category. Check console for details.");
    console.error(error);
  }
});

// ---------- IMPORT MENU FROM JSON ----------
// Flow: choose file -> validate -> preview (no writes) -> "Download backup" ->
// "Replace menu" -> check the live menu still matches the backup exactly ->
// one all-or-nothing batch that deletes every current category and creates
// the file's categories.

const MAX_IMPORT_OPERATIONS = 450; // Firestore allows 500 writes per batch; keep a margin

// The validated menu, the live document IDs it was previewed against, and
// (once downloaded) the backup's file name and exact snapshot of the live menu
let pendingImport = null;

function resetImport() {
  pendingImport = null;
  importFileInput.value = "";
  importProblems.replaceChildren();
  importPreview.replaceChildren();
  importBackupName.textContent = "";
  importBackupButton.disabled = true;
  importConfirmButton.disabled = true;
  importCancelButton.disabled = true;
}

// Forget the backup so "Replace menu" needs a fresh one
function requireFreshBackup() {
  if (pendingImport) pendingImport.backup = null;
  importBackupName.textContent = "";
  importConfirmButton.disabled = true;
}

// A key-order-independent fingerprint of the whole live menu (IDs and contents),
// used to prove nothing changed between the backup and the replace
function menuSnapshotKey(existingDocuments) {
  const sortKeys = (value) =>
    Array.isArray(value)
      ? value.map(sortKeys)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
        : value;
  return JSON.stringify(
    existingDocuments
      .map((existingDoc) => ({ id: existingDoc.id, data: sortKeys(existingDoc.data()) }))
      .sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0))
  );
}

const MENU_CHANGED_SINCE_PREVIEW_MESSAGE =
  "The menu changed since the preview, so nothing was changed. Click Cancel, then choose the file again.";

function setImportStatus(message, isError) {
  importStatus.textContent = message;
  importStatus.classList.toggle("status-error", isError);
}

const normalizeCategoryName = (categoryName) => categoryName.trim().toLowerCase();
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

// Returns every problem found in the parsed file (an empty list means it's valid)
function validateMenuFile(parsedMenu, existingDocumentCount) {
  const problems = [];
  if (!Array.isArray(parsedMenu)) {
    problems.push("The file must contain a list (a JSON array) of categories, not a single object or value.");
    return problems;
  }
  if (parsedMenu.length === 0) {
    problems.push("The file contains no categories.");
    return problems;
  }

  const firstPositionByName = new Map();
  const firstPositionByOrder = new Map();

  parsedMenu.forEach((category, categoryIndex) => {
    const categoryNumber = categoryIndex + 1;
    if (!isPlainObject(category)) {
      problems.push(`Category ${categoryNumber}: must be an object with "category", "order" and "items".`);
      return;
    }
    const categoryLabel = isNonEmptyString(category.category)
      ? `Category ${categoryNumber} ("${category.category.trim()}")`
      : `Category ${categoryNumber}`;

    if (!isNonEmptyString(category.category)) {
      problems.push(`${categoryLabel}: "category" (the name) is missing or empty.`);
    } else {
      const normalizedName = normalizeCategoryName(category.category);
      if (firstPositionByName.has(normalizedName)) {
        problems.push(`${categoryLabel}: duplicate category name; category ${firstPositionByName.get(normalizedName)} has the same name.`);
      } else {
        firstPositionByName.set(normalizedName, categoryNumber);
      }
    }

    if ("categoryGeorgian" in category && typeof category.categoryGeorgian !== "string") {
      problems.push(`${categoryLabel}: "categoryGeorgian" must be text if present.`);
    }

    if (!Number.isInteger(category.order)) {
      problems.push(`${categoryLabel}: "order" must be a whole number.`);
    } else if (firstPositionByOrder.has(category.order)) {
      problems.push(`${categoryLabel}: duplicate order ${category.order}; category ${firstPositionByOrder.get(category.order)} uses the same order.`);
    } else {
      firstPositionByOrder.set(category.order, categoryNumber);
    }

    if (!Array.isArray(category.items)) {
      problems.push(`${categoryLabel}: "items" must be a list of dishes.`);
      return;
    }
    if (category.items.length === 0) {
      problems.push(`${categoryLabel}: "items" is empty; a category needs at least one dish.`);
    }

    category.items.forEach((dish, dishIndex) => {
      const dishNumber = dishIndex + 1;
      if (!isPlainObject(dish)) {
        problems.push(`${categoryLabel}, dish ${dishNumber}: must be an object with "name", "description" and "price".`);
        return;
      }
      const dishLabel = isNonEmptyString(dish.name)
        ? `${categoryLabel}, dish ${dishNumber} ("${dish.name.trim()}")`
        : `${categoryLabel}, dish ${dishNumber}`;
      if (!isNonEmptyString(dish.name)) problems.push(`${dishLabel}: "name" is missing or empty.`);
      if (typeof dish.description !== "string") problems.push(`${dishLabel}: "description" must be text (it may be empty).`);
      if ("price" in dish && !isValidPrice(dish.price)) {
        problems.push(`${dishLabel}: ${PRICE_RULE_MESSAGE} Got ${JSON.stringify(dish.price)}.`);
      }
      if ("nameGeorgian" in dish && typeof dish.nameGeorgian !== "string") {
        problems.push(`${dishLabel}: "nameGeorgian" must be text if present.`);
      }
    });
  });

  const operationCount = existingDocumentCount + parsedMenu.length;
  if (operationCount > MAX_IMPORT_OPERATIONS) {
    problems.push(
      `Too many changes for one safe import: ${existingDocumentCount} current categories to delete + ${parsedMenu.length} to create = ${operationCount} (the limit is ${MAX_IMPORT_OPERATIONS}).`
    );
  }
  return problems;
}

// Only the known fields are written, with names trimmed and empty optionals left out
function buildCategoryDocument(category) {
  const categoryDocument = {
    category: category.category.trim(),
    order: category.order,
    items: category.items.map((dish) => {
      const dishDocument = { name: dish.name.trim(), description: dish.description.trim() };
      if (typeof dish.nameGeorgian === "string" && dish.nameGeorgian.trim()) dishDocument.nameGeorgian = dish.nameGeorgian.trim();
      if ("price" in dish) dishDocument.price = dish.price;
      return dishDocument;
    }),
  };
  if (typeof category.categoryGeorgian === "string" && category.categoryGeorgian.trim()) {
    categoryDocument.categoryGeorgian = category.categoryGeorgian.trim();
  }
  return categoryDocument;
}

function appendListSection(parentElement, headingText, entries, className) {
  const headingElement = document.createElement("p");
  const strongElement = document.createElement("strong");
  strongElement.textContent = headingText;
  headingElement.appendChild(strongElement);
  parentElement.appendChild(headingElement);
  const listElement = document.createElement("ul");
  if (className) listElement.className = className;
  entries.forEach((entryText) => {
    const listItem = document.createElement("li");
    listItem.textContent = entryText; // file content is shown as text, never as HTML
    listElement.appendChild(listItem);
  });
  parentElement.appendChild(listElement);
}

function showImportProblems(problems) {
  importProblems.replaceChildren();
  appendListSection(importProblems, `The file can't be imported (${problems.length} problem${problems.length === 1 ? "" : "s"}):`, problems);
}

function showImportPreview(newCategories, existingCategoryNames) {
  importPreview.replaceChildren();
  const dishCount = newCategories.reduce((total, category) => total + category.items.length, 0);
  const dishesWithoutPrice = newCategories.reduce(
    (total, category) => total + category.items.filter((dish) => !("price" in dish)).length,
    0
  );

  const summaryElement = document.createElement("p");
  summaryElement.textContent = `The file has ${newCategories.length} categories and ${dishCount} dishes. ${dishesWithoutPrice} dish${dishesWithoutPrice === 1 ? " has" : "es have"} no price.`;
  importPreview.appendChild(summaryElement);

  appendListSection(
    importPreview,
    "Categories in the file:",
    [...newCategories].sort((first, second) => first.order - second.order)
      .map((category) => `${category.category} (${category.items.length} dish${category.items.length === 1 ? "" : "es"})`)
  );

  const newNames = new Set(newCategories.map((category) => normalizeCategoryName(category.category)));
  const existingNames = new Set(existingCategoryNames.map(normalizeCategoryName));
  const addedNames = newCategories.map((category) => category.category).filter((name) => !existingNames.has(normalizeCategoryName(name)));
  const replacedNames = newCategories.map((category) => category.category).filter((name) => existingNames.has(normalizeCategoryName(name)));
  const removedNames = existingCategoryNames.filter((name) => !newNames.has(normalizeCategoryName(name)));

  appendListSection(importPreview, `Will be ADDED (${addedNames.length}):`, addedNames.length ? addedNames : ["none"]);
  appendListSection(importPreview, `Will be REPLACED (${replacedNames.length}):`, replacedNames.length ? replacedNames : ["none"]);
  appendListSection(
    importPreview,
    `Will be REMOVED (${removedNames.length})${removedNames.length ? ", these categories and their dishes will be deleted" : ""}:`,
    removedNames.length ? removedNames : ["none"],
    removedNames.length ? "removed-list" : ""
  );

  const warningElement = document.createElement("p");
  const warningStrong = document.createElement("strong");
  warningStrong.textContent = "\"Replace menu\" replaces the WHOLE menu with this file. Click \"Download backup\" first; Replace unlocks after that.";
  warningElement.appendChild(warningStrong);
  importPreview.appendChild(warningElement);
}

importFileInput.addEventListener("change", async () => {
  pendingImport = null;
  importProblems.replaceChildren();
  importPreview.replaceChildren();
  importBackupName.textContent = "";
  importBackupButton.disabled = true;
  importConfirmButton.disabled = true;
  setImportStatus("", false);
  const chosenFile = importFileInput.files[0];
  if (!chosenFile) return;
  importCancelButton.disabled = false;

  if (!auth.currentUser) {
    showImportProblems(["You're signed out. Sign in again before importing."]);
    return;
  }

  let parsedMenu;
  try {
    parsedMenu = JSON.parse(await chosenFile.text());
  } catch (error) {
    showImportProblems([`The file isn't valid JSON: ${error.message}`]);
    return;
  }

  let existingSnapshot;
  try {
    existingSnapshot = await getDocs(collection(db, "menu"));
  } catch (error) {
    console.error("Error loading the current menu for the import preview:", error);
    showImportProblems(["Couldn't load the current menu to compare against. Refresh the page and try again."]);
    return;
  }

  const problems = validateMenuFile(parsedMenu, existingSnapshot.size);
  if (problems.length > 0) {
    showImportProblems(problems);
    return;
  }

  const newCategories = parsedMenu.map(buildCategoryDocument);
  const existingCategoryNames = existingSnapshot.docs.map((existingDoc) => existingDoc.data().category || "(unnamed)");
  showImportPreview(newCategories, existingCategoryNames);
  pendingImport = {
    newCategories,
    previewedDocumentIds: existingSnapshot.docs.map((existingDoc) => existingDoc.id).sort(),
    backup: null,
  };
  importBackupButton.disabled = false; // "Replace menu" unlocks only after a backup
});

importCancelButton.addEventListener("click", () => {
  resetImport();
  setImportStatus("", false);
});

function backupFileName() {
  const now = new Date();
  const twoDigits = (number) => String(number).padStart(2, "0");
  return `iberia-menu-backup-${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}-${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}.json`;
}

// Downloads the live menu in the import format (sorted by order). Throws if it can't
function downloadMenuBackup(existingDocuments) {
  const backupMenu = existingDocuments
    .map((existingDoc) => existingDoc.data())
    .sort((first, second) => (first.order ?? 0) - (second.order ?? 0));
  const backupBlob = new Blob([JSON.stringify(backupMenu, null, 2)], { type: "application/json" });
  const backupUrl = URL.createObjectURL(backupBlob);
  const downloadLink = document.createElement("a");
  downloadLink.href = backupUrl;
  downloadLink.download = backupFileName();
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  setTimeout(() => URL.revokeObjectURL(backupUrl), 60000);
  return downloadLink.download;
}

importBackupButton.addEventListener("click", async () => {
  if (!pendingImport) return;
  if (!auth.currentUser) {
    setImportStatus("You're signed out. Sign in again before importing.", true);
    return;
  }
  requireFreshBackup();
  importBackupButton.disabled = true;

  try {
    const existingSnapshot = await getDocs(collection(db, "menu"));
    const currentDocumentIds = existingSnapshot.docs.map((existingDoc) => existingDoc.id).sort();
    if (currentDocumentIds.join("|") !== pendingImport.previewedDocumentIds.join("|")) {
      pendingImport = null; // the preview's ADDED / REMOVED lists are out of date
      setImportStatus(MENU_CHANGED_SINCE_PREVIEW_MESSAGE, true);
      return;
    }

    const fileName = downloadMenuBackup(existingSnapshot.docs);
    pendingImport.backup = { fileName, snapshotKey: menuSnapshotKey(existingSnapshot.docs) };
    importBackupName.textContent = `Saved as ${fileName} — check your Downloads folder before replacing.`;
    setImportStatus("", false);
    importConfirmButton.disabled = false;
  } catch (error) {
    console.error("Backup download failed:", error);
    setImportStatus("Couldn't create the backup file. Nothing was changed; try Download backup again.", true);
  } finally {
    importBackupButton.disabled = !pendingImport;
  }
});

importConfirmButton.addEventListener("click", async () => {
  if (!pendingImport || !pendingImport.backup) return; // a backup must come first
  if (!auth.currentUser) {
    setImportStatus("You're signed out. Sign in again before importing.", true);
    return;
  }
  importConfirmButton.disabled = true;
  importBackupButton.disabled = true;
  importCancelButton.disabled = true;
  setImportStatus("Replacing the menu…", false);

  try {
    // Re-read the live menu: it must be exactly what the backup holds
    const existingSnapshot = await getDocs(collection(db, "menu"));
    if (menuSnapshotKey(existingSnapshot.docs) !== pendingImport.backup.snapshotKey) {
      requireFreshBackup();
      setImportStatus(
        "The menu changed since your backup, so nothing was changed. Download a new backup, then click Replace menu again.",
        true
      );
      importBackupButton.disabled = false;
      importCancelButton.disabled = false;
      return;
    }

    // One all-or-nothing batch: delete everything, create the new categories
    const replaceBatch = writeBatch(db);
    existingSnapshot.docs.forEach((existingDoc) => replaceBatch.delete(existingDoc.ref));
    pendingImport.newCategories.forEach((categoryDocument) => {
      replaceBatch.set(doc(collection(db, "menu")), categoryDocument);
    });
    await replaceBatch.commit();

    const dishCount = pendingImport.newCategories.reduce((total, category) => total + category.items.length, 0);
    const categoryCount = pendingImport.newCategories.length;
    const backupName = pendingImport.backup.fileName;
    resetImport();
    setImportStatus(`Menu replaced: ${categoryCount} categories, ${dishCount} dishes. Backup: ${backupName}.`, false);
    loadCategories();
  } catch (error) {
    console.error("Menu import failed:", error);
    const reason = error && error.code === "permission-denied"
      ? "This account isn't allowed to change the menu."
      : "The import failed.";
    setImportStatus(`${reason} Nothing was changed.`, true);
    importConfirmButton.disabled = !(pendingImport && pendingImport.backup);
    importBackupButton.disabled = !pendingImport;
    importCancelButton.disabled = false;
  }
});