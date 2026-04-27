// ============================================================
//  app.js — Project Tasks  (updated with Sudoku, Notes, Chatbot)
// ============================================================

// ── 1. SUPABASE SETUP ────────────────────────────────────────
const SUPABASE_URL     = "https://kylwawpednkiwvyvjjfa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5bHdhd3BlZG5raXd2eXZqamZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MjY4MTksImV4cCI6MjA5MjEwMjgxOX0.PsyoCp3QapZTFyDvimIUZ3YijZsE4vsisIv8tVKjJCI";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 2. TASKS STATE ───────────────────────────────────────────
let tasks         = [];
let currentFilter = "all";
let editingId     = null;

// ── 3. BOOT ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  setTodayDate();
  await loadTasks();
  setupEnterKey();
  initSudoku();
  initNotes();
  initChatbot();
});

function setTodayDate() {
  const el = document.getElementById("today-date");
  el.textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric"
  });
}

function setupEnterKey() {
  document.getElementById("task-input").addEventListener("keydown", e => {
    if (e.key === "Enter") addTask();
  });
  // Chat enter key
  document.getElementById("chat-input").addEventListener("keydown", e => {
    if (e.key === "Enter") sendChatMessage();
  });
}

// ── 4. LOAD TASKS ────────────────────────────────────────────
async function loadTasks() {
  const { data, error } = await db
    .from("tasks").select("*").order("created_at", { ascending: false });
  if (error) {
    showToast("⚠ Could not load tasks. Check Supabase config.");
    console.error("Supabase load error:", error.message);
    return;
  }
  tasks = data || [];
  renderAll();
}

// ── 5. ADD TASK ───────────────────────────────────────────────
async function addTask() {
  const input    = document.getElementById("task-input");
  const priority = document.getElementById("priority-select").value;
  const text     = input.value.trim();
  const errorEl  = document.getElementById("input-error");

  if (!text) {
    errorEl.textContent = "Please enter a task before adding.";
    input.focus();
    return;
  }
  errorEl.textContent = "";

  const newTask = { text, priority, completed: false };
  const { data, error } = await db.from("tasks").insert([newTask]).select().single();

  if (error) {
    showToast("⚠ Could not add task.");
    console.error("Insert error:", error.message);
    return;
  }

  tasks.unshift(data);
  input.value = "";
  renderAll();
  showToast("Task added ✓");
}

// ── 6. TOGGLE COMPLETE ────────────────────────────────────────
async function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const newStatus = !task.completed;
  const { error } = await db.from("tasks").update({ completed: newStatus }).eq("id", id);

  if (error) {
    showToast("⚠ Could not update task.");
    console.error("Update error:", error.message);
    return;
  }

  task.completed = newStatus;
  renderAll();
  showToast(newStatus ? "Marked as complete ✓" : "Marked as pending");
}

// ── 7. EDIT MODAL ─────────────────────────────────────────────
function openEdit(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  editingId = id;
  document.getElementById("modal-input").value = task.text;
  document.getElementById("modal-priority").innerHTML = ["low","medium","high"].map(p =>
    `<option value="${p}" ${task.priority === p ? "selected" : ""}>${capitalize(p)}</option>`
  ).join("");

  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-input").focus();
}

async function saveEdit() {
  const newText     = document.getElementById("modal-input").value.trim();
  const newPriority = document.getElementById("modal-priority").value;
  if (!newText) return;

  const { error } = await db.from("tasks").update({ text: newText, priority: newPriority }).eq("id", editingId);
  if (error) { showToast("⚠ Could not save edit."); return; }

  const task = tasks.find(t => t.id === editingId);
  if (task) { task.text = newText; task.priority = newPriority; }

  closeModalDirect();
  renderAll();
  showToast("Task updated ✓");
}

function closeModal(e) {
  if (e.target === document.getElementById("modal-overlay")) closeModalDirect();
}
function closeModalDirect() {
  document.getElementById("modal-overlay").classList.add("hidden");
  editingId = null;
}

// ── 8. DELETE TASK ────────────────────────────────────────────
async function deleteTask(id) {
  const { error } = await db.from("tasks").delete().eq("id", id);
  if (error) { showToast("⚠ Could not delete task."); return; }

  tasks = tasks.filter(t => t.id !== id);
  renderAll();
  showToast("Task deleted");
}

// ── 9. CLEAR COMPLETED ───────────────────────────────────────
async function clearCompleted() {
  const completed = tasks.filter(t => t.completed);
  if (completed.length === 0) { showToast("No completed tasks to clear."); return; }

  const ids = completed.map(t => t.id);
  const { error } = await db.from("tasks").delete().in("id", ids);
  if (error) { showToast("⚠ Could not clear tasks."); return; }

  tasks = tasks.filter(t => !t.completed);
  renderAll();
  showToast(`Cleared ${ids.length} completed task${ids.length > 1 ? "s" : ""}`);
}

// ── 10. FILTER ────────────────────────────────────────────────
function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });
  renderAll();
}

// ── 11. RENDER ────────────────────────────────────────────────
function renderAll() { updateStats(); renderList(); }

function updateStats() {
  const total   = tasks.length;
  const done    = tasks.filter(t => t.completed).length;
  const pending = total - done;
  const pct     = total === 0 ? 0 : Math.round((done / total) * 100);

  document.getElementById("stat-total").textContent   = total;
  document.getElementById("stat-done").textContent    = done;
  document.getElementById("stat-pending").textContent = pending;
  document.getElementById("ring-pct").textContent     = pct + "%";
  document.getElementById("ring-fill").setAttribute("stroke-dasharray", `${pct} ${100 - pct}`);
}

function renderList() {
  const list  = document.getElementById("task-list");
  const empty = document.getElementById("empty-state");

  const visible = tasks.filter(t => {
    if (currentFilter === "pending") return !t.completed;
    if (currentFilter === "done")    return  t.completed;
    return true;
  });

  if (visible.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = visible.map(task => buildTaskHTML(task)).join("");
}

function buildTaskHTML(task) {
  const dateStr = new Date(task.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric"
  });
  const priorityBadge = task.completed
    ? `<span class="badge badge-done">Done</span>`
    : `<span class="badge badge-${task.priority}">${capitalize(task.priority)}</span>`;

  return `
    <div class="task-item priority-${task.priority} ${task.completed ? "completed" : ""}" id="task-${task.id}">
      <input type="checkbox" class="task-checkbox" ${task.completed ? "checked" : ""}
        onchange="toggleTask('${task.id}')" title="Toggle complete"/>
      <div class="task-body">
        <div class="task-text">${escapeHTML(task.text)}</div>
        <div class="task-meta">${priorityBadge}<span class="task-date">Added ${dateStr}</span></div>
      </div>
      <div class="task-actions">
        <button class="btn-icon" onclick="openEdit('${task.id}')" title="Edit task">✎</button>
        <button class="btn-icon del" onclick="deleteTask('${task.id}')" title="Delete task">✕</button>
      </div>
    </div>`;
}

// ── 12. HELPERS ───────────────────────────────────────────────
function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}


// ════════════════════════════════════════════════════════════════
//  ── SUDOKU ──
// ════════════════════════════════════════════════════════════════

const sudoku = {
  puzzle:     [],   // original puzzle (0 = empty)
  solution:   [],   // solved board
  board:      [],   // user's current board
  selected:   null, // { row, col }
  timer:      0,
  interval:   null,
  difficulty: "medium",
  mistakes:   0
};

// ── Initialise on page load
function initSudoku() {
  buildSudokuNumpad();
  newSudokuGame();
  // Arrow key + number key support
  document.addEventListener("keydown", handleSudokuKey);
}

// ── Toggle collapse/expand
function toggleRestZone() {
  const content = document.getElementById("rest-content");
  const btn     = document.getElementById("rest-toggle-btn");
  const collapsed = content.classList.toggle("collapsed");
  btn.textContent = collapsed ? "▼ Expand" : "▲ Collapse";
}

// ── Start fresh game
function newSudokuGame() {
  clearInterval(sudoku.interval);
  sudoku.timer    = 0;
  sudoku.mistakes = 0;
  updateSudokuTimer();
  document.getElementById("sudoku-mistakes").textContent = 0;
  document.getElementById("sudoku-message").classList.add("hidden");

  generateSudokuPuzzle(sudoku.difficulty);
  renderSudokuGrid();

  sudoku.interval = setInterval(() => {
    sudoku.timer++;
    updateSudokuTimer();
  }, 1000);
}

// ── Change difficulty and restart
function setSudokuDifficulty(diff) {
  sudoku.difficulty = diff;
  document.querySelectorAll(".diff-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.diff === diff);
  });
  newSudokuGame();
}

// ── Timer display
function updateSudokuTimer() {
  const m = Math.floor(sudoku.timer / 60).toString().padStart(2, "0");
  const s = (sudoku.timer % 60).toString().padStart(2, "0");
  document.getElementById("sudoku-timer").textContent = `${m}:${s}`;
}

// ── Puzzle generation ─────────────────────────────────────────
function generateSudokuPuzzle(difficulty) {
  // 1. Create a fully solved board
  const sol = Array.from({ length: 9 }, () => Array(9).fill(0));
  fillSudokuBoard(sol);
  sudoku.solution = sol.map(r => [...r]);

  // 2. Remove cells to create the puzzle
  const removals = { easy: 34, medium: 45, hard: 54 }[difficulty] || 45;
  const puz = sol.map(r => [...r]);

  // Shuffle all cell positions and blank out 'removals' of them
  const cells = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) cells.push([r, c]);
  cells.sort(() => Math.random() - 0.5);

  for (let i = 0; i < removals; i++) {
    const [r, c] = cells[i];
    puz[r][c] = 0;
  }

  sudoku.puzzle   = puz;
  sudoku.board    = puz.map(r => [...r]);
  sudoku.selected = null;
}

// Backtracking solver (with randomised number order for variety)
function fillSudokuBoard(board) {
  const pos = findEmptySudokuCell(board);
  if (!pos) return true; // Solved!

  const [r, c] = pos;
  const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);

  for (const n of nums) {
    if (isSudokuValid(board, r, c, n)) {
      board[r][c] = n;
      if (fillSudokuBoard(board)) return true;
      board[r][c] = 0;
    }
  }
  return false;
}

function findEmptySudokuCell(board) {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (board[r][c] === 0) return [r, c];
  return null;
}

function isSudokuValid(board, row, col, num) {
  // Check row
  if (board[row].includes(num)) return false;
  // Check column
  for (let r = 0; r < 9; r++) if (board[r][col] === num) return false;
  // Check 3x3 box
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++)
      if (board[r][c] === num) return false;
  return true;
}

// ── Render grid ───────────────────────────────────────────────
function renderSudokuGrid() {
  const grid = document.getElementById("sudoku-grid");
  grid.innerHTML = "";

  const sel = sudoku.selected;
  const selVal = sel ? sudoku.board[sel.row][sel.col] : 0;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell    = document.createElement("div");
      cell.className = "sudoku-cell";
      cell.dataset.row = r;
      cell.dataset.col = c;

      const val     = sudoku.board[r][c];
      const isGiven = sudoku.puzzle[r][c] !== 0;

      if (val !== 0) cell.textContent = val;
      if (isGiven)   cell.classList.add("given");

      // Box border emphasis (thicker lines between 3x3 boxes)
      if (c === 2 || c === 5) cell.classList.add("box-right");
      if (r === 2 || r === 5) cell.classList.add("box-bottom");

      // Selection highlighting
      if (sel) {
        const sameBox =
          Math.floor(r / 3) === Math.floor(sel.row / 3) &&
          Math.floor(c / 3) === Math.floor(sel.col / 3);

        if (r === sel.row && c === sel.col) {
          cell.classList.add("selected");
        } else if (r === sel.row || c === sel.col || sameBox) {
          cell.classList.add("highlighted");
        }

        // Highlight same numbers
        if (val !== 0 && selVal !== 0 && val === selVal &&
            !(r === sel.row && c === sel.col)) {
          cell.classList.add("same-num");
        }
      }

      // Error: user placed a wrong digit
      if (val !== 0 && !isGiven && val !== sudoku.solution[r][c]) {
        cell.classList.add("error");
      }

      cell.addEventListener("click", () => selectSudokuCell(r, c));
      grid.appendChild(cell);
    }
  }
}

// ── Build numpad ──────────────────────────────────────────────
function buildSudokuNumpad() {
  const numpad = document.getElementById("sudoku-numpad");
  numpad.innerHTML = "";

  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement("button");
    btn.className   = "numpad-btn";
    btn.textContent = n;
    btn.addEventListener("click", () => enterSudokuNumber(n));
    numpad.appendChild(btn);
  }

  const erase = document.createElement("button");
  erase.className   = "numpad-btn erase-btn";
  erase.textContent = "⌫";
  erase.addEventListener("click", () => enterSudokuNumber(0));
  numpad.appendChild(erase);
}

// ── Select cell ───────────────────────────────────────────────
function selectSudokuCell(r, c) {
  sudoku.selected = { row: r, col: c };
  renderSudokuGrid();
}

// ── Enter a number ────────────────────────────────────────────
function enterSudokuNumber(num) {
  if (!sudoku.selected) return;
  const { row, col } = sudoku.selected;
  if (sudoku.puzzle[row][col] !== 0) return; // given cell, can't change

  sudoku.board[row][col] = num;

  // Track mistakes
  if (num !== 0 && num !== sudoku.solution[row][col]) {
    sudoku.mistakes++;
    document.getElementById("sudoku-mistakes").textContent = sudoku.mistakes;
  }

  renderSudokuGrid();
  checkSudokuComplete();
}

// ── Check if puzzle is solved ─────────────────────────────────
function checkSudokuComplete() {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (sudoku.board[r][c] !== sudoku.solution[r][c]) return;

  clearInterval(sudoku.interval);
  const timeStr = document.getElementById("sudoku-timer").textContent;
  const msg = document.getElementById("sudoku-message");
  msg.innerHTML = `🎉 Puzzle solved in <strong>${timeStr}</strong> with <strong>${sudoku.mistakes}</strong> mistake${sudoku.mistakes !== 1 ? "s" : ""}! Great job!`;
  msg.classList.remove("hidden");
}

// ── Keyboard input ────────────────────────────────────────────
function handleSudokuKey(e) {
  // Only act if a sudoku cell is selected
  if (!sudoku.selected) return;

  const n = parseInt(e.key);
  if (n >= 1 && n <= 9) { enterSudokuNumber(n); return; }
  if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
    enterSudokuNumber(0);
    return;
  }

  const { row, col } = sudoku.selected;
  if (e.key === "ArrowUp"    && row > 0) selectSudokuCell(row - 1, col);
  if (e.key === "ArrowDown"  && row < 8) selectSudokuCell(row + 1, col);
  if (e.key === "ArrowLeft"  && col > 0) selectSudokuCell(row, col - 1);
  if (e.key === "ArrowRight" && col < 8) selectSudokuCell(row, col + 1);
}


// ════════════════════════════════════════════════════════════════
//  ── DAILY NOTES (Day 1 – Day 7) ──
// ════════════════════════════════════════════════════════════════

let activeNoteDay  = 1;
let noteSaveTimer  = null;

function initNotes() {
  renderDayTabs();
  loadDayNote(1);
}

// ── Render 7 day tabs ─────────────────────────────────────────
function renderDayTabs() {
  const wrap = document.getElementById("day-tabs");
  wrap.innerHTML = "";

  for (let d = 1; d <= 7; d++) {
    const done = localStorage.getItem(`note_day_${d}_done`) === "true";
    const btn  = document.createElement("button");
    btn.className = `day-tab${d === activeNoteDay ? " active" : ""}${done ? " day-done" : ""}`;
    btn.dataset.day = d;
    btn.textContent = `Day ${d}${done ? " ✓" : ""}`;
    btn.addEventListener("click", () => switchNoteDay(d));
    wrap.appendChild(btn);
  }
}

// ── Switch between days ───────────────────────────────────────
function switchNoteDay(day) {
  if (day === activeNoteDay) return;
  autoSaveNote(); // save the current day before switching
  activeNoteDay = day;
  loadDayNote(day);
  renderDayTabs();
}

// ── Load a day's note into the editor ─────────────────────────
function loadDayNote(day) {
  const text = localStorage.getItem(`note_day_${day}`) || "";
  const done = localStorage.getItem(`note_day_${day}_done`) === "true";

  document.getElementById("note-textarea").value       = text;
  document.getElementById("note-day-checkbox").checked = done;
  document.getElementById("active-day-label").textContent = `Day ${day} Notes`;
  updateCharCount();

  // Update tab highlighting
  document.querySelectorAll(".day-tab").forEach(t => {
    t.classList.toggle("active", parseInt(t.dataset.day) === day);
  });
}

// ── Auto-save (debounced 1s after typing stops) ───────────────
function onNoteInput() {
  updateCharCount();
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(autoSaveNote, 1000);
}

function autoSaveNote() {
  const text = document.getElementById("note-textarea").value;
  localStorage.setItem(`note_day_${activeNoteDay}`, text);
}

// ── Manual save button ────────────────────────────────────────
function saveNote() {
  autoSaveNote();
  showToast(`Day ${activeNoteDay} notes saved ✓`);
}

// ── Clear current note ────────────────────────────────────────
function clearCurrentNote() {
  if (!confirm(`Clear all notes for Day ${activeNoteDay}?`)) return;
  document.getElementById("note-textarea").value = "";
  autoSaveNote();
  updateCharCount();
  showToast(`Day ${activeNoteDay} notes cleared`);
}

// ── Toggle day complete checkbox ──────────────────────────────
function toggleDayComplete() {
  const done = document.getElementById("note-day-checkbox").checked;
  localStorage.setItem(`note_day_${activeNoteDay}_done`, done.toString());
  renderDayTabs();
  showToast(done
    ? `Day ${activeNoteDay} marked complete ✓`
    : `Day ${activeNoteDay} marked incomplete`
  );
}

// ── Character counter ─────────────────────────────────────────
function updateCharCount() {
  const len = document.getElementById("note-textarea").value.length;
  document.getElementById("note-char-count").textContent = `${len} / 2000 characters`;
}


// ════════════════════════════════════════════════════════════════
//  ── AI CHATBOT ──
// ════════════════════════════════════════════════════════════════

// Your Anthropic API key is stored only in sessionStorage (cleared when tab closes).
// To get a key: https://console.anthropic.com → API Keys → Create key.
let chatHistory = [];  // [{ role: 'user'|'assistant', content: string }]
let chatApiKey  = sessionStorage.getItem("anthropic_key") || "";
let isChatting  = false;

const CHAT_SYSTEM_PROMPT = `You are a knowledgeable, friendly AI assistant embedded in a productivity and task manager app. 
Your role is to help users with any questions they have.

When users ask about physical activities (jogging, yoga, gym, swimming, cycling, etc.), always provide:
1. A warm, encouraging introduction
2. Key benefits (health, mental, physical)
3. A structured progress plan broken into: Beginner (Week 1–2), Intermediate (Week 3–4), Advanced (Week 5+)
4. Practical getting-started tips
5. Safety and recovery advice

For other topics (science, study, productivity, nutrition, habits, technology, etc.):
- Give comprehensive, well-structured answers
- Use clear sections and bullet points where helpful  
- Be encouraging, positive, and practical

Keep responses friendly, clear, and actionable. Use markdown formatting (bold, bullets, headers) where it aids readability.`;

// ── Initialise chatbot ────────────────────────────────────────
function initChatbot() {
  if (chatApiKey) {
    // Key already in session — hide the prompt and show welcome
    document.getElementById("api-key-prompt").classList.add("hidden");
    addWelcomeMessage();
  } else {
    // Show key prompt, hide empty chat area
  }
}

// ── Set API key from the input field ─────────────────────────
function setApiKey() {
  const key = document.getElementById("api-key-input").value.trim();
  if (!key) {
    showToast("⚠ Please paste your API key first.");
    return;
  }
  chatApiKey = key;
  sessionStorage.setItem("anthropic_key", key);
  document.getElementById("api-key-prompt").classList.add("hidden");
  addWelcomeMessage();
  showToast("AI assistant activated ✓");
}

// ── Welcome message shown when chatbot is activated ───────────
function addWelcomeMessage() {
  const container = document.getElementById("chat-messages");
  container.innerHTML = "";

  appendBubble("assistant",
    `👋 **Hi there!** I'm your AI assistant, powered by Claude.\n\n` +
    `Ask me anything — jogging plans, science explanations, study strategies, productivity tips, or any topic you're curious about. I'll give you detailed, helpful information!\n\n` +
    `Try one of the suggestions below, or type your own question.`
  );
}

// ── Send a message ────────────────────────────────────────────
async function sendChatMessage() {
  if (!chatApiKey) {
    showToast("⚠ Please enter your API key to use the chatbot.");
    document.getElementById("api-key-prompt").classList.remove("hidden");
    return;
  }
  if (isChatting) return; // Prevent double-sending

  const input = document.getElementById("chat-input");
  const text  = input.value.trim();
  if (!text) return;

  input.value = "";
  isChatting  = true;

  // Hide suggestion chips once user starts chatting
  document.getElementById("chat-suggestions").classList.add("hidden");

  // Show user's message
  appendBubble("user", text);
  chatHistory.push({ role: "user", content: text });

  // Show typing indicator
  showTypingIndicator();

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": chatApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-client-side-api-key-access": "true"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: CHAT_SYSTEM_PROMPT,
        messages: chatHistory.slice(-14) // Keep last 14 messages for context
      })
    });

    removeTypingIndicator();

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${response.status}`;
      throw new Error(msg);
    }

    const data  = await response.json();
    const reply = data.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    chatHistory.push({ role: "assistant", content: reply });
    appendBubble("assistant", reply);

  } catch (err) {
    removeTypingIndicator();
    appendBubble("assistant",
      `⚠ **Error:** ${err.message}\n\nPlease check that your API key is correct and try again.`
    );
    console.error("Chatbot error:", err);
  }

  isChatting = false;
}

// ── Use a suggestion chip ─────────────────────────────────────
function useSuggestion(btn) {
  const text = btn.textContent.replace(/^[^\s]+\s/, ""); // strip emoji
  document.getElementById("chat-input").value = text;
  sendChatMessage();
}

// ── Append a chat bubble ──────────────────────────────────────
function appendBubble(role, rawText) {
  const container = document.getElementById("chat-messages");
  const wrapper   = document.createElement("div");
  wrapper.className = `chat-message ${role === "user" ? "user-msg" : "assistant-msg"}`;

  const bubble  = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML = renderMarkdown(rawText);

  const time    = document.createElement("span");
  time.className = "msg-time";
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  wrapper.appendChild(bubble);
  wrapper.appendChild(time);
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

// ── Typing indicator ──────────────────────────────────────────
function showTypingIndicator() {
  const container = document.getElementById("chat-messages");
  const wrapper   = document.createElement("div");
  wrapper.className = "chat-message assistant-msg typing-indicator";
  wrapper.id        = "typing-indicator";
  wrapper.innerHTML = `<div class="msg-bubble">
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  </div>`;
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById("typing-indicator")?.remove();
}

// ── Minimal markdown → HTML renderer ─────────────────────────
function renderMarkdown(text) {
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // H3 headers
    .replace(/^### (.*$)/gm, "<h4>$1</h4>")
    .replace(/^## (.*$)/gm,  "<h3>$1</h3>")
    .replace(/^# (.*$)/gm,   "<h3>$1</h3>")
    // Bullet lists — group consecutive lines
    .replace(/(^[-•] .+\n?)+/gm, match => {
      const items = match.trim().split("\n")
        .map(l => `<li>${l.replace(/^[-•] /, "")}</li>`).join("");
      return `<ul>${items}</ul>`;
    })
    // Numbered lists
    .replace(/(^\d+\. .+\n?)+/gm, match => {
      const items = match.trim().split("\n")
        .map(l => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("");
      return `<ol>${items}</ol>`;
    })
    // Double newline → paragraph break
    .replace(/\n\n/g, "<br><br>")
    // Single newline → line break
    .replace(/\n/g, "<br>");
}
