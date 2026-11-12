/* Odes \u2014 formulaire de commande avec paiement \u00e0 la livraison.
 * Loaded on the storefront; does nothing unless the product is enabled
 * server-side (COD_FORM_PRODUCTS). No dependencies. */
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
  if (!m || !SHOP) return;
  var handle = decodeURIComponent(m[1]);
  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";

  var product, cfg, state, els = {};
  var leadId = (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);

  Promise.all([
    fetch(API + "?shop=" + encodeURIComponent(SHOP) + "&handle=" + encodeURIComponent(handle)).then(function (r) { return r.json(); }),
    fetch(root + "products/" + encodeURIComponent(handle) + ".js").then(function (r) { return r.json(); }),
  ]).then(function (res) {
    cfg = res[0];
    product = res[1];
    if (!cfg.enabled || !product || !product.variants) return;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }).catch(function () {});

  function money(cents) {
    var v = cents / 100;
    return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)) + " dh";
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

  function fb(event, params, opts) {
    try {
      if (!window.fbq && cfg.pixelId) {
        /* Meta's standard base snippet */
        !(function (f, b, e, v, n, t, s) {
          if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
          if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
          t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
        })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
        window.fbq("init", cfg.pixelId);
      }
      if (window.fbq) window.fbq("track", event, params, opts);
    } catch (e) {}
  }

  function currentVariantId() {
    var q = new URLSearchParams(location.search).get("variant");
    if (q) return Number(q);
    var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
    return input && input.value ? Number(input.value) : null;
  }

  function variantFromOptions() {
    var vals = state.options;
    for (var i = 0; i < product.variants.length; i++) {
      var v = product.variants[i], ok = true;
      for (var j = 0; j < vals.length; j++) if (v.options[j] !== vals[j]) ok = false;
      if (ok) return v;
    }
    return null;
  }

  function mount() {
    injectCss();
    var form = document.querySelector('form[action*="/cart/add"]');
    var btn = h("button", { type: "button", class: "odc-open", text: "Commander \u2014 paiement \u00e0 la livraison", onclick: open });
    if (form && form.parentNode) form.parentNode.insertBefore(btn, form.nextSibling);
    else document.body.appendChild(h("div", { class: "odc-float" }, [btn]));
    document.documentElement.classList.add("odc-on");
  }

  function open() {
    var cur = product.variants.filter(function (v) { return v.id === currentVariantId(); })[0];
    var start = (cur && cur.available && cur) || product.variants.filter(function (v) { return v.available; })[0] || product.variants[0];
    state = { options: start.options.slice(), qty: 1, sending: false };
    build();
    document.body.appendChild(els.overlay);
    document.documentElement.style.overflow = "hidden";
    render();
    fb("InitiateCheckout", { content_ids: [String(start.id)], content_type: "product", value: start.price / 100, currency: "MAD" });
    setTimeout(function () { els.name.focus(); }, 50);
  }

  function close() {
    if (els.overlay && els.overlay.parentNode) els.overlay.parentNode.removeChild(els.overlay);
    document.documentElement.style.overflow = "";
  }

  function field(key, label, attrs) {
    var input = h("input", Object.assign({ class: "odc-input", id: "odc-" + key, name: key }, attrs));
    var err = h("div", { class: "odc-err", role: "alert" });
    els[key] = input;
    els[key + "Err"] = err;
    input.addEventListener("input", function () { err.textContent = ""; input.classList.remove("odc-bad"); });
    return h("div", { class: "odc-field" }, [h("label", { for: "odc-" + key, text: label }), input, err]);
  }

  function build() {
    var optionRows = product.options.length === 1 && product.variants.length === 1 ? [] : product.options.map(function (opt, idx) {
      var name = opt.name || opt;
      var values = [];
      product.variants.forEach(function (v) { if (values.indexOf(v.options[idx]) < 0) values.push(v.options[idx]); });
      var wrap = h("div", { class: "odc-chips", "data-idx": String(idx) });
      values.forEach(function (val) {
        wrap.appendChild(h("button", { type: "button", class: "odc-chip", "data-val": val, text: val, onclick: function () { state.options[idx] = val; render(); } }));
      });
      return h("div", { class: "odc-field" }, [h("label", { text: name }), wrap]);
    });
    els.optionRows = optionRows;
    els.img = h("img", { class: "odc-img", alt: "" });
    els.title = h("div", { class: "odc-ptitle", text: product.title });
    els.vtitle = h("div", { class: "odc-vtitle" });
    els.price = h("div", { class: "odc-price" });
    els.qty = h("span", { class: "odc-qtyv", text: "1" });
    els.stock = h("div", { class: "odc-err", role: "alert" });
    els.total = h("strong", {});
    els.submit = h("button", { type: "submit", class: "odc-submit" });
    els.formErr = h("div", { class: "odc-err odc-formerr", role: "alert" });
    els.news = h("input", { type: "checkbox", id: "odc-news" });
    var hp = h("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", class: "odc-hp", "aria-hidden": "true" });
    els.hp = hp;

    var formEl = h("form", { class: "odc-form", novalidate: "novalidate", onsubmit: submit }, [
      h("div", { class: "odc-summary" }, [els.img, h("div", { class: "odc-sinfo" }, [els.title, els.vtitle]), els.price]),
    ].concat(optionRows, [
      h("div", { class: "odc-field odc-qty" }, [
        h("label", { text: "Quantit\u00e9" }),
        h("div", { class: "odc-stepper" }, [
          h("button", { type: "button", "aria-label": "Moins", text: "\u2212", onclick: function () { state.qty = Math.max(1, state.qty - 1); render(); } }),
          els.qty,
          h("button", { type: "button", "aria-label": "Plus", text: "+", onclick: function () { state.qty = Math.min(10, state.qty + 1); render(); } }),
        ]),
      ]),
      els.stock,
      h("div", { class: "odc-totals" }, [
        h("div", {}, [h("span", { text: "Livraison" }), h("span", { text: "Gratuite" })]),
        h("div", { class: "odc-total" }, [h("span", { text: "Total" }), els.total]),
      ]),
      h("div", { class: "odc-h2", text: "Votre adresse de livraison" }),
      field("name", "Nom", { type: "text", autocomplete: "name", required: "required", maxlength: "80" }),
      field("phone", "T\u00e9l\u00e9phone", { type: "tel", inputmode: "tel", autocomplete: "tel", required: "required", placeholder: "06 XX XX XX XX", maxlength: "20" }),
      field("city", "Ville", { type: "text", autocomplete: "address-level2", required: "required", maxlength: "80" }),
      field("address", "Adresse", { type: "text", autocomplete: "street-address", required: "required", maxlength: "200" }),
      hp,
      h("label", { class: "odc-check", for: "odc-news" }, [els.news, h("span", { text: "Recevoir les nouveaut\u00e9s et offres" })]),
      els.formErr,
      els.submit,
      h("div", { class: "odc-note", text: "Vous payez \u00e0 la r\u00e9ception. Livraison en 24 \u00e0 72 h partout au Maroc." }),
    ]));
    els.phone.addEventListener("blur", sendLead);

    els.overlay = h("div", { class: "odc-overlay", onclick: function (e) { if (e.target === els.overlay) close(); } }, [
      h("div", { class: "odc-modal", role: "dialog", "aria-modal": "true", "aria-label": "Commande avec paiement \u00e0 la livraison" }, [
        h("div", { class: "odc-head" }, [
          h("div", { class: "odc-htitle", text: "Commande avec paiement \u00e0 la livraison" }),
          h("button", { type: "button", class: "odc-close", "aria-label": "Fermer", text: "\u00d7", onclick: close }),
        ]),
        formEl,
      ]),
    ]);
    els.overlay.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  function render() {
    var v = variantFromOptions();
    state.variant = v;
    els.optionRows.forEach(function (row) {
      var wrap = row.querySelector(".odc-chips"), idx = Number(wrap.getAttribute("data-idx"));
      Array.prototype.forEach.call(wrap.children, function (chip) {
        var val = chip.getAttribute("data-val");
        var probe = state.options.slice(); probe[idx] = val;
        var match = product.variants.filter(function (x) { return x.options.every(function (o, j) { return o === probe[j]; }); })[0];
        chip.classList.toggle("odc-sel", state.options[idx] === val);
        chip.classList.toggle("odc-out", !match || !match.available);
      });
    });
    var ok = v && v.available;
    var unit = v ? v.price : 0;
    var img = (v && v.featured_image && v.featured_image.src) || product.featured_image || "";
    if (img) els.img.src = String(img).replace(/(\.[a-z]+)(\?|$)/i, "_160x$1$2");
    els.vtitle.textContent = v && product.variants.length > 1 ? v.title : "";
    els.price.textContent = money(unit);
    els.qty.textContent = String(state.qty);
    els.total.textContent = money(unit * state.qty);
    els.stock.textContent = ok ? "" : "Cette option est en rupture de stock.";
    els.submit.disabled = !ok || state.sending;
    els.submit.textContent = state.sending ? "Envoi en cours\u2026" : "Terminez votre achat \u2014 " + money(unit * state.qty);
  }

  /* Meta cookies for the server-side Purchase (matched to the ad click). */
  function cookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function fbc() {
    var c = cookie("_fbc");
    if (c) return c;
    var id = new URLSearchParams(location.search).get("fbclid") || (utm && utm.fbclid);
    return id ? "fb.1." + Date.now() + "." + id : "";
  }

  function payload(action) {
    return {
      fbp: cookie("_fbp"),
      fbc: fbc(),
      action: action,
      shop: SHOP,
      leadId: leadId,
      name: els.name.value,
      phone: els.phone.value,
      city: els.city.value,
      address: els.address.value,
      newsletter: els.news.checked,
      website: els.hp.value,
      items: state.variant ? [{ variantId: String(state.variant.id), quantity: state.qty }] : [],
      utm: utm,
      pageUrl: location.origin + location.pathname,
    };
  }

  var lastLead = "";
  function sendLead() {
    var digits = els.phone.value.replace(/\D/g, "");
    if (digits.length < 9 || !state.variant || state.sending || state.done) return;
    var key = digits + "|" + els.name.value;
    if (key === lastLead) return;
    lastLead = key;
    try {
      fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload("lead")), keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  function showErr(fieldName, message) {
    var input = els[fieldName], err = els[fieldName + "Err"];
    if (input && err) {
      err.textContent = message;
      input.classList.add("odc-bad");
      input.focus();
    } else {
      els.formErr.textContent = message;
    }
  }

  function submit(e) {
    e.preventDefault();
    if (state.sending || !state.variant) return;
    els.formErr.textContent = "";
    var checks = [
      ["name", els.name.value.trim().length >= 2, "Indiquez votre nom."],
      ["phone", /^(?:\+?212|00212|0)?0?[5-8]\d{8}$/.test(els.phone.value.replace(/[^\d+]/g, "")), "Ins\u00e9rez un num\u00e9ro de t\u00e9l\u00e9phone valide."],
      ["city", els.city.value.trim().length >= 2, "Indiquez votre ville."],
      ["address", els.address.value.trim().length >= 3, "Indiquez votre adresse."],
    ];
    for (var i = 0; i < checks.length; i++) if (!checks[i][1]) return showErr(checks[i][0], checks[i][2]);

    state.sending = true;
    render();
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload("order")) })
      .then(function (r) { return r.json().then(function (j) { return j; }, function () { return { ok: false }; }); })
      .then(function (j) {
        if (!j.ok) {
          state.sending = false;
          render();
          return showErr(j.field || "form", j.message || "La commande n'a pas pu \u00eatre enregistr\u00e9e. R\u00e9essayez.");
        }
        state.done = true;
        fb("Purchase", {
          value: j.total, currency: j.currency || "MAD", content_type: "product",
          content_ids: [String(state.variant.id)], num_items: state.qty,
        }, { eventID: "odc_" + j.orderName });
        thanks(j);
      })
      .catch(function () {
        state.sending = false;
        render();
        showErr("form", "Connexion interrompue. V\u00e9rifiez votre r\u00e9seau et r\u00e9essayez.");
      });
  }

  function thanks(j) {
    if (cfg.thankYouUrl) {
      setTimeout(function () { location.href = cfg.thankYouUrl; }, 600);
    }
    var modal = els.overlay.querySelector(".odc-modal");
    modal.replaceChild(
      h("div", { class: "odc-thanks" }, [
        h("div", { class: "odc-h1", text: "Merci, votre commande est enregistr\u00e9e." }),
        h("p", { text: "Commande " + j.orderName + " \u2014 " + money(Math.round(j.total * 100)) + " \u00e0 payer \u00e0 la livraison." }),
        h("p", { text: "Nous vous appelons pour confirmer avant l'exp\u00e9dition." }),
        h("button", { type: "button", class: "odc-submit", text: "Fermer", onclick: close }),
      ]),
      modal.querySelector(".odc-form")
    );
  }

  function injectCss() {
    var css =
      ".odc-open{display:block;width:100%;margin:10px 0 0;padding:15px 18px;background:#000;color:#fff;border:0;border-radius:0;font:inherit;font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:13px;cursor:pointer}" +
      ".odc-open:hover{background:#222}" +
      ".odc-float{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:#fff;z-index:9998;box-shadow:0 -2px 12px rgba(0,0,0,.08)}" +
      ".odc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;font-family:inherit}" +
      ".odc-modal{background:#fff;color:#111;width:100%;max-width:480px;max-height:94vh;overflow:auto;border-radius:14px 14px 0 0;box-sizing:border-box;-webkit-overflow-scrolling:touch}" +
      "@media(min-width:640px){.odc-overlay{align-items:center}.odc-modal{border-radius:10px}}" +
      ".odc-modal *{box-sizing:border-box}" +
      ".odc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 12px;border-bottom:1px solid #eee;position:sticky;top:0;background:#fff;z-index:1}" +
      ".odc-htitle{font-weight:600;font-size:16px;line-height:1.3}" +
      ".odc-close{background:none;border:0;font-size:28px;line-height:1;width:40px;height:40px;cursor:pointer;color:#111}" +
      ".odc-form,.odc-thanks{padding:14px 16px 20px}" +
      ".odc-summary{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid #e8e8eb;border-radius:8px}" +
      ".odc-img{width:56px;height:56px;object-fit:cover;border-radius:6px;background:#f3f3f3;flex:none}" +
      ".odc-sinfo{flex:1;min-width:0}.odc-ptitle{font-weight:600;font-size:14px}.odc-vtitle{font-size:13px;color:#666}" +
      ".odc-price{font-weight:600;white-space:nowrap}" +
      ".odc-field{margin-top:12px}.odc-field label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}" +
      ".odc-input{width:100%;height:46px;padding:0 12px;border:1px solid #cbcbcb;border-radius:9px;background:#f6f7fa;font:inherit;font-size:16px;color:#111}" +
      ".odc-input:focus{outline:2px solid #111;outline-offset:1px}.odc-bad{border-color:#c0261d}" +
      ".odc-err{color:#c0261d;font-size:13px;margin-top:4px;min-height:0}.odc-formerr{margin-top:12px}" +
      ".odc-chips{display:flex;flex-wrap:wrap;gap:8px}" +
      ".odc-chip{min-width:44px;height:40px;padding:0 12px;border:1px solid #cbcbcb;background:#fff;border-radius:8px;font:inherit;font-size:14px;cursor:pointer;color:#111}" +
      ".odc-chip.odc-sel{border-color:#000;background:#000;color:#fff}.odc-chip.odc-out{opacity:.4;text-decoration:line-through}" +
      ".odc-qty{display:flex;align-items:center;justify-content:space-between}.odc-qty label{margin:0}" +
      ".odc-stepper{display:flex;align-items:center;border:1px solid #cbcbcb;border-radius:8px}" +
      ".odc-stepper button{width:44px;height:40px;background:none;border:0;font-size:20px;cursor:pointer;color:#111}.odc-qtyv{min-width:28px;text-align:center;font-weight:600}" +
      ".odc-totals{margin-top:12px;padding:10px 12px;background:#f1f1f1;border-radius:8px;font-size:14px}" +
      ".odc-totals div{display:flex;justify-content:space-between;padding:3px 0}.odc-total{font-size:16px}" +
      ".odc-h2{margin-top:18px;font-weight:600;font-size:15px}.odc-h1{font-weight:700;font-size:18px;margin-bottom:8px}" +
      ".odc-check{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px;color:#444}" +
      ".odc-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}" +
      ".odc-submit{display:block;width:100%;margin-top:16px;padding:16px;background:#000;color:#fff;border:2px solid #000;border-radius:24px;font:inherit;font-weight:600;font-size:15px;cursor:pointer}" +
      ".odc-submit:disabled{opacity:.5;cursor:default}" +
      ".odc-note{margin-top:10px;font-size:12px;color:#666;text-align:center}.odc-thanks p{margin:6px 0;font-size:14px}";
    document.head.appendChild(h("style", { text: css }));
  }
})();
