// Checks sessionStorage for pending page transition flag on early head load

    (function () {
      try {
        var raw = sessionStorage.getItem('nudot:page-transition');
        if (!raw) return;
        var payload = JSON.parse(raw);
        if (payload && payload.at && Date.now() - payload.at < 12000) {
          document.documentElement.classList.add('has-pending-page-transition');
        }
      } catch (error) { }
    })();
