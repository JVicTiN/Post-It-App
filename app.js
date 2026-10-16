(function () {
  "use strict";

  var STORAGE_KEY = "postits:v1";
  var COLORS = [
    { name: "Amarelo", hex: "#ffe66d" },
    { name: "Coral", hex: "#ff9f80" },
    { name: "Verde", hex: "#8fd6a8" },
    { name: "Azul", hex: "#8ec5f2" },
    { name: "Lilás", hex: "#d9a8f0" }
  ];

  var notes = load();
  var selecting = false;
  var selected = {};
  var current = null;
  var isNew = false;
  var history = [];
  var pos = 0;
  var dirty = false;
  var pending = null;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    board: $("board"), empty: $("empty"),
    viewBoard: $("view-board"), viewEditor: $("view-editor"),
    actionsMain: $("actions-main"), actionsSelect: $("actions-select"),
    count: $("select-count"), del: $("btn-delete"),
    text: $("text"), paper: $("paper"), swatches: $("swatches"), status: $("status"),
    undo: $("btn-undo"), redo: $("btn-redo"), save: $("btn-save")
  };

  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(data)) return data;
    } catch (e) {}
    return [
      { id: 1, text: "Comprar café e pão", color: COLORS[0].hex },
      { id: 2, text: "Ligar para o Léo sobre o projeto", color: COLORS[1].hex },
      { id: 3, text: "Ideia: app de notas com desfazer", color: COLORS[2].hex }
    ];
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {
      setStatus("Não foi possível gravar no navegador.");
    }
  }

  function nextId() {
    return notes.reduce(function (m, n) { return Math.max(m, n.id); }, 0) + 1;
  }

  function tilt(id) {
    return (((id * 37) % 5) - 2) * 0.9 + "deg";
  }

  function renderBoard() {
    el.board.innerHTML = "";
    notes.forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "note" + (selected[n.id] ? " is-selected" : "");
      b.style.background = n.color;
      b.style.setProperty("--tilt", tilt(n.id));

      var t = document.createElement("span");
      t.className = "note-text" + (n.text ? "" : " is-blank");
      t.textContent = n.text || "Nota vazia";
      b.appendChild(t);

      if (selecting) {
        b.setAttribute("aria-pressed", selected[n.id] ? "true" : "false");
        var c = document.createElement("span");
        c.className = "note-check";
        c.textContent = selected[n.id] ? "✓" : "";
        b.appendChild(c);
      }
      b.addEventListener("click", function () { onNoteClick(n); });
      el.board.appendChild(b);
    });
    el.empty.hidden = notes.length > 0;
  }

  function onNoteClick(n) {
    if (selecting) {
      selected[n.id] = !selected[n.id];
      updateSelection();
      renderBoard();
    } else {
      openEditor(n, false);
    }
  }

  function updateSelection() {
    var n = Object.keys(selected).filter(function (k) { return selected[k]; }).length;
    el.count.textContent = n + (n === 1 ? " selecionada" : " selecionadas");
    el.del.disabled = n === 0;
  }

  function setSelecting(on) {
    selecting = on;
    selected = {};
    el.actionsMain.hidden = on;
    el.actionsSelect.hidden = !on;
    updateSelection();
    renderBoard();
  }

  function showView(name) {
    el.viewBoard.hidden = name !== "board";
    el.viewEditor.hidden = name !== "editor";
    window.scrollTo(0, 0);
  }

  function setStatus(msg) { el.status.textContent = msg; }

  function openEditor(note, fresh) {
    current = { id: note.id, text: note.text, color: note.color };
    isNew = fresh;
    history = [note.text];
    pos = 0;
    dirty = false;
    clearTimeout(pending);
    pending = null;
    el.text.value = note.text;
    paintEditor();
    setStatus(fresh ? "Nota nova" : "");
    refreshButtons();
    showView("editor");
    el.text.focus();
  }

  function paintEditor() {
    el.paper.style.background = current.color;
    Array.prototype.forEach.call(el.swatches.children, function (s) {
      s.setAttribute("aria-pressed", s.dataset.hex === current.color ? "true" : "false");
    });
  }

  function refreshButtons() {
    el.undo.disabled = !(pos > 0 || pending !== null);
    el.redo.disabled = !(pos < history.length - 1 && pending === null);
    el.save.disabled = !(dirty || isNew);
  }

  function markDirty() {
    dirty = true;
    setStatus("Alterações não salvas");
  }

  function commit() {
    if (pending === null) return;
    clearTimeout(pending);
    pending = null;
    var v = el.text.value;
    if (v === history[pos]) return;
    history = history.slice(0, pos + 1);
    history.push(v);
    pos = history.length - 1;
  }

  function onInput() {
    markDirty();
    clearTimeout(pending);
    pending = setTimeout(function () { commit(); refreshButtons(); }, 450);
    refreshButtons();
  }

  function undo() {
    commit();
    if (pos > 0) {
      pos--;
      el.text.value = history[pos];
      markDirty();
    }
    refreshButtons();
  }

  function redo() {
    commit();
    if (pos < history.length - 1) {
      pos++;
      el.text.value = history[pos];
      markDirty();
    }
    refreshButtons();
  }

  function save() {
    if (el.save.disabled) return;
    commit();
    current.text = el.text.value;
    var i = notes.findIndex(function (n) { return n.id === current.id; });
    if (i >= 0) notes[i] = current;
    else notes.push(current);
    persist();
    isNew = false;
    dirty = false;
    refreshButtons();
    setStatus("Salvo");
    setTimeout(function () { showView("board"); renderBoard(); }, 350);
  }

  function back() {
    if (dirty && !window.confirm("Sair sem salvar? As alterações serão perdidas.")) return;
    showView("board");
    renderBoard();
  }

  function deleteSelected() {
    var n = Object.keys(selected).filter(function (k) { return selected[k]; }).length;
    if (!n) return;
    var msg = n === 1 ? "Excluir 1 nota?" : "Excluir " + n + " notas?";
    if (!window.confirm(msg)) return;
    notes = notes.filter(function (x) { return !selected[x.id]; });
    persist();
    setSelecting(false);
  }

  COLORS.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.style.background = c.hex;
    b.dataset.hex = c.hex;
    b.setAttribute("aria-label", c.name);
    b.addEventListener("click", function () {
      current.color = c.hex;
      paintEditor();
      markDirty();
      refreshButtons();
    });
    el.swatches.appendChild(b);
  });

  $("btn-new").addEventListener("click", function () {
    openEditor({ id: nextId(), text: "", color: COLORS[nextId() % COLORS.length].hex }, true);
  });
  $("btn-select").addEventListener("click", function () { setSelecting(true); });
  $("btn-cancel").addEventListener("click", function () { setSelecting(false); });
  el.del.addEventListener("click", deleteSelected);
  $("btn-back").addEventListener("click", back);
  el.undo.addEventListener("click", undo);
  el.redo.addEventListener("click", redo);
  el.save.addEventListener("click", save);
  el.text.addEventListener("input", onInput);

  document.addEventListener("keydown", function (e) {
    if (el.viewEditor.hidden) return;
    var mod = e.ctrlKey || e.metaKey;
    var k = e.key.toLowerCase();
    if (mod && k === "s") { e.preventDefault(); save(); }
    else if (mod && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (k === "escape") { back(); }
  });

  renderBoard();
})();
