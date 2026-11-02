(function () {
  function track(name) {
    if (!name) return;
    if (window.umami && typeof window.umami.track === "function") {
      window.umami.track(name);
    }
  }

  function cleanLabel(value) {
    return (value || "").replace(/\s+/g, " ").trim().slice(0, 60);
  }

  var sectionNames = {
    top: "Hero",
    recursos: "Recursos",
    telas: "Telas",
    instalacao: "Instalação",
    transparencia: "Transparência",
    ajuda: "Ajuda",
    faq: "FAQ"
  };

  function linkPrefix(link) {
    var section = link.closest("section[id]");
    if (section) return sectionNames[section.id] || section.id;
    if (link.closest("header")) return "Header";
    if (link.closest("footer")) return "Footer";
    return "Site";
  }

  document.addEventListener("click", function (event) {
    var tracked = event.target.closest("[data-track]");
    if (tracked) {
      track(tracked.getAttribute("data-track"));
      return;
    }

    var link = event.target.closest("a[href]");
    if (!link || link.classList.contains("skip-link")) return;
    var label = link.getAttribute("aria-label") || link.textContent;
    track("Click " + linkPrefix(link) + " - " + cleanLabel(label));
  });

  document.addEventListener("click", function (event) {
    var box = event.target.closest("[data-copy-name]");
    if (!box || event.target.closest(".copy-button")) return;
    track("Click Code - " + box.getAttribute("data-copy-name"));
  });

  document.addEventListener("copy", function () {
    var selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    var node = selection.anchorNode;
    var element = node && (node.nodeType === 1 ? node : node.parentElement);
    var box = element && element.closest("[data-copy-name]");
    if (box) track("Copy Native - " + box.getAttribute("data-copy-name"));
  });

  function initTabs(group) {
    var tabs = Array.prototype.slice.call(group.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;

    var panels = tabs.map(function (tab) {
      return document.getElementById(tab.getAttribute("aria-controls"));
    });

    function activate(index, moveFocus) {
      tabs.forEach(function (tab, i) {
        var selected = i === index;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
        if (panels[i]) panels[i].hidden = !selected;
      });
      if (moveFocus) tabs[index].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () {
        activate(i, false);
      });

      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight") next = (i + 1) % tabs.length;
        if (event.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        activate(next, true);
      });
    });
  }

  document.querySelectorAll("[data-tabs]").forEach(initTabs);

  document.querySelectorAll("[data-switch-channel]").forEach(function (button) {
    button.addEventListener("click", function () {
      var target = document.getElementById("channel-" + button.getAttribute("data-switch-channel"));
      if (target) target.click();
    });
  });

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
