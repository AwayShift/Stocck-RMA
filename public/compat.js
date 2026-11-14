/* Compatibility patch for browser extensions and test runners (e.g. TestSprite) */
(function() {
  try {
    var nativeFetch = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null;
    var currentFetch = nativeFetch;
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      enumerable: true,
      get: function() {
        return currentFetch;
      },
      set: function(fn) {
        currentFetch = fn;
      }
    });
  } catch (e) {
    try {
      if (typeof Window !== 'undefined' && Window.prototype) {
        var protoDesc = Object.getOwnPropertyDescriptor(Window.prototype, 'fetch');
        if (protoDesc && !protoDesc.set) {
          var pf = protoDesc.get ? protoDesc.get.call(window) : window.fetch;
          Object.defineProperty(Window.prototype, 'fetch', {
            configurable: true,
            enumerable: true,
            get: function() { return pf; },
            set: function(fn) { pf = fn; }
          });
        }
      }
    } catch (err) {}
  }
})();

/* Safe guard for preventDefault inside passive/uncancelable event listeners */
(function() {
  try {
    var origPreventDefault = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function() {
      if (!this.cancelable) {
        return;
      }
      return origPreventDefault.apply(this, arguments);
    };
  } catch (e) {}
})();
