(function () {
  "use strict";

  // Preencha os dois valores abaixo usando o painel do Supabase.
  var SUPABASE_URL = "https://whnqacjhhtldoulrjgbe.supabase.co";
  var SUPABASE_KEY = "sb_publishable_llwHZoc-ikKsUTp7D6GxkQ_D0yYbkKO";
  var TABLE_URL = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/postits";
  var configured = SUPABASE_URL.startsWith("https://") && SUPABASE_KEY.startsWith("sb_publishable_");
  var busy = false;

  async function request(path, options) {
    options = options || {};
    var response = await fetch(TABLE_URL + path, {
      method: options.method || "GET",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    if (!response.ok) {
      var details = await response.text();
      throw new Error("Supabase (" + response.status + "): " + details);
    }
    if (response.status === 204) return [];
    return response.json();
  }

  function reportError(error) {
    console.error(error);
    window.alert("Não foi possível comunicar com o banco. Confira a conexão e as configurações do Supabase.\n\n" + error.message);
  }

  var COLORS = [
    { name: "Amarelo", hex: "#ffe66d" },
    { name: "Coral", hex: "#ff9f80" },
    { name: "Verde", hex: "#8fd6a8" },
    { name: "Azul", hex: "#8ec5f2" },
    { name: "Lilás", hex: "#d9a8f0" }
  ];

  var notes = [];
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

  async function load() {
    if (!configured) {
      el.empty.textContent = "Configure a URL e a publishable key do Supabase no arquivo app.js.";
      el.empty.hidden = false;
      el.board.innerHTML = "";
      $("btn-new").disabled = true;
      $("btn-select").disabled = true;
      return;
    }
    el.empty.textContent = "Carregando notas do banco...";
    el.empty.hidden = false;
    try {
      notes = await request("?select=id,text,color&order=id.asc");
      $("btn-new").disabled = false;
      $("btn-select").disabled = false;
      renderBoard();
    } catch (error) {
      el.empty.textContent = "Não foi possível carregar as notas. Verifique o console (F12).";
      el.empty.hidden = false;
      reportError(error);
    }
  }

  function setBusy(value) {
    busy = value;
    el.save.disabled = value;
    el.del.disabled = value || !Object.keys(selected).some(function (k) { return selected[k]; });
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
    el.save.disabled = busy || !(dirty || isNew);
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

  async function save() {
    if (el.save.disabled || busy) return;
    commit();
    current.text = el.text.value;
    setBusy(true);
    setStatus("Salvando no banco...");
    try {
      var saved;
      if (isNew) {
        saved = await request("?select=id,text,color", {
          method: "POST", body: { text: current.text, color: current.color }
        });
      } else {
        saved = await request("?id=eq." + encodeURIComponent(current.id) + "&select=id,text,color", {
          method: "PATCH", body: { text: current.text, color: current.color }
        });
      }
      if (!saved.length) throw new Error("Nenhuma nota foi gravada. Verifique as políticas RLS.");
      current = saved[0];
      var i = notes.findIndex(function (n) { return n.id === current.id; });
      if (i >= 0) notes[i] = current;
      else notes.push(current);
      isNew = false;
      dirty = false;
      setStatus("Salvo no banco!");
      showView("board");
      renderBoard();
    } catch (error) {
      setStatus("Erro ao salvar. Tente novamente.");
      reportError(error);
    } finally {
      setBusy(false);
      refreshButtons();
    }
  }

  function back() {
    if (dirty && !window.confirm("Sair sem salvar? As alterações serão perdidas.")) return;
    showView("board");
    renderBoard();
  }

  async function deleteSelected() {
    if (busy) return;
    var ids = Object.keys(selected).filter(function (k) { return selected[k]; }).map(Number);
    if (!ids.length) return;
    var msg = ids.length === 1 ? "Excluir 1 nota?" : "Excluir " + ids.length + " notas?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      var deleted = await request("?id=in.(" + ids.join(",") + ")&select=id", { method: "DELETE" });
      if (deleted.length !== ids.length) throw new Error("Nem todas as notas puderam ser excluídas. Recarregue o mural.");
      notes = notes.filter(function (x) { return !ids.includes(x.id); });
      setSelecting(false);
    } catch (error) {
      reportError(error);
      await load();
      setSelecting(false);
    } finally {
      setBusy(false);
    }
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
    openEditor({ id: null, text: "", color: COLORS[notes.length % COLORS.length].hex }, true);
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

  load();
})();
