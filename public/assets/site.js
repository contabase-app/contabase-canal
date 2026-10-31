(function () {
  var root = document.documentElement;

  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function syncThemeButton() {
    var button = document.querySelector("[data-theme-toggle]");
    if (!button) return;
    var dark = currentTheme() === "dark";
    button.setAttribute("aria-label", dark ? "Ativar tema claro" : "Ativar tema escuro");
    button.setAttribute("aria-pressed", dark ? "true" : "false");
  }

  var themeButton = document.querySelector("[data-theme-toggle]");
  if (themeButton) {
    syncThemeButton();
    themeButton.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        window.localStorage.setItem("contabase-theme", next);
      } catch (error) {
        // The theme still applies for this page view when storage is unavailable.
      }
      syncThemeButton();
    });
  }

  function setCopyFeedback(button, label, message) {
    var labelEl = button.querySelector("[data-copy-label]");
    var statusEl = button.querySelector("[data-copy-status]");
    if (labelEl) labelEl.textContent = label;
    if (statusEl) statusEl.textContent = message;
    window.setTimeout(function () {
      if (labelEl) labelEl.textContent = "Copiar";
      if (statusEl) statusEl.textContent = "";
    }, 2200);
  }

  function fallbackCopy(text) {
    var helper = document.createElement("textarea");
    helper.className = "clipboard-helper";
    helper.value = text;
    helper.setAttribute("readonly", "");
    document.body.appendChild(helper);
    helper.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    document.body.removeChild(helper);
    return ok;
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-copy-target]");
    if (!button || button.disabled) return;
    var target = document.getElementById(button.getAttribute("data-copy-target"));
    if (!target) return;
    var text = target.textContent.trim();
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setCopyFeedback(button, "Copiado", "Comando copiado.");
      }, function () {
        var ok = fallbackCopy(text);
        setCopyFeedback(button, ok ? "Copiado" : "Falhou", ok ? "Comando copiado." : "Não foi possível copiar.");
      });
      return;
    }

    var copied = fallbackCopy(text);
    setCopyFeedback(button, copied ? "Copiado" : "Falhou", copied ? "Comando copiado." : "Não foi possível copiar.");
  });

  var mobileMenu = document.querySelector("[data-mobile-menu]");
  if (mobileMenu) {
    mobileMenu.addEventListener("click", function (event) {
      if (event.target.closest("a")) mobileMenu.removeAttribute("open");
    });
    mobileMenu.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !mobileMenu.open) return;
      mobileMenu.removeAttribute("open");
      var summary = mobileMenu.querySelector("summary");
      if (summary) summary.focus();
    });
  }

  var versionNodes = document.querySelectorAll("[data-beta-version]");
  var statusNodes = document.querySelectorAll("[data-beta-status]");
  var statusTextNodes = document.querySelectorAll("[data-beta-status-text]");
  var pinnedBlock = document.querySelector("[data-beta-pinned]");
  var pinnedCode = document.getElementById("cmd-pinned");
  var pinnedCopy = document.querySelector('[data-copy-target="cmd-pinned"]');
  var tagScriptLinks = document.querySelectorAll("[data-tag-script]");
  var tagReleaseLinks = document.querySelectorAll("[data-tag-release]");
  var tagChecksumLinks = document.querySelectorAll("[data-tag-checksums]");

  function setBetaState(text, state) {
    statusNodes.forEach(function (node) {
      node.setAttribute("data-state", state);
    });
    statusTextNodes.forEach(function (node) {
      node.textContent = text;
    });
  }

  function isBetaTag(value) {
    return typeof value === "string" && /^v\d+\.\d+\.\d+-beta\.\d+$/.test(value);
  }

  function setTagLinks(version) {
    tagScriptLinks.forEach(function (link) {
      link.href = "https://raw.githubusercontent.com/contabase-app/contabase/" + version + "/scripts/install.sh";
    });
    tagReleaseLinks.forEach(function (link) {
      link.href = "https://github.com/contabase-app/contabase/releases/tag/" + version;
    });
    tagChecksumLinks.forEach(function (link) {
      link.href = "https://github.com/contabase-app/contabase/releases/download/" + version + "/checksums.txt";
    });
  }

  function resetTagLinks() {
    tagScriptLinks.forEach(function (link) {
      link.href = "https://github.com/contabase-app/contabase/releases";
    });
    tagReleaseLinks.forEach(function (link) {
      link.href = "https://github.com/contabase-app/contabase/releases";
    });
    tagChecksumLinks.forEach(function (link) {
      link.href = "https://github.com/contabase-app/contabase/releases";
    });
  }

  if (versionNodes.length || pinnedBlock) {
    fetch("/channels/beta.json", { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (manifest) {
        var version = manifest && manifest.version;
        if (!isBetaTag(version)) throw new Error("Versão beta inválida no manifest.");
        versionNodes.forEach(function (node) {
          node.textContent = version;
        });
        setBetaState("Canal consultado agora.", "ready");
        if (pinnedBlock) pinnedBlock.hidden = false;
        if (pinnedCode) {
          pinnedCode.textContent = "curl -fsSLo /tmp/contabase-install.sh https://get-contabase.pages.dev/beta/install.sh && CONTABASE_VERSION=" + version + " bash /tmp/contabase-install.sh";
        }
        if (pinnedCopy) pinnedCopy.disabled = false;
        setTagLinks(version);
      })
      .catch(function () {
        versionNodes.forEach(function (node) {
          node.textContent = "indisponível";
        });
        setBetaState("Não foi possível consultar o canal Beta agora. Consulte as Releases para ver a versão publicada.", "error");
        if (pinnedBlock) pinnedBlock.hidden = true;
        if (pinnedCopy) pinnedCopy.disabled = true;
        resetTagLinks();
      });
  }

  var bootstrapCode = document.getElementById("bootstrap-code");
  if (bootstrapCode) {
    var bootstrapStatus = document.querySelector("[data-bootstrap-status]");
    var bootstrapStatusText = document.querySelector("[data-bootstrap-status-text]");
    var bootstrapPanel = bootstrapCode.closest("[data-bootstrap-panel]");
    if (bootstrapPanel) bootstrapPanel.setAttribute("aria-busy", "true");

    function setBootstrapError(message) {
      bootstrapCode.textContent = message;
      if (bootstrapStatus) bootstrapStatus.classList.add("is-error");
      if (bootstrapStatusText) bootstrapStatusText.textContent = "Falha ao carregar o texto.";
      if (bootstrapPanel) bootstrapPanel.setAttribute("aria-busy", "false");
    }

    fetch("/beta/install.sh", { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      })
      .then(function (text) {
        if (!text.trim()) throw new Error("Arquivo vazio.");
        bootstrapCode.textContent = text;
        bootstrapCode.setAttribute("aria-busy", "false");
        if (bootstrapStatus) bootstrapStatus.classList.remove("is-error");
        if (bootstrapStatusText) {
          bootstrapStatusText.textContent = "Texto carregado. O arquivo não é executado nesta página.";
        }
        if (bootstrapPanel) bootstrapPanel.setAttribute("aria-busy", "false");
      })
      .catch(function () {
        setBootstrapError("Não foi possível carregar o bootstrap agora.\n\nAbra o arquivo original em https://get-contabase.pages.dev/beta/install.sh");
      });
  }
})();
