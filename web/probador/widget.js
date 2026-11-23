/* Botón "Pruébatelo" para cualquier página web.
   Uso: <script src="https://…/widget.js" data-tienda="mi-tienda" async></script>
   Abre el probador de la tienda en una ventana sobre la página. */
(function () {
  var s = document.currentScript || document.querySelector("script[data-tienda]");
  if (!s) return;
  var slug = s.getAttribute("data-tienda"), base = s.src.replace(/widget\.js.*$/, "");
  var color = s.getAttribute("data-color") || "#F08A12";
  var btn = document.createElement("button");
  btn.type = "button"; btn.textContent = s.getAttribute("data-texto") || "Pruébatelo";
  btn.setAttribute("style", "position:fixed;right:18px;bottom:18px;z-index:2147483000;min-height:48px;padding:12px 20px;border:0;border-radius:999px;background:" + color + ";color:#050F13;font:700 15px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);cursor:pointer");
  var wrap;
  btn.onclick = function () {
    if (wrap) return;
    wrap = document.createElement("div");
    wrap.setAttribute("style", "position:fixed;inset:0;z-index:2147483001;background:rgba(5,15,19,.6);display:flex;align-items:center;justify-content:center;padding:12px");
    var f = document.createElement("iframe");
    f.src = base + "#/t/" + encodeURIComponent(slug);
    f.allow = "camera"; f.title = "Probador virtual";
    f.setAttribute("style", "width:min(480px,100%);height:min(860px,100%);border:0;border-radius:18px;background:#050F13");
    var x = document.createElement("button");
    x.type = "button"; x.textContent = "Cerrar"; x.setAttribute("aria-label", "Cerrar probador");
    x.setAttribute("style", "position:absolute;top:14px;right:14px;min-height:44px;padding:8px 16px;border:0;border-radius:999px;background:#F3EEE4;color:#0E2A33;font:700 14px system-ui,sans-serif;cursor:pointer");
    x.onclick = function () { wrap.remove(); wrap = null; };
    wrap.appendChild(f); wrap.appendChild(x); document.body.appendChild(wrap);
  };
  (document.body ? Promise.resolve() : new Promise(function (r) { addEventListener("DOMContentLoaded", r); })).then(function () { document.body.appendChild(btn); });
})();
