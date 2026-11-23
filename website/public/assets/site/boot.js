/* Runs before first paint (a plain blocking script, no inline code under the CSP): the boot screen
   and entrance motion play on the first page of a session only. base.css removes the boot screen by
   itself, so nothing waits on the module scripts. */
(function () {
  var root = document.documentElement;
  var KEY = "carbon.seen";
  try {
    root.dataset.visit = sessionStorage.getItem(KEY) ? "return" : "first";
    sessionStorage.setItem(KEY, "1");
  } catch (e) {
    root.dataset.visit = "return";
  }
})();
