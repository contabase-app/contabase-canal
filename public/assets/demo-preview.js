(function () {
  "use strict";

  var FALLBACK_DATA = {
    screens: [
      {
        id: "painel",
        label: "Painel",
        route: "/",
        page: "/demo/painel.html",
        aliases: [],
        screenshots: {
          desktop: "/screenshots/desktop/painel.webp",
          mobile: "/screenshots/mobile/painel.webp",
        },
      },
    ],
  };

  var data = window.CONTABASE_DEMO_DATA;
  if (!data || !Array.isArray(data.screens) || !data.screens.length) {
    data = FALLBACK_DATA;
  }

  var root = document.querySelector("[data-demo-shell]");
  if (!root) return;

  var screens = data.screens;
  var desktopWrap = root.querySelector("[data-demo-desktop]");
  var phoneWrap = root.querySelector("[data-demo-mobile]");
  var desktopViewport = root.querySelector("[data-demo-desktop-viewport]");
  var frameDesktop = root.querySelector('[data-demo-frame="desktop"]');
  var frameMobile = root.querySelector('[data-demo-frame="mobile"]');
  var fallbackDesktop = root.querySelector('[data-demo-fallback="desktop"]');
  var fallbackMobile = root.querySelector('[data-demo-fallback="mobile"]');
  var imageDesktop = fallbackDesktop && fallbackDesktop.querySelector("img");
  var imageMobile = fallbackMobile && fallbackMobile.querySelector("img");
  var select = document.querySelector("[data-demo-screen-select]");
  var url = document.querySelector("[data-demo-url]");
  var tag = document.querySelector("[data-demo-tag]");
  var toggle = document.querySelector("[data-demo-capture-toggle]");
  var deviceButtons = Array.prototype.slice.call(document.querySelectorAll("[data-demo-device]"));

  if (!desktopWrap || !phoneWrap || !frameDesktop || !frameMobile || !select) return;

  var initialScreen = screens[0];
  var state = {
    device: window.matchMedia("(max-width: 720px)").matches ? "mobile" : "desktop",
    screenId: initialScreen.id,
    page: initialScreen.page,
    fallback: null,
  };
  var watchTimer = null;
  var shellVisible = false;

  function screenById(id) {
    return screens.find(function (screen) { return screen.id === id; }) || screens[0];
  }

  function screenForPath(pathname) {
    var file = String(pathname || "").split("/").pop();
    if (!file) return screens[0];
    return screens.find(function (screen) {
      if (String(screen.page || "").split("/").pop() === file) return true;
      return (screen.aliases || []).some(function (alias) {
        return String(alias || "").split("/").pop() === file;
      });
    }) || screens[0];
  }

  function currentScreen() {
    return screenById(state.screenId);
  }

  function activeFrame() {
    return state.device === "desktop" ? frameDesktop : frameMobile;
  }

  function activeFallback() {
    return state.device === "desktop" ? fallbackDesktop : fallbackMobile;
  }

  function activeImage() {
    return state.device === "desktop" ? imageDesktop : imageMobile;
  }

  function routeLabel(route) {
    var clean = String(route || "/").replace(/^\/+|\/+$/g, "");
    return clean ? "contabase.local / demo / " + clean : "contabase.local / demo / painel";
  }

  function screenshotFor(screen, device) {
    var shots = screen.screenshots || {};
    return shots[device] || shots.desktop || shots.mobile || "";
  }

  function updateChrome() {
    var screen = currentScreen();
    if (url) url.textContent = routeLabel(screen.route);
    if (tag) tag.textContent = screen.label;
    if (select.value !== screen.id) select.value = screen.id;
    frameDesktop.title = "Demonstração do ContaBase — " + screen.label;
    frameMobile.title = "Demonstração mobile do ContaBase — " + screen.label;
    deviceButtons.forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-demo-device") === state.device ? "true" : "false");
    });
  }

  function updateFallback() {
    var screen = currentScreen();
    var fallback = activeFallback();
    var image = activeImage();
    var frame = activeFrame();
    var src = screenshotFor(screen, state.device);

    [fallbackDesktop, fallbackMobile].forEach(function (box) {
      if (box) box.hidden = true;
    });
    [frameDesktop, frameMobile].forEach(function (item) {
      item.hidden = false;
    });

    if (state.fallback) {
      frame.hidden = true;
      if (fallback) fallback.hidden = false;
      if (image) {
        image.src = src;
        image.alt = "Captura de tela " + screen.label + " na visão " + (state.device === "desktop" ? "desktop" : "mobile") + " do ContaBase";
      }
      if (toggle) {
        toggle.textContent = state.fallback === "error" ? "Tentar novamente" : "Voltar à demonstração";
        toggle.setAttribute("aria-pressed", "true");
      }
    } else {
      if (fallback) fallback.hidden = true;
      if (toggle) {
        toggle.textContent = "Ver captura estática";
        toggle.setAttribute("aria-pressed", "false");
      }
    }
    if (url) url.textContent = routeLabel(screen.route);
    if (tag) tag.textContent = screen.label;
  }

  function clearWatch() {
    if (watchTimer !== null) {
      window.clearTimeout(watchTimer);
      watchTimer = null;
    }
  }

  function showErrorFallback() {
    state.fallback = "error";
    updateFallback();
  }

  function startWatch() {
    clearWatch();
    if (!shellVisible || state.fallback === "manual") return;
    var frame = activeFrame();
    watchTimer = window.setTimeout(function () {
      if (frame.dataset.demoLoaded !== "true") {
        showErrorFallback();
      }
    }, 10000);
  }

  function setScreen(id, options) {
    var screen = screenById(id);
    var opts = options || {};
    state.screenId = screen.id;
    state.page = screen.page;
    if (!opts.keepFallback && state.fallback === "error") state.fallback = null;
    updateChrome();
    updateFallback();
    select.value = screen.id;
    if (!opts.fromFrame) {
      var frame = activeFrame();
      frame.dataset.demoLoaded = "false";
      frame.src = screen.page;
      startWatch();
    }
  }

  function setDevice(device) {
    state.device = device;
    desktopWrap.hidden = device !== "desktop";
    phoneWrap.hidden = device !== "mobile";
    updateChrome();
    updateFallback();
    if (device === "desktop") scaleDesktop();
    var frame = activeFrame();
    var desired = state.page;
    var currentSrc = frame.getAttribute("src") || "";
    if (frame.dataset.demoLoaded !== "true" && currentSrc !== desired) {
      frame.dataset.demoLoaded = "false";
      frame.src = desired;
      startWatch();
    }
    if (state.fallback === "error") {
      state.fallback = null;
      updateFallback();
      startWatch();
    }
  }

  function scaleDesktop() {
    if (!desktopViewport) return;
    window.requestAnimationFrame(function () {
      var width = desktopViewport.clientWidth;
      if (width > 0) desktopViewport.style.setProperty("--lp-demo-scale", String(width / 1440));
    });
  }

  function onFrameLoad(frame) {
    frame.dataset.demoLoaded = "true";
    if (frame !== activeFrame()) return;
    clearWatch();
    var pathname = "";
    try {
      pathname = frame.contentWindow.location.pathname;
    } catch (error) {
      showErrorFallback();
      return;
    }
    if (pathname.indexOf("/demo/") !== 0) return;
    var screen = screenForPath(pathname);
    state.page = pathname;
    if (screen.id !== state.screenId) {
      state.screenId = screen.id;
      updateChrome();
      updateFallback();
    }
    if (state.fallback === "error") {
      state.fallback = null;
      updateFallback();
    }
  }

  // Populate the screen selector from the generated manifest.
  select.innerHTML = "";
  screens.forEach(function (screen) {
    var option = document.createElement("option");
    option.value = screen.id;
    option.textContent = screen.label;
    select.appendChild(option);
  });

  deviceButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setDevice(button.getAttribute("data-demo-device"));
    });
  });

  select.addEventListener("change", function () {
    setScreen(select.value);
  });

  if (toggle) {
    toggle.addEventListener("click", function () {
      if (state.fallback) {
        state.fallback = null;
        updateFallback();
        var frame = activeFrame();
        if (frame.dataset.demoLoaded !== "true") {
          frame.dataset.demoLoaded = "false";
          frame.src = state.page;
        }
        startWatch();
      } else {
        state.fallback = "manual";
        clearWatch();
        updateFallback();
      }
    });
  }

  frameDesktop.addEventListener("load", function () { onFrameLoad(frameDesktop); });
  frameMobile.addEventListener("load", function () { onFrameLoad(frameMobile); });

  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "contabase-demo-form-open") return;
    var shell = document.querySelector("[data-demo-shell]");
    if (shell && typeof shell.scrollIntoView === "function") {
      shell.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  if (window.ResizeObserver && desktopViewport) {
    new ResizeObserver(scaleDesktop).observe(desktopViewport);
  } else {
    window.addEventListener("resize", scaleDesktop);
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        shellVisible = true;
        observer.disconnect();
        startWatch();
      }
    }, { rootMargin: "200px 0px" });
    observer.observe(root);
  } else {
    shellVisible = true;
    startWatch();
  }

  // The HTML already points both frames at the default Painel page.
  setDevice(state.device);
  updateChrome();
  updateFallback();
  scaleDesktop();
})();
