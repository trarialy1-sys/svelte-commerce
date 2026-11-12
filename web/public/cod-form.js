/* COD order form (paiement à la livraison) — storefront script.
 * Everything is driven by the store's settings (GET /api/public/cod):
 * products, pop-up or embedded, sticky button, fields, texts, colours,
 * quantity offers, 1-tick and 1-click upsells, promo codes, shipping rates,
 * pixels. Prices and totals always come from the server ("quote").
 * No dependencies. */
(function () {
  "use strict";
  if (window.__odesCod) return;
  window.__odesCod = true;

  var API = new URL(document.currentScript.src).origin + "/api/public/cod";
  var SHOP = (window.Shopify && window.Shopify.shop) || "";
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"];

  // Remember where the visitor came from, whatever page they landed on.
  var utm = {};
  try {
    utm = JSON.parse(sessionStorage.getItem("odes_cod_utm") || "{}");
    var qs = new URLSearchParams(location.search);
    UTM_KEYS.forEach(function (k) {
      if (qs.get(k)) utm[k] = qs.get(k).slice(0, 150);
    });
    sessionStorage.setItem("odes_cod_utm", JSON.stringify(utm));
  } catch (e) {}

  var m = location.pathname.match(/\/products\/([^/?#]+)/);
  var cartMode = !m && /\/cart\/?$/.test(location.pathname);
  if ((!m && !cartMode) || !SHOP) return;
  var handle = cartMode ? "__cart__" : decodeURIComponent(m[1]).toLowerCase();
  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  var cart = null;

  var product, cfg, T, state, els = {}, quoteTimer = null, quoteSeq = 0;
  var leadId = (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);

  Promise.all([
    fetch(API + "?shop=" + encodeURIComponent(SHOP) + "&handle=" + encodeURIComponent(handle)).then(function (r) { return r.json(); }),
    fetch(cartMode ? root + "cart.js" : root + "products/" + encodeURIComponent(handle) + ".js").then(function (r) { return r.json(); }),
  ]).then(function (res) {
    cfg = res[0];
    if (cartMode) {
      cart = res[1];
      // The cart's lines the form is on, as a one-variant pseudo product.
      var on = function (h) { h = (h || "").toLowerCase(); return ((cfg.products || []).indexOf("*") >= 0 || (cfg.products || []).indexOf(h) >= 0) && (cfg.excludeProducts || []).indexOf(h) < 0; };
      cart.lines = (cart.items || []).filter(function (it) { return on(it.handle); });
      if (!cfg || !cfg.enabled || !cart.lines.length) return;
      var sum = cart.lines.reduce(function (a, it) { return a + it.final_line_price; }, 0);
      product = { title: cart.lines.length + " article(s)", options: [], featured_image: cart.lines[0].image, variants: [{ id: 0, title: "", options: [], price: sum, available: true, featured_image: { src: cart.lines[0].image } }] };
    } else {
      product = res[1];
    }
    if (!cfg || !cfg.enabled || !product || !product.variants) return;
    T = cfg.texts || {};
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }).catch(function () {});

  // ── helpers ────────────────────────────────────────────────────────────────
  function money(cents) {
    var v = Math.round(cents) / 100;
    return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)) + " " + (cfg.currencyLabel || "dh");
  }

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") el.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  // Small inline icons (static markup, no user data).
  var ICONS = {
    name: '<path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z"/>',
    phone: '<path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"/>',
    pin: '<path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/>',
    mail: '<path d="M3 5h18c.6 0 1 .4 1 1v12c0 .6-.4 1-1 1H3a1 1 0 0 1-1-1V6c0-.6.4-1 1-1Zm9 7.2L4.4 7H4v.6l8 5.4 8-5.4V7h-.4L12 12.2Z"/>',
    note: '<path d="M5 3h10l4 4v14H5V3Zm2 6v2h10V9H7Zm0 4v2h10v-2H7Zm0 4v2h7v-2H7Z"/>',
    cart: '<path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM1 2v2h2l3.6 7.6L5.2 14A2 2 0 0 0 7 17h12v-2H7.4l1.1-2h7.5c.8 0 1.4-.4 1.7-1l3.6-6.5A1 1 0 0 0 20.4 4H5.2l-.9-2H1Z"/>',
  };
  var FIELD_ICON = { name: "name", phone: "phone", address: "pin", address2: "pin", city: "pin", email: "mail", note: "note" };
  function icon(name, cls) {
    var span = document.createElement("span");
    span.className = cls || "odc-ico";
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">' + ICONS[name] + "</svg>";
    return span;
  }
  function iconsLayout() { return !cfg.design || cfg.design.layout !== "simple"; }
  // The button that opens the form (with a cart icon in the Releasit-style layout).
  function openButton(cls, onclick) {
    return h("button", { type: "button", class: cls, onclick: onclick }, [
      iconsLayout() ? icon("cart", "odc-bico") : null,
      h("span", { text: T.button }),
    ]);
  }

  function post(body) {
    return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return j; }, function () { return { ok: false }; }); });
  }

  // ── pixels ─────────────────────────────────────────────────────────────────
  var px = {};
  function loadScript(src) {
    var t = document.createElement("script"); t.async = true; t.src = src;
    document.head.appendChild(t);
  }
  function pixelsInit() {
    var p = cfg.pixels || {};
    try {
      if ((p.meta || []).length && !window.fbq) {
        !(function (f, b, e, v, n, t, s) {
          if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
          if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
          t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
        })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
        p.meta.forEach(function (id) { window.fbq("init", id); });
      }
      if ((p.tiktok || []).length && !window.ttq) {
        window.TiktokAnalyticsObject = "ttq";
        var ttq = (window.ttq = window.ttq || []);
        ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
        ttq.setAndDefer = function (o, k) { o[k] = function () { o.push([k].concat(Array.prototype.slice.call(arguments, 0))); }; };
        for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
        ttq.instance = function (id) { var e = ttq._i[id] || []; for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e; };
        ttq.load = function (id) { ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._t = ttq._t || {}; ttq._t[id] = +new Date(); loadScript("https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=" + id + "&lib=ttq"); };
        p.tiktok.forEach(function (id) { ttq.load(id); });
      }
      if ((p.google || []).length && !window.gtag) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag("js", new Date());
        loadScript("https://www.googletagmanager.com/gtag/js?id=" + p.google[0].id);
        p.google.forEach(function (g) { window.gtag("config", g.id); });
      }
      if ((p.snapchat || []).length && !window.snaptr) {
        var a = (window.snaptr = function () { a.handleRequest ? a.handleRequest.apply(a, arguments) : a.queue.push(arguments); });
        a.queue = [];
        loadScript("https://sc-static.net/scevent.min.js");
        p.snapchat.forEach(function (id) { window.snaptr("init", id, {}); });
      }
      if ((p.pinterest || []).length && !window.pintrk) {
        window.pintrk = function () { window.pintrk.queue.push(Array.prototype.slice.call(arguments)); };
        window.pintrk.queue = []; window.pintrk.version = "3.0";
        loadScript("https://s.pinimg.com/ct/core.js");
        p.pinterest.forEach(function (id) { window.pintrk("load", id); });
        window.pintrk("page");
      }
    } catch (e) {}
    px.ready = true;
  }
  function track(kind, data) {
    // kind: "checkout" | "purchase"
    var p = cfg.pixels || {};
    try {
      if (window.fbq && (p.meta || []).length) {
        window.fbq("track", kind === "purchase" ? "Purchase" : "InitiateCheckout", {
          value: data.value, currency: data.currency, content_type: "product", content_ids: data.ids, num_items: data.qty,
        }, data.eventId ? { eventID: data.eventId } : undefined);
      }
      if (window.ttq && (p.tiktok || []).length) {
        window.ttq.track(kind === "purchase" ? "CompletePayment" : "InitiateCheckout", {
          value: data.value, currency: data.currency, contents: data.ids.map(function (id) { return { content_id: id, content_type: "product" }; }),
        }, data.eventId ? { event_id: data.eventId } : undefined);
      }
      if (window.gtag && kind === "purchase") {
        (p.google || []).forEach(function (g) {
          if (g.label) window.gtag("event", "conversion", { send_to: g.id + "/" + g.label, value: data.value, currency: data.currency, transaction_id: data.order });
        });
      }
      if (window.snaptr && (p.snapchat || []).length) {
        window.snaptr("track", kind === "purchase" ? "PURCHASE" : "START_CHECKOUT", { price: data.value, currency: data.currency, item_ids: data.ids, transaction_id: data.order });
      }
      if (window.pintrk && (p.pinterest || []).length) {
        window.pintrk("track", kind === "purchase" ? "checkout" : "addtocart", { value: data.value, currency: data.currency, order_quantity: data.qty, order_id: data.order });
      }
    } catch (e) {}
  }

  // ── Meta cookies for the server-side Purchase ─────────────────────────────
  function cookie(name) {
    var mm = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return mm ? decodeURIComponent(mm[1]) : "";
  }
  function fbc() {
    var c = cookie("_fbc");
    if (c) return c;
    var id = new URLSearchParams(location.search).get("fbclid") || (utm && utm.fbclid);
    return id ? "fb.1." + Date.now() + "." + id : "";
  }

  // ── product / variants ─────────────────────────────────────────────────────
  var hasOptions;
  function currentVariantId() {
    var q = new URLSearchParams(location.search).get("variant");
    if (q) return Number(q);
    var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
    return input && input.value ? Number(input.value) : null;
  }
  function variantFor(options) {
    for (var i = 0; i < product.variants.length; i++) {
      var v = product.variants[i], ok = true;
      for (var j = 0; j < options.length; j++) if (v.options[j] !== options[j]) ok = false;
      if (ok) return v;
    }
    return null;
  }
  function firstAvailable() {
    var cur = product.variants.filter(function (v) { return v.id === currentVariantId(); })[0];
    return (cur && cur.available && cur) || product.variants.filter(function (v) { return v.available; })[0] || product.variants[0];
  }

  // ── mount ──────────────────────────────────────────────────────────────────
  function mount() {
    hasOptions = !(product.variants.length === 1);
    injectCss();
    pixelsInit();
    var form = cartMode
      ? document.querySelector('[name="checkout"]')
      : document.querySelector('form[action*="/cart/add"]');
    if (cartMode) {
      var cb = openButton("odc-open", open);
      if (form && form.parentNode) form.parentNode.insertBefore(cb, form.nextSibling);
      else document.body.appendChild(h("div", { class: "odc-float" }, [cb]));
      document.documentElement.classList.add("odc-on");
      return;
    }
    if (cfg.mode === "embedded") {
      startState();
      build(false);
      var holder = h("div", { class: "odc-embed", dir: cfg.dir }, [els.card]);
      if (form && form.parentNode) form.parentNode.insertBefore(holder, form.nextSibling);
      else (document.querySelector("main") || document.body).appendChild(holder);
      render();
      requestQuote();
    } else {
      var btn = openButton("odc-open", open);
      if (form && form.parentNode) form.parentNode.insertBefore(btn, form.nextSibling);
      else document.body.appendChild(h("div", { class: "odc-float" }, [btn]));
    }
    // Page builders (PageFly, GemPages…): any element with data-odc-open opens the form.
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("[data-odc-open]");
      if (!t) return;
      e.preventDefault();
      if (cfg.mode === "embedded") els.card.scrollIntoView({ behavior: "smooth", block: "start" });
      else open();
    });
    if (cfg.stickyButton) {
      var sticky = h("div", { class: "odc-sticky" }, [openButton("odc-open odc-sticky-btn", function () {
        if (cfg.mode === "embedded") els.card.scrollIntoView({ behavior: "smooth", block: "start" });
        else open();
      })]);
      document.body.appendChild(sticky);
      document.documentElement.classList.add("odc-has-sticky");
    }
    document.documentElement.classList.add("odc-on");
  }

  function startState() {
    var start = firstAvailable();
    var tierIdx = 0;
    if (cfg.offer && cfg.offer.tiers.length) {
      cfg.offer.tiers.forEach(function (t, i) { if (t.preselected) tierIdx = i; });
    }
    var qty = cartMode ? 1 : cfg.offer && cfg.offer.tiers.length ? cfg.offer.tiers[tierIdx].qty : 1;
    var pieces = [];
    for (var i = 0; i < qty; i++) pieces.push(start.options.slice());
    state = { pieces: pieces, qty: qty, tierIdx: tierIdx, ticks: {}, click: null, clickShown: false, promo: "", promoOk: false, quote: null, sending: false, done: false };
  }

  function open() {
    startState();
    build(true);
    document.body.appendChild(els.overlay);
    document.documentElement.style.overflow = "hidden";
    render();
    requestQuote();
    try {
      fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", shop: SHOP, handle: handle, utm: utm }), keepalive: true }).catch(function () {});
    } catch (e) {}
    var v = variantFor(state.pieces[0]) || firstAvailable();
    track("checkout", { value: v.price / 100, currency: "MAD", ids: [String(v.id)], qty: state.qty });
    // Desktop only: on phones the keyboard would cover the offers.
    if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      setTimeout(function () { var f = els.fields[0]; if (f) f.input.focus(); }, 50);
    }
  }

  function close() {
    if (els.overlay && els.overlay.parentNode) els.overlay.parentNode.removeChild(els.overlay);
    document.documentElement.style.overflow = "";
  }

  // ── building the form ──────────────────────────────────────────────────────
  function optionPicker(pieceIdx) {
    if (!hasOptions) return null;
    var rows = product.options.map(function (opt, idx) {
      var name = opt.name || opt;
      var values = [];
      product.variants.forEach(function (v) { if (values.indexOf(v.options[idx]) < 0) values.push(v.options[idx]); });
      var wrap = h("div", { class: "odc-chips", "data-piece": String(pieceIdx), "data-idx": String(idx) });
      values.forEach(function (val) {
        wrap.appendChild(h("button", { type: "button", class: "odc-chip", "data-val": val, text: val, onclick: function () {
          state.pieces[pieceIdx][idx] = val; render(); requestQuote();
        } }));
      });
      return h("div", { class: "odc-opt" }, [h("div", { class: "odc-optname", text: name }), wrap]);
    });
    return h("div", { class: "odc-piece" }, rows);
  }

  function field(f) {
    var input;
    var attrs = { class: "odc-input", id: "odc-" + f.key, name: f.key, maxlength: f.key === "address" || f.key === "address2" || f.key === "note" ? "200" : "80" };
    if (f.placeholder) attrs.placeholder = f.placeholder;
    if (f.key === "city" && (cfg.cityList || []).length) {
      input = h("select", attrs, [h("option", { value: "", text: f.placeholder || "—" })].concat(cfg.cityList.map(function (c) { return h("option", { value: c, text: c }); })));
      input.addEventListener("change", requestQuote);
    } else {
      if (f.key === "phone") { attrs.type = "tel"; attrs.inputmode = "tel"; attrs.autocomplete = "tel"; attrs.maxlength = "20"; }
      else if (f.key === "email") { attrs.type = "email"; attrs.autocomplete = "email"; }
      else if (f.key === "name") { attrs.type = "text"; attrs.autocomplete = "name"; }
      else if (f.key === "city") { attrs.type = "text"; attrs.autocomplete = "address-level2"; }
      else if (f.key === "address") { attrs.type = "text"; attrs.autocomplete = "street-address"; }
      else attrs.type = "text";
      input = h(f.key === "note" ? "textarea" : "input", attrs);
      if (f.key === "city") input.addEventListener("change", requestQuote);
    }
    var err = h("div", { class: "odc-err", role: "alert" });
    input.addEventListener("input", function () { err.textContent = ""; input.classList.remove("odc-bad"); });
    els["f_" + f.key] = { input: input, err: err, cfg: f };
    var label = h("label", { for: "odc-" + f.key }, [document.createTextNode(f.label), f.required ? h("span", { class: "odc-req", text: " *" }) : null]);
    if (!iconsLayout()) return h("div", { class: "odc-field" }, [label, input, err]);
    return h("div", { class: "odc-field odc-row" }, [label, h("div", { class: "odc-ig" }, [icon(FIELD_ICON[f.key] || "note"), input]), err]);
  }

  function build(popup) {
    els.img = h("img", { class: "odc-img", alt: "" });
    els.vtitle = h("div", { class: "odc-vtitle" });
    els.price = h("div", { class: "odc-price" });
    els.stock = h("div", { class: "odc-err", role: "alert" });
    els.formErr = h("div", { class: "odc-err odc-formerr", role: "alert" });
    els.submit = h("button", { type: "submit", class: "odc-submit" });
    els.hp = h("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", class: "odc-hp", "aria-hidden": "true" });
    els.news = h("input", { type: "checkbox", id: "odc-news" });
    els.pieces = h("div", { class: "odc-pieces" });
    els.totals = h("div", { class: "odc-totals" });

    var parts = [h("div", { class: "odc-summary" }, [els.img, h("div", { class: "odc-sinfo" }, [h("div", { class: "odc-ptitle", text: product.title }), els.vtitle]), els.price])];

    // Quantity offers (radio cards) or a plain quantity stepper.
    if (cfg.offer && cfg.offer.tiers.length) {
      els.tiers = h("div", { class: "odc-tiers", role: "radiogroup" });
      cfg.offer.tiers.forEach(function (t, i) {
        els.tiers.appendChild(h("button", { type: "button", class: "odc-tier", role: "radio", "data-i": String(i), onclick: function () { setQty(t.qty, i); } }, [
          h("span", { class: "odc-radio" }),
          h("span", { class: "odc-tlabel", text: t.label }),
          t.badge ? h("span", { class: "odc-badge", text: t.badge }) : null,
          h("span", { class: "odc-tprice" }),
        ]));
      });
      parts.push(h("div", { class: "odc-h2", text: T.offerTitle }), els.tiers);
    } else if (cartMode) {
      cart.lines.forEach(function (it) {
        parts.push(h("div", { class: "odc-cline" }, [h("span", { text: it.quantity + " \u00d7 " + it.title }), h("span", { text: money(it.final_line_price) })]));
      });
    } else {
      els.qty = h("span", { class: "odc-qtyv", text: "1" });
      parts.push(h("div", { class: "odc-field odc-qty" }, [
        h("label", { text: T.quantity }),
        h("div", { class: "odc-stepper" }, [
          h("button", { type: "button", "aria-label": "-", text: "−", onclick: function () { setQty(Math.max(1, state.qty - 1)); } }),
          els.qty,
          h("button", { type: "button", "aria-label": "+", text: "+", onclick: function () { setQty(Math.min(cfg.maxQty || 10, state.qty + 1)); } }),
        ]),
      ]));
    }
    parts.push(els.pieces, els.stock);

    // 1-tick upsells.
    (cfg.tickUpsells || []).forEach(function (u) {
      var cb = h("input", { type: "checkbox", id: "odc-t-" + u.id });
      cb.addEventListener("change", function () { state.ticks[u.id] = cb.checked; requestQuote(); });
      var ti = (cfg.upsellProducts || {})[u.variantId] || {};
      parts.push(h("label", { class: "odc-tick", for: "odc-t-" + u.id }, [
        cb,
        ti.image ? h("img", { class: "odc-tickimg", src: String(ti.image).replace(/(\.[a-z]+)(\?|$)/i, "_120x$1$2"), alt: "" }) : null,
        h("span", { text: u.label }),
        h("strong", {}, [ti.priceCents && ti.priceCents > u.priceCents ? h("s", { class: "odc-upold", text: money(ti.priceCents) }) : null, document.createTextNode(" + " + money(u.priceCents))]),
      ]));
    });

    // Promo code.
    if (cfg.discountCodes) {
      els.promo = h("input", { class: "odc-input", placeholder: T.discountPlaceholder, maxlength: "40", autocapitalize: "characters" });
      els.promoErr = h("div", { class: "odc-err", role: "alert" });
      parts.push(h("div", { class: "odc-field" }, [
        h("div", { class: "odc-promo" }, [els.promo, h("button", { type: "button", class: "odc-promobtn", text: T.discountApply, onclick: function () {
          state.promo = els.promo.value.trim().toUpperCase(); els.promoErr.textContent = ""; requestQuote(true);
        } })]),
        els.promoErr,
      ]));
    }

    parts.push(els.totals);
    if (iconsLayout()) {
      els.ship = h("div", { class: "odc-ship" });
      parts.push(h("div", { class: "odc-h2", text: T.shippingMethod || "Mode de livraison" }), els.ship);
    }
    parts.push(h("div", { class: "odc-h2" + (iconsLayout() ? " odc-center" : ""), text: T.addressTitle }));
    els.fields = [];
    (cfg.fields || []).forEach(function (f) { parts.push(field(f)); els.fields.push(els["f_" + f.key]); });
    parts.push(els.hp);
    if (cfg.newsletter) parts.push(h("label", { class: "odc-check", for: "odc-news" }, [els.news, h("span", { text: T.newsletter })]));
    parts.push(els.formErr, els.submit, h("div", { class: "odc-note", text: T.note }));

    var formEl = h("form", { class: "odc-form", novalidate: "novalidate", onsubmit: submit }, parts);
    if (els.f_phone) els.f_phone.input.addEventListener("blur", sendLead);

    els.card = h("div", { class: "odc-modal" + (iconsLayout() ? " odc-icons" : ""), role: popup ? "dialog" : "region", "aria-label": T.title, dir: cfg.dir }, [
      h("div", { class: "odc-head" }, [
        h("div", { class: "odc-htitle", text: T.title }),
        popup ? h("button", { type: "button", class: "odc-close", "aria-label": "×", text: "×", onclick: close }) : null,
      ]),
      formEl,
    ]);
    els.form = formEl;
    if (popup) {
      els.overlay = h("div", { class: "odc-overlay", onclick: function (e) { if (e.target === els.overlay) close(); } }, [els.card]);
      els.overlay.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    }
    buildPieces();
  }

  function setQty(q, tierIdx) {
    if (tierIdx !== undefined) state.tierIdx = tierIdx;
    var last = state.pieces[state.pieces.length - 1] || firstAvailable().options.slice();
    while (state.pieces.length < q) state.pieces.push(last.slice());
    state.pieces.length = q;
    state.qty = q;
    buildPieces();
    render();
    requestQuote();
  }

  // One option picker per piece when an offer bundles several pieces.
  function buildPieces() {
    els.pieces.innerHTML = "";
    if (!hasOptions) return;
    var perPiece = cfg.offer && state.qty > 1;
    if (!perPiece) { els.pieces.appendChild(optionPicker(0)); return; }
    for (var i = 0; i < state.qty; i++) {
      els.pieces.appendChild(h("div", { class: "odc-pbox" }, [h("div", { class: "odc-plabel", text: T.piece + " " + (i + 1) }), optionPicker(i)]));
    }
  }

  // Items sent to the server: identical options are merged.
  function items() {
    if (cartMode) return cart.lines.map(function (it) { return { variantId: String(it.variant_id), quantity: it.quantity }; });
    var perPiece = cfg.offer && state.qty > 1 && hasOptions;
    var map = {}, order = [];
    for (var i = 0; i < state.qty; i++) {
      var v = variantFor(perPiece ? state.pieces[i] : state.pieces[0]);
      if (!v) return null;
      var k = String(v.id);
      if (!map[k]) { map[k] = 0; order.push(k); }
      map[k]++;
    }
    return order.map(function (k) { return { variantId: k, quantity: map[k] }; });
  }

  function allAvailable() {
    var perPiece = cfg.offer && state.qty > 1 && hasOptions;
    for (var i = 0; i < (perPiece ? state.qty : 1); i++) {
      var v = variantFor(state.pieces[i] || state.pieces[0]);
      if (!v || !v.available) return false;
    }
    return true;
  }

  // ── rendering ──────────────────────────────────────────────────────────────
  function render() {
    var v = variantFor(state.pieces[0]);
    Array.prototype.forEach.call(els.pieces.querySelectorAll(".odc-chips"), function (wrap) {
      var pi = Number(wrap.getAttribute("data-piece")), idx = Number(wrap.getAttribute("data-idx"));
      var sel = state.pieces[pi] || state.pieces[0];
      Array.prototype.forEach.call(wrap.children, function (chip) {
        var val = chip.getAttribute("data-val");
        var probe = sel.slice(); probe[idx] = val;
        var match = variantFor(probe);
        chip.classList.toggle("odc-sel", sel[idx] === val);
        chip.classList.toggle("odc-out", !match || !match.available);
      });
    });
    if (els.tiers) {
      Array.prototype.forEach.call(els.tiers.children, function (b, i) {
        b.classList.toggle("odc-tsel", i === state.tierIdx);
        b.setAttribute("aria-checked", i === state.tierIdx ? "true" : "false");
        var t = cfg.offer.tiers[i], unit = v ? v.price : 0;
        var tp = b.querySelector(".odc-tprice"), full = unit * t.qty, now = tierTotal(t, unit);
        tp.innerHTML = "";
        if (now < full) tp.appendChild(h("s", { class: "odc-upold", text: money(full) }));
        tp.appendChild(document.createTextNode(money(now)));
      });
    }
    if (els.qty) els.qty.textContent = String(state.qty);
    var ok = allAvailable();
    var img = (v && v.featured_image && v.featured_image.src) || product.featured_image || "";
    if (img) els.img.src = String(img).replace(/(\.[a-z]+)(\?|$)/i, "_160x$1$2");
    els.vtitle.textContent = v && hasOptions && !(cfg.offer && state.qty > 1) ? v.title : "";
    els.price.textContent = money(v ? v.price : 0);
    els.stock.textContent = ok ? "" : "Cette option est en rupture de stock.";
    renderTotals();
    var total = state.quote ? Math.round(state.quote.total * 100) : (v ? v.price * state.qty : 0);
    els.submit.disabled = !ok || state.sending;
    els.submit.textContent = state.sending ? "…" : T.submit + " — " + money(total);
  }

  // Shown on the offer cards (the server's quote is the source of truth).
  function tierTotal(t, unit) {
    var sum = unit * t.qty;
    if (t.type === "percent") return sum - Math.round((sum * t.value) / 100);
    if (t.type === "fixed") return Math.max(0, sum - t.value);
    if (t.type === "price") return t.value;
    if (t.type === "free") return unit * (t.qty - t.value);
    return sum;
  }

  function renderTotals() {
    var q = state.quote, rows = [];
    if (q) {
      if (q.discounts.length || iconsLayout()) rows.push(h("div", {}, [h("span", { text: T.subtotal }), h("span", { text: money(q.subtotal * 100) })]));
      q.discounts.forEach(function (d) {
        var name = d.label === "QUANTITY DISCOUNT" ? (q.tier || T.discount) : d.label === "CUSTOM DISCOUNT" ? T.discount : T.discount + " (" + d.label + ")";
        rows.push(h("div", { class: "odc-disc" }, [h("span", { text: name }), h("span", { text: "\u2212 " + money(d.amount * 100) })]));
      });
      rows.push(h("div", {}, [h("span", { text: T.shipping }), h("span", { text: q.shipping.amount > 0 ? money(q.shipping.amount * 100) : T.freeShipping })]));
      if (q.fee) rows.push(h("div", {}, [h("span", { text: q.fee.title }), h("span", { text: money(q.fee.amount * 100) })]));
      rows.push(h("div", { class: "odc-total" }, [h("span", { text: T.total }), h("strong", { text: money(q.total * 100) })]));
    } else {
      var v = variantFor(state.pieces[0]);
      rows.push(h("div", { class: "odc-total" }, [h("span", { text: T.total }), h("strong", { text: money(v ? v.price * state.qty : 0) })]));
    }
    els.totals.innerHTML = "";
    rows.forEach(function (r) { els.totals.appendChild(r); });
    if (els.ship) {
      var sh = q ? q.shipping : { title: T.freeShipping, amount: 0 };
      var free = !sh.amount;
      els.ship.innerHTML = "";
      els.ship.appendChild(h("span", { class: "odc-dot" }));
      els.ship.appendChild(h("span", { class: "odc-shipname", text: free && sh.title === T.freeShipping ? T.shipping + " " + T.freeShipping.toLowerCase() : sh.title }));
      els.ship.appendChild(h("strong", { text: free ? T.freeShipping : money(sh.amount * 100) }));
    }
  }

  // ── server quote ───────────────────────────────────────────────────────────
  function val(key) { var f = els["f_" + key]; return f ? f.input.value : ""; }

  function payload(action) {
    var ticks = Object.keys(state.ticks).filter(function (k) { return state.ticks[k]; });
    return {
      fbp: cookie("_fbp"),
      fbc: fbc(),
      action: action,
      shop: SHOP,
      handle: handle,
      leadId: leadId,
      name: val("name"),
      phone: val("phone"),
      city: val("city"),
      address: val("address"),
      address2: val("address2"),
      email: val("email"),
      note: val("note"),
      newsletter: !!(els.news && els.news.checked),
      website: els.hp.value,
      items: items() || [],
      tickIds: ticks,
      click: state.click,
      discountCode: state.promoOk || action === "quote" ? state.promo : "",
      utm: utm,
      pageUrl: location.origin + location.pathname,
    };
  }

  function requestQuote(promoCheck) {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(function () {
      var seq = ++quoteSeq;
      if (!items()) return;
      post(payload("quote")).then(function (j) {
        if (seq !== quoteSeq) return;
        if (j.ok) {
          state.quote = j;
          if (state.promo) state.promoOk = true;
        } else if (j.field === "discount") {
          state.promoOk = false;
          if (els.promoErr) els.promoErr.textContent = j.message || "";
          state.promo = "";
          requestQuote();
        } else {
          state.quote = null;
        }
        render();
      }).catch(function () {});
    }, promoCheck === true ? 0 : 250);
  }

  // ── abandoned forms ────────────────────────────────────────────────────────
  var lastLead = "";
  function sendLead() {
    var digits = val("phone").replace(/\D/g, "");
    if (digits.length < 9 || state.sending || state.done || !items()) return;
    var key = digits + "|" + val("name");
    if (key === lastLead) return;
    lastLead = key;
    try {
      fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload("lead")), keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  // ── submit ─────────────────────────────────────────────────────────────────
  function showErr(key, message) {
    var f = els["f_" + key];
    if (key === "discount" && els.promoErr) { els.promoErr.textContent = message; return; }
    if (f) {
      f.err.textContent = message;
      f.input.classList.add("odc-bad");
      f.input.focus();
    } else {
      els.formErr.textContent = message;
    }
  }

  function validate() {
    var fields = cfg.fields || [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i], v = val(f.key).trim();
      if (f.key === "phone") {
        if (!/^(?:\+?212|00212|0)?0?[5-8]\d{8}$/.test(v.replace(/[^\d+]/g, ""))) return ["phone", "Insérez un numéro de téléphone valide."];
      } else if (f.key === "email" && v && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) {
        return ["email", "Adresse e-mail invalide."];
      } else if (f.required && v.length < (f.key === "name" || f.key === "city" ? 2 : f.key === "address" ? 3 : 1)) {
        return [f.key, f.label + " ?"];
      }
    }
    return null;
  }

  function submit(e) {
    e.preventDefault();
    if (state.sending || !items()) return;
    els.formErr.textContent = "";
    var bad = validate();
    if (bad) return showErr(bad[0], bad[1]);
    if (cfg.clickUpsell && !state.clickShown) return showClickUpsell("upsell");
    send();
  }

  function send() {
    state.sending = true;
    render();
    post(payload("order"))
      .then(function (j) {
        if (!j.ok) {
          state.sending = false;
          render();
          return showErr(j.field || "form", j.message || "La commande n'a pas pu être enregistrée. Réessayez.");
        }
        state.done = true;
        var its = items() || [];
        if (cartMode) { try { fetch(root + "cart/clear.js", { method: "POST" }); } catch (e2) {} }
        track("purchase", {
          value: j.total, currency: j.currency || "MAD", ids: its.map(function (i) { return i.variantId; }),
          qty: state.qty, order: j.orderName, eventId: "odc_" + j.orderName,
        });
        thanks(j);
      })
      .catch(function () {
        state.sending = false;
        render();
        showErr("form", "Connexion interrompue. Vérifiez votre réseau et réessayez.");
      });
  }

  // ── 1-click upsell, then downsell after a refusal ──────────────────────────
  function showClickUpsell(kind) {
    state.clickShown = true;
    var u = cfg.clickUpsell;
    var price = kind === "downsell" ? u.downsell.priceCents : u.priceCents;
    var info = (cfg.upsellProducts || {})[u.variantId] || {};
    var box = h("div", { class: "odc-up", role: "dialog", "aria-modal": "true", dir: cfg.dir }, [
      h("div", { class: "odc-h1", text: kind === "downsell" ? u.downsell.headline : u.headline }),
      info.image ? h("img", { class: "odc-upimg", src: String(info.image).replace(/(\.[a-z]+)(\?|$)/i, "_400x$1$2"), alt: info.title || "" }) : null,
      info.title ? h("div", { class: "odc-uptitle", text: info.title }) : null,
      u.text ? h("p", { class: "odc-uptext", text: u.text }) : null,
      h("div", { class: "odc-upprice" }, [
        info.priceCents && info.priceCents > price ? h("s", { class: "odc-upold", text: money(info.priceCents) }) : null,
        h("span", { text: money(price) }),
      ]),
      h("button", { type: "button", class: "odc-submit", text: T.upsellAccept, onclick: function () {
        state.click = { id: u.id, kind: kind }; done();
      } }),
      h("button", { type: "button", class: "odc-decline", text: T.upsellDecline, onclick: function () {
        if (kind === "upsell" && u.downsell && u.downsell.enabled) { done(true); showClickUpsell("downsell"); return; }
        state.click = null; done();
      } }),
    ]);
    var layer = h("div", { class: "odc-overlay odc-uplayer" }, [box]);
    document.body.appendChild(layer);
    function done(keepOpen) {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
      if (!keepOpen) send();
    }
  }

  function thanks(j) {
    if (cfg.thankYouUrl) {
      setTimeout(function () { location.href = cfg.thankYouUrl; }, 600);
    }
    els.card.replaceChild(
      h("div", { class: "odc-thanks" }, [
        h("div", { class: "odc-h1", text: T.thankYou }),
        h("p", { text: j.orderName + " — " + money(Math.round(j.total * 100)) }),
        els.overlay ? h("button", { type: "button", class: "odc-submit", text: "OK", onclick: close }) : null,
      ]),
      els.form
    );
  }

  // ── styles ─────────────────────────────────────────────────────────────────
  // The theme's own look, read from its "Add to cart" button and page title.
  function themeLook() {
    var clean = function (v) { return String(v || "").replace(/[;{}<>]/g, ""); };
    var btn =
      document.querySelector('form[action*="/cart/add"] button[name="add"]') ||
      document.querySelector('form[action*="/cart/add"] [type="submit"]:not(.shopify-payment-button__button)') ||
      document.querySelector('[name="checkout"]') ||
      document.querySelector("button.btn, .btn, button.button, .button");
    var title = document.querySelector("h1") || btn;
    if (!btn) return null;
    var b = getComputedStyle(btn), t = getComputedStyle(title);
    return {
      bf: clean(b.fontFamily), bls: clean(b.letterSpacing), btt: clean(b.textTransform), bw: clean(b.fontWeight),
      r: Math.min(30, parseFloat(b.borderTopLeftRadius) || 0) + "px",
      hf: clean(t.fontFamily), hls: t.letterSpacing === "normal" ? "normal" : "0.04em", htt: clean(t.textTransform), hw: clean(t.fontWeight),
    };
  }

  function injectCss() {
    var c = cfg.colors || {}, P = c.primary || "#111", PT = c.primaryText || "#fff", R = (c.radius === undefined ? 10 : c.radius) + "px";
    var look = cfg.design && cfg.design.matchTheme ? themeLook() : null;
    var v = look || { bf: "inherit", bls: ".03em", btt: "none", bw: "600", r: R, hf: "inherit", hls: "normal", htt: "none", hw: "600" };
    if (look) R = look.r;
    var hide = [cfg.hideSelectors || ""];
    if (cfg.hideAddToCart) hide.push('form[action*="/cart/add"] [type="submit"]:not(.shopify-payment-button__button)', 'form[action*="/cart/add"] button[name="add"]');
    if (cfg.hideBuyNow) hide.push(".shopify-payment-button");
    var hideCss = hide.filter(Boolean).join(",");
    var css =
      (hideCss ? hideCss + "{display:none!important}" : "") +
      ":root{--odc-bf:" + v.bf + ";--odc-bls:" + v.bls + ";--odc-btt:" + v.btt + ";--odc-bw:" + v.bw + ";--odc-r:" + R + ";--odc-hf:" + v.hf + ";--odc-hls:" + v.hls + ";--odc-htt:" + v.htt + ";--odc-hw:" + v.hw + "}" +
      ".odc-open{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:54px;margin:10px 0 0;padding:12px 18px;background:" + P + ";color:" + PT + ";border:0;border-radius:" + R + ";font-family:var(--odc-bf);font-weight:var(--odc-bw);letter-spacing:var(--odc-bls);text-transform:var(--odc-btt);font-size:16px;line-height:1.2;cursor:pointer}" +
      ".odc-bico{display:inline-flex}.odc-bico svg{width:22px;height:22px}" +
      ".odc-open:hover{opacity:.9}" +
      ".odc-float{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:#fff;z-index:9998;box-shadow:0 -2px 12px rgba(0,0,0,.08)}" +
      ".odc-sticky{position:fixed;left:0;right:0;bottom:0;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:#fff;z-index:9998;box-shadow:0 -2px 12px rgba(0,0,0,.1)}" +
      ".odc-sticky .odc-open{margin:0}@media(min-width:990px){.odc-sticky{display:none}}" +
      ".odc-has-sticky body{padding-bottom:76px}" +
      ".odc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;font-family:inherit}" +
      ".odc-uplayer{z-index:2147483001;align-items:center;padding:16px}" +
      ".odc-modal{background:#fff;color:#111;width:100%;max-width:520px;max-height:94vh;overflow:auto;border-radius:max(var(--odc-r),6px) max(var(--odc-r),6px) 0 0;box-sizing:border-box;-webkit-overflow-scrolling:touch}" +
      ".odc-embed{margin-top:16px}.odc-embed .odc-modal{max-width:none;max-height:none;border:1px solid #e3e3e3;border-radius:" + R + "}" +
      "@media(min-width:640px){.odc-overlay{align-items:center}.odc-overlay .odc-modal{border-radius:var(--odc-r)}}" +
      ".odc-modal *,.odc-up *{box-sizing:border-box}" +
      ".odc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 12px;border-bottom:1px solid #eee;position:sticky;top:0;background:#fff;z-index:1}" +
      ".odc-htitle{font-family:var(--odc-hf);font-weight:var(--odc-hw);letter-spacing:var(--odc-hls);text-transform:var(--odc-htt);font-size:18px;line-height:1.3}" +
      ".odc-close{background:none;border:0;font-size:28px;line-height:1;width:40px;height:40px;cursor:pointer;color:#111}" +
      ".odc-form,.odc-thanks{padding:14px 16px 20px}" +
      ".odc-summary{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid #e8e8eb;border-radius:var(--odc-r)}" +
      ".odc-img{width:56px;height:56px;object-fit:cover;border-radius:6px;background:#f3f3f3;flex:none}" +
      ".odc-sinfo{flex:1;min-width:0}.odc-ptitle{font-weight:600;font-size:14px}.odc-vtitle{font-size:13px;color:#666}" +
      ".odc-price{font-weight:600;white-space:nowrap}" +
      ".odc-field{margin-top:12px}.odc-field label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}" +
      ".odc-input{width:100%;height:48px;padding:0 12px;border:1px solid #cbcbcb;border-radius:var(--odc-r);background:#f6f7fa;font:inherit;font-size:16px;color:#111}" +
      "textarea.odc-input{height:72px;padding:10px 12px}" +
      ".odc-input:focus{outline:2px solid " + P + ";outline-offset:1px}.odc-bad{border-color:#c0261d}" +
      ".odc-err{color:#c0261d;font-size:13px;margin-top:4px}.odc-formerr{margin-top:12px}" +
      ".odc-piece,.odc-pbox{margin-top:10px}.odc-pbox{padding:10px;border:1px dashed #d6d6d6;border-radius:8px}.odc-plabel{font-weight:600;font-size:13px;margin-bottom:4px}" +
      ".odc-opt{margin-top:8px}.odc-optname{font-family:var(--odc-hf);font-weight:var(--odc-hw);letter-spacing:var(--odc-hls);text-transform:var(--odc-htt);font-size:14px;margin-bottom:6px}" +
      ".odc-chips{display:flex;flex-wrap:wrap;gap:8px}" +
      ".odc-chip{min-width:44px;height:40px;padding:0 12px;border:1px solid #cbcbcb;background:#fff;border-radius:var(--odc-r);font:inherit;font-size:14px;cursor:pointer;color:#111}" +
      ".odc-chip.odc-sel{border-color:" + P + ";background:" + P + ";color:" + PT + "}.odc-chip.odc-out{opacity:.4;text-decoration:line-through}" +
      ".odc-qty{display:flex;align-items:center;justify-content:space-between}.odc-qty label{margin:0}" +
      ".odc-stepper{display:flex;align-items:center;border:1px solid #cbcbcb;border-radius:var(--odc-r)}" +
      ".odc-stepper button{width:44px;height:40px;background:none;border:0;font-size:20px;cursor:pointer;color:#111}.odc-qtyv{min-width:28px;text-align:center;font-weight:600}" +
      ".odc-tiers{display:flex;flex-direction:column;gap:8px;margin-top:8px}" +
      ".odc-tier{display:flex;align-items:center;gap:10px;width:100%;padding:12px;border:1.5px solid #d6d6d6;border-radius:var(--odc-r);background:#fff;font:inherit;font-size:14px;color:#111;cursor:pointer;text-align:start}" +
      ".odc-tier.odc-tsel{border-color:" + P + ";background:#fafafa}" +
      ".odc-radio{width:18px;height:18px;border:2px solid #999;border-radius:50%;flex:none}.odc-tsel .odc-radio{border:5px solid " + P + "}" +
      ".odc-tlabel{flex:1;font-weight:600}.odc-tprice{font-weight:700;white-space:nowrap}" +
      ".odc-badge{background:" + P + ";color:" + PT + ";font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap}" +
      ".odc-tick{display:flex;align-items:center;gap:10px;margin-top:10px;padding:12px;border:1.5px dashed #c9c9c9;border-radius:10px;font-size:14px;cursor:pointer}" +
      ".odc-tick span{flex:1}" +
      ".odc-cline{display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:14px}" +
      ".odc-promo{display:flex;gap:8px}.odc-promobtn{padding:0 16px;border:1px solid " + P + ";background:#fff;color:" + P + ";border-radius:var(--odc-r);font-family:var(--odc-bf);font-weight:var(--odc-bw);letter-spacing:var(--odc-bls);text-transform:var(--odc-btt);cursor:pointer}" +
      ".odc-totals{margin-top:14px;padding:12px 14px;background:#f1f1f1;border-radius:var(--odc-r);font-size:14px}" +
      ".odc-totals div{display:flex;justify-content:space-between;padding:3px 0}.odc-total{font-size:17px;border-top:1px solid #ddd;margin-top:6px;padding-top:8px!important}.odc-disc{color:#0a7a3d}" +
      ".odc-h2{margin-top:20px;font-family:var(--odc-hf);font-weight:var(--odc-hw);letter-spacing:var(--odc-hls);text-transform:var(--odc-htt);font-size:17px}.odc-center{text-align:center;font-size:19px}.odc-h1{font-family:var(--odc-hf);text-transform:var(--odc-htt);letter-spacing:var(--odc-hls);font-weight:700;font-size:20px;margin-bottom:8px}" +
      ".odc-check{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px;color:#444}" +
      ".odc-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}" +
      ".odc-submit{display:block;width:100%;min-height:54px;margin-top:16px;padding:14px;background:" + P + ";color:" + PT + ";border:0;border-radius:" + R + ";font-family:var(--odc-bf);font-weight:var(--odc-bw);letter-spacing:var(--odc-bls);text-transform:var(--odc-btt);font-size:16px;cursor:pointer}" +
      ".odc-req{color:#c0261d}" +
      // Releasit-style layout: icon in each field, label beside it on desktop.
      ".odc-row{display:grid;grid-template-columns:1fr;gap:6px}.odc-row label{margin:0}" +
      "@media(min-width:640px){.odc-icons .odc-row{grid-template-columns:130px 1fr;align-items:center;column-gap:14px}.odc-icons .odc-row .odc-err{grid-column:2}}" +
      ".odc-ig{display:flex;align-items:stretch;border:1px solid #cbcbcb;border-radius:var(--odc-r);overflow:hidden;background:#fff}" +
      ".odc-ig:focus-within{outline:2px solid " + P + ";outline-offset:1px}" +
      ".odc-ico{display:flex;align-items:center;justify-content:center;width:48px;flex:none;background:#f1f1f1;border-inline-end:1px solid #cbcbcb;color:#222}" +
      ".odc-ig .odc-input{border:0;border-radius:0;background:#fff;outline:none;min-width:0}" +
      ".odc-ig .odc-input.odc-bad{box-shadow:inset 0 0 0 1px #c0261d}" +
      ".odc-icons .odc-row label{font-size:15px}" +
      ".odc-ship{display:flex;align-items:center;gap:12px;margin-top:8px;padding:14px;border:1px solid #cbcbcb;border-radius:var(--odc-r);font-size:15px}" +
      ".odc-dot{width:18px;height:18px;border-radius:50%;border:5px solid " + P + ";flex:none}.odc-shipname{flex:1}" +
      ".odc-submit:disabled{opacity:.5;cursor:default}" +
      ".odc-up{background:#fff;color:#111;width:100%;max-width:420px;padding:22px 18px;border-radius:14px;text-align:center}" +
      ".odc-upimg{display:block;width:160px;height:160px;object-fit:cover;border-radius:10px;margin:8px auto}.odc-uptitle{font-weight:600;font-size:15px}" +
      ".odc-upold{color:#999;font-weight:400;margin-inline-end:8px;font-size:.8em}.odc-tickimg{width:40px;height:40px;object-fit:cover;border-radius:6px}" +
      ".odc-uptext{font-size:14px;color:#444;margin:6px 0}.odc-upprice{font-size:22px;font-weight:700;margin:10px 0}" +
      ".odc-decline{display:block;width:100%;margin-top:10px;background:none;border:0;color:#666;text-decoration:underline;font:inherit;font-size:14px;cursor:pointer}" +
      ".odc-note{margin-top:10px;font-size:12px;color:#666;text-align:center}.odc-thanks p{margin:6px 0;font-size:14px}" +
      "[dir=rtl] .odc-tier,[dir=rtl] .odc-field label{text-align:right}" +
      "[dir=rtl] .odc-tprice,[dir=rtl] .odc-price,[dir=rtl] .odc-totals span,[dir=rtl] .odc-totals strong,[dir=rtl] .odc-tick strong,[dir=rtl] .odc-upprice,[dir=rtl] .odc-cline span{direction:ltr;unicode-bidi:isolate}";
    document.head.appendChild(h("style", { text: css }));
  }
})();
