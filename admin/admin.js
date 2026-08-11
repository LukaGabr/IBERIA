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
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const loginView = document.getElementById("login-view");
const adminView = document.getElementById("admin-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const categoriesContainer = document.getElementById("categories-container");
const addCategoryBtn = document.getElementById("add-category-btn");
const statusMsg = document.getElementById("status-msg");

// ---------- AUTH ----------

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginView.style.display = "none";
    adminView.style.display = "block";
    loadCategories();
  } else {
    loginView.style.display = "flex";
    adminView.style.display = "none";
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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function loadCategories() {
  categoriesContainer.innerHTML = "<p>Loading menu...</p>";

  const menuRef = collection(db, "menu");
  const q = query(menuRef, orderBy("order"));
  const snapshot = await getDocs(q);

  categoriesContainer.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    renderCategory(docSnap.id, data);
  });
}

function renderCategory(docId, data) {
  const catEl = document.createElement("div");
  catEl.className = "category-card";
  catEl.dataset.docId = docId;

  catEl.innerHTML = `
    <div class="category-header">
      <input type="text" class="category-name-input" value="${escapeHtml(data.category)}">
      <button class="btn-danger delete-category-btn">Delete Category</button>
    </div>
    <div class="dish-list"></div>
    <button class="btn-secondary add-dish-btn">+ Add Dish</button>
    <button class="btn-primary save-category-btn">Save Changes</button>
    <span class="save-confirm"></span>
  `;

  const dishList = catEl.querySelector(".dish-list");
  data.items.forEach((item) => {
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
  row.innerHTML = `
    <input type="text" class="dish-name-input" placeholder="Dish name" value="${escapeHtml(item.name)}">
    <textarea class="dish-desc-input" placeholder="Description">${escapeHtml(item.description)}</textarea>
    <button class="btn-danger remove-dish-btn">Remove</button>
  `;
  row.querySelector(".remove-dish-btn").addEventListener("click", () => {
    row.remove();
  });
  return row;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---------- SAVE / DELETE ----------

async function saveCategory(catEl) {
  const docId = catEl.dataset.docId;
  const categoryName = catEl.querySelector(".category-name-input").value.trim();
  const confirmEl = catEl.querySelector(".save-confirm");

  const dishRows = catEl.querySelectorAll(".dish-row");
  const items = Array.from(dishRows)
    .map((row) => ({
      name: row.querySelector(".dish-name-input").value.trim(),
      description: row.querySelector(".dish-desc-input").value.trim(),
    }))
    .filter((item) => item.name !== ""); // skip empty rows

  try {
    // Preserve existing order value
    const existingSnap = await getDocs(query(collection(db, "menu"), orderBy("order")));
    let order = 0;
    existingSnap.forEach((d) => {
      if (d.id === docId) order = d.data().order;
    });

    await setDoc(doc(db, "menu", docId), {
      category: categoryName,
      order: order,
      items: items,
    });

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

  const docId = slugify(name);

  // Determine next order value
  const existingSnap = await getDocs(collection(db, "menu"));
  const nextOrder = existingSnap.size;

  try {
    await setDoc(doc(db, "menu", docId), {
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